"""Servicio para ejecutar el motor Buscador desde el backend."""

from __future__ import annotations

import asyncio
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal
from urllib.parse import urlparse

from app.core.logging import get_logger
from app.services.buscador_control import BuscadorJobControl

LOG = get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
BUSCADOR_ROOT = REPO_ROOT / "buscador"
if BUSCADOR_ROOT.exists():
    sys.path.insert(0, str(BUSCADOR_ROOT))
    sys.path.insert(0, str(REPO_ROOT))
else:  # pragma: no cover - fallback log
    LOG.warning("buscador.path_missing", extra={"expected": str(BUSCADOR_ROOT)})

try:
    from buscador.core.contact_extractor import ContactContextExtractor
    from buscador.core.extractor import EmailExtractor
    from buscador.core.fetcher import HttpFetcher
    from buscador.scrapers.demo_site import DemoSiteScraper
    from buscador.scrapers.domain_crawler import create_domain_crawler
    from buscador.scrapers.simple_site import SimpleSiteScraper
except Exception as exc:  # pragma: no cover - import guard
    raise RuntimeError("No es posible importar el módulo buscador") from exc


class BuscadorRunnerError(Exception):
    """Errores al configurar o ejecutar el Buscador."""


@dataclass(slots=True)
class BuscadorParams:
    sitio: Literal["demo", "simple", "domain"]
    url: str | None = None
    mode: Literal["generic", "government", "intelligent", "auto", "stealth"] = "generic"
    max_pages: int = 200
    max_depth: int = 3
    max_workers: int = 3
    max_runtime: int | None = None
    max_queue_size: int | None = None
    max_no_new_emails: int | None = None
    max_memory_mb: int | None = None
    seed_urls: list[str] | None = None
    skip_urls: list[str] | None = None
    resume_job_id: str | None = None

    def ensure_valid(self) -> None:
        if self.sitio in {"simple", "domain"} and not self.url:
            raise BuscadorRunnerError("Debes proporcionar una URL para el sitio seleccionado.")
        if self.sitio == "domain" and not self.url:
            raise BuscadorRunnerError("Para sitio=domain se requiere --url.")


@dataclass(slots=True)
class BuscadorRunResult:
    results: list[dict[str, Any]]
    duration_ms: int
    stats: dict[str, Any]
    stop_reason: Literal["paused", "canceled"] | None = None


async def run_buscador(
    params: BuscadorParams,
    control: BuscadorJobControl | None = None,
) -> BuscadorRunResult:
    """Ejecuta el scraper en un hilo aparte para no bloquear el loop."""

    params.ensure_valid()

    return await asyncio.to_thread(_run_buscador_sync, params, control)


STEALTH_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def _run_buscador_sync(
    params: BuscadorParams,
    control: BuscadorJobControl | None = None,
) -> BuscadorRunResult:
    if params.mode == "stealth":
        fetcher = HttpFetcher(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            default_headers=STEALTH_HEADERS,
            use_cloudscraper=True,
            min_interval_per_host=0.3,
        )
    else:
        fetcher = HttpFetcher(min_interval_per_host=0.25)
    email_extractor = EmailExtractor()
    contact_extractor = ContactContextExtractor()

    stop_callback: Callable[[], str | None] | None = None
    if control is not None:
        stop_callback = control.check_stop

    scraper = _build_scraper(
        params,
        fetcher,
        email_extractor,
        contact_extractor,
        stop_callback=stop_callback,
    )
    start_time = time.perf_counter()

    try:
        raw_results = scraper.run()
    except Exception as exc:  # pragma: no cover - propagamos como error controlado
        LOG.exception("buscador.run_error", extra={"sitio": params.sitio, "url": params.url})
        raise BuscadorRunnerError(str(exc)) from exc

    duration_ms = int((time.perf_counter() - start_time) * 1000)
    normalized = _normalize_results(raw_results)
    stats = _summarize_results(normalized)
    crawl_metrics = getattr(scraper, "metrics", None)
    if isinstance(crawl_metrics, dict):
        stats["crawl_metrics"] = crawl_metrics
    checkpoint = getattr(scraper, "checkpoint", None)
    if isinstance(checkpoint, dict):
        stats["checkpoint"] = checkpoint

    stop_reason = getattr(scraper, "stop_reason", None)
    if not stop_reason and control is not None:
        stop_reason = control.stop_reason

    return BuscadorRunResult(
        results=normalized,
        duration_ms=duration_ms,
        stats=stats,
        stop_reason=stop_reason,
    )


def _build_scraper(
    params: BuscadorParams,
    fetcher: HttpFetcher,
    email_extractor: EmailExtractor,
    contact_extractor: ContactContextExtractor,
    *,
    stop_callback: Callable[[], str | None] | None = None,
):
    if params.sitio == "demo":
        return DemoSiteScraper(fetcher=fetcher, email_extractor=email_extractor)

    if params.sitio == "simple":
        return SimpleSiteScraper(
            fetcher=fetcher, email_extractor=email_extractor, start_url=params.url or ""
        )

    if params.sitio == "domain":
        return create_domain_crawler(
            mode=params.mode,
            fetcher=fetcher,
            extractor=email_extractor,
            contact_extractor=contact_extractor,
            start_url=params.url or "",
            max_pages=params.max_pages,
            max_depth=params.max_depth,
            max_workers=max(1, min(int(params.max_workers or 1), 5)),
            max_runtime_sec=params.max_runtime,
            max_queue_size=params.max_queue_size,
            max_no_new_emails=params.max_no_new_emails,
            max_memory_mb=params.max_memory_mb,
            seed_urls=params.seed_urls or [],
            skip_urls=params.skip_urls or [],
            stop_callback=stop_callback,
        )

    raise BuscadorRunnerError(f"Tipo de sitio no soportado: {params.sitio}")


def _normalize_results(raw_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_emails: set[str] = set()

    def _normalize_email(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        trimmed = value.strip().lower()
        return trimmed or None

    for item in raw_results:
        source_url = item.get("source_url")
        email = _normalize_email(item.get("email"))
        if not source_url or not email:
            continue
        if email in seen_emails:
            continue
        seen_emails.add(email)

        normalized.append(
            {
                "source_url": source_url,
                "email": email,
                "name": item.get("name"),
                "position": item.get("position"),
                "phone": item.get("phone"),
                "extension": item.get("extension"),
                "address": item.get("address"),
            }
        )

    return normalized


def _summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    email_domains: Counter[str] = Counter()
    source_hosts: Counter[str] = Counter()

    for item in results:
        email = item.get("email")
        if email and "@" in email:
            domain = email.split("@", 1)[1].lower()
            email_domains[domain] += 1

        source_url = item.get("source_url")
        if source_url:
            host = urlparse(source_url).netloc.lower()
            if host:
                source_hosts[host] += 1

    return {
        "emails_total": len(results),
        "unique_email_domains": len(email_domains),
        "unique_source_hosts": len(source_hosts),
        "top_email_domains": [
            {"domain": domain, "count": count} for domain, count in email_domains.most_common(5)
        ],
        "top_source_hosts": [
            {"host": host, "count": count} for host, count in source_hosts.most_common(5)
        ],
    }
