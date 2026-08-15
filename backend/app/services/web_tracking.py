"""Validaciones puras para el collector público de tracking web."""

from __future__ import annotations

from dataclasses import dataclass
from html import unescape
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx


PUBLIC_SITE_ID_PATTERN = re.compile(r"^talia_site_[a-z0-9][a-z0-9_-]{5,127}$")
HTML_QUERY_SEPARATOR_PATTERN = re.compile(r"&(?:(?:amp|#38);?)?%3[bB]", re.IGNORECASE)
DEDUPLICATED_TRACKING_QUERY_KEYS = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "kw",
        "cid",
        "tid",
        "eid",
        "pid",
    }
)


def normalize_tracking_url(value: str | None) -> str | None:
    """Normaliza URLs recibidas desde enlaces HTML sin alterar sus parámetros.

    Algunos enlaces de correo llegan con separadores codificados como
    ``&amp%3B``. Se corrige únicamente esa entidad de separador y se
    conserva el resto de la URL, incluidos valores UTM codificados.
    """

    candidate = str(value or "").strip()
    if not candidate:
        return None

    normalized = unescape(candidate)
    normalized = HTML_QUERY_SEPARATOR_PATTERN.sub("&", normalized)
    try:
        parsed = urlparse(normalized)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    except ValueError:
        return normalized or None

    seen_tracking_keys: set[str] = set()
    deduplicated_pairs: list[tuple[str, str]] = []
    for key, query_value in query_pairs:
        normalized_key = key.lower()
        if normalized_key in DEDUPLICATED_TRACKING_QUERY_KEYS:
            if normalized_key in seen_tracking_keys:
                continue
            seen_tracking_keys.add(normalized_key)
        deduplicated_pairs.append((key, query_value))

    if len(deduplicated_pairs) == len(query_pairs):
        return normalized or None

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(deduplicated_pairs, doseq=True),
            parsed.fragment,
        )
    )


def normalize_public_site_id(value: str | None) -> str | None:
    candidate = str(value or "").strip().lower()
    if not candidate or not PUBLIC_SITE_ID_PATTERN.fullmatch(candidate):
        return None
    return candidate


def normalize_tracking_domain(value: str | None) -> str | None:
    """Normaliza un hostname de Origin/Referer, sin aceptar rutas ni credenciales."""

    raw = str(value or "").strip()
    if not raw:
        return None

    candidate = raw
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        return None

    hostname = (parsed.hostname or "").strip().rstrip(".").lower()
    if not hostname:
        return None
    try:
        hostname = hostname.encode("idna").decode("ascii")
    except UnicodeError:
        return None
    if len(hostname) > 253 or "." not in hostname:
        return None
    if any(
        part == ""
        or len(part) > 63
        or part.startswith("-")
        or part.endswith("-")
        for part in hostname.split(".")
    ):
        return None
    if not re.fullmatch(r"[a-z0-9.-]+", hostname):
        return None
    return hostname


def request_tracking_domain(*, origin: str | None, referer: str | None) -> str | None:
    """Obtiene el sitio que originó el evento; Origin tiene precedencia."""

    return normalize_tracking_domain(origin) or normalize_tracking_domain(referer)


@dataclass(frozen=True)
class DnsVerificationResult:
    verified: bool
    error_code: str | None = None
    error_message: str | None = None


async def verify_dns_txt(*, domain: str, expected_token: str) -> DnsVerificationResult:
    """Comprueba el TXT `_talia-verification` mediante DNS-over-HTTPS."""

    record_name = f"_talia-verification.{domain}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": record_name, "type": "TXT"},
                headers={"Accept": "application/dns-json"},
            )
    except httpx.RequestError:
        return DnsVerificationResult(
            verified=False,
            error_code="dns_provider_unreachable",
            error_message="No se pudo consultar el proveedor DNS.",
        )

    if response.status_code != 200:
        return DnsVerificationResult(
            verified=False,
            error_code="dns_provider_error",
            error_message="El proveedor DNS respondió con error.",
        )

    try:
        payload = response.json()
    except ValueError:
        return DnsVerificationResult(
            verified=False,
            error_code="dns_response_invalid",
            error_message="La respuesta DNS no tuvo un formato válido.",
        )

    answers = payload.get("Answer") if isinstance(payload, dict) else None
    values: list[str] = []
    if isinstance(answers, list):
        for answer in answers:
            if not isinstance(answer, dict) or answer.get("type") != 16:
                continue
            data = answer.get("data")
            if isinstance(data, str):
                values.append(data.replace('"', "").strip())

    if expected_token in values:
        return DnsVerificationResult(verified=True)
    if not values:
        return DnsVerificationResult(
            verified=False,
            error_code="verification_record_not_found",
            error_message=f"No se encontró el TXT {record_name}.",
        )
    return DnsVerificationResult(
        verified=False,
        error_code="verification_token_mismatch",
        error_message="El TXT existe, pero su valor no coincide con el desafío generado.",
    )
