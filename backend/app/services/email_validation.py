"""Validación de correos electrónicos (formato + DNS/MX + conexión SMTP opcional).

Notas:
- Esta validación NO envía correo.
- Para evitar comportamiento tipo "email verification" agresivo, no ejecutamos VRFY,
  RCPT TO ni verificación de buzón. Sólo intentamos conectar y hacer EHLO/QUIT.
"""

from __future__ import annotations

import asyncio
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import dns.exception
import dns.resolver
import httpx
from email_validator import EmailNotValidError, validate_email

from app.core.config import settings


EmailLookupStatus = Literal["pendiente", "sin_email", "valido", "invalido", "dudoso", "error"]
EmailQualityTier = Literal["alta", "media", "baja"]

PUBLIC_DNS_NAMESERVERS = ("1.1.1.1", "8.8.8.8")


@dataclass(frozen=True)
class EmailLookupResult:
    status: EmailLookupStatus
    normalized_email: str | None = None
    error: str | None = None
    details: dict[str, Any] | None = None
    checked_at: datetime | None = None


DISPOSABLE_DOMAINS_PATH = Path(__file__).resolve().parent.parent / "data" / "disposable_email_domains.txt"

NO_CONTACT_LOCAL_PARTS = {
    "noreply",
    "donotreply",
    "mailerdaemon",
    "postmaster",
    "bounce",
    "bounces",
}

ROLE_BASED_LOCAL_PARTS = {
    "info",
    "ventas",
    "sales",
    "contact",
    "support",
    "admin",
    "billing",
    "hello",
    "servicio",
    "atencion",
    "rh",
    "jobs",
    "marketing",
}

LOW_QUALITY_ROLE_LOCAL_PARTS = {
    "admin",
    "support",
    "soporte",
    "billing",
    "marketing",
    "rh",
    "jobs",
}

MEDIUM_QUALITY_ROLE_LOCAL_PARTS = {
    "contacto",
    "contact",
    "ventas",
    "sales",
    "info",
    "hello",
    "servicio",
    "atencion",
}

PLACEHOLDER_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
    "test.com",
    "invalid",
    "localhost",
}

DOMAIN_TYPO_SUGGESTIONS = {
    "gmial.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gmail.con": "gmail.com",
    "hotmial.com": "hotmail.com",
    "hotmal.com": "hotmail.com",
    "outlok.com": "outlook.com",
    "outlook.con": "outlook.com",
    "yaho.com": "yahoo.com",
    "yahoo.con": "yahoo.com",
}


@lru_cache(maxsize=1)
def _load_disposable_domains() -> set[str]:
    if settings.supabase_url and settings.supabase_service_role:
        try:
            url = f"{settings.supabase_url.rstrip('/')}/rest/v1/disposable_email_domains"
            headers = {
                "apikey": settings.supabase_service_role,
                "Authorization": f"Bearer {settings.supabase_service_role}",
                "Accept": "application/json",
            }
            params = {
                "select": "domain",
                "activo": "eq.true",
                "limit": "50000",
            }
            with httpx.Client(timeout=20.0) as client:
                resp = client.get(url, headers=headers, params=params)
            if resp.status_code < 400:
                payload = resp.json()
                if isinstance(payload, list):
                    db_domains = {
                        str(row.get("domain") or "").strip().lower()
                        for row in payload
                        if isinstance(row, dict)
                    }
                    db_domains = {d for d in db_domains if d and " " not in d}
                    if db_domains:
                        return db_domains
        except Exception:
            # Fallback local best-effort.
            pass

    domains: set[str] = set()
    try:
        if DISPOSABLE_DOMAINS_PATH.exists():
            for raw in DISPOSABLE_DOMAINS_PATH.read_text(encoding="utf-8").splitlines():
                value = raw.strip().lower()
                if not value or value.startswith("#"):
                    continue
                domains.add(value)
    except OSError:
        # Best-effort: si el archivo falla no bloqueamos el flujo.
        return set()
    return domains


def _canonicalize_local_part(value: str) -> str:
    """Normaliza para matching de reglas: quita tags (+) y símbolos comunes."""

    local = (value or "").strip().lower()
    if not local:
        return ""
    if "+" in local:
        local = local.split("+", 1)[0]
    cleaned = []
    for ch in local:
        if ch.isalnum():
            cleaned.append(ch)
    return "".join(cleaned)


def _infer_quality_tier(*, canonical_local: str) -> EmailQualityTier:
    if canonical_local in LOW_QUALITY_ROLE_LOCAL_PARTS:
        return "baja"
    if canonical_local in MEDIUM_QUALITY_ROLE_LOCAL_PARTS:
        return "media"
    if canonical_local in ROLE_BASED_LOCAL_PARTS:
        # Default role-based.
        return "media"
    return "alta"


def _build_dns_resolver() -> dns.resolver.Resolver:
    resolver = dns.resolver.Resolver(configure=True)
    # Tiempos acotados: esta validación se usa en lote.
    resolver.timeout = 2.0
    resolver.lifetime = 4.0
    return resolver


def _build_public_dns_resolver() -> dns.resolver.Resolver:
    resolver = dns.resolver.Resolver(configure=False)
    resolver.nameservers = list(PUBLIC_DNS_NAMESERVERS)
    resolver.timeout = 2.0
    resolver.lifetime = 4.0
    return resolver


def _resolve_mx(domain: str, *, resolver: dns.resolver.Resolver) -> tuple[list[dict[str, Any]], str | None]:
    try:
        answers = resolver.resolve(domain, "MX")
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN) as exc:
        return [], exc.__class__.__name__
    except (dns.exception.Timeout, dns.resolver.NoNameservers) as exc:
        # DNS flakey => no lo marcamos como inválido definitivo.
        return [], exc.__class__.__name__

    mx: list[dict[str, Any]] = []
    for rr in answers:
        try:
            preference = int(getattr(rr, "preference", 0))
        except (TypeError, ValueError):
            preference = 0
        exchange = str(getattr(rr, "exchange", "")).rstrip(".").lower()
        if not exchange:
            continue
        mx.append({"preference": preference, "host": exchange})
    mx.sort(key=lambda row: (row.get("preference", 0), row.get("host", "")))
    return mx, None


def _resolve_a_aaaa(domain: str, *, resolver: dns.resolver.Resolver) -> dict[str, Any]:
    result = {"a": False, "aaaa": False, "error": None}
    try:
        resolver.resolve(domain, "A")
        result["a"] = True
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        pass
    except (dns.exception.Timeout, dns.resolver.NoNameservers) as exc:
        result["error"] = exc.__class__.__name__
        return result

    try:
        resolver.resolve(domain, "AAAA")
        result["aaaa"] = True
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        pass
    except (dns.exception.Timeout, dns.resolver.NoNameservers) as exc:
        result["error"] = exc.__class__.__name__
    return result


def _resolve_dns_with_fallback(domain: str) -> tuple[list[dict[str, Any]], str | None, dict[str, Any], dict[str, Any]]:
    """Resuelve MX y A/AAAA; si el resolver del sistema devuelve NXDOMAIN, reintenta con DNS públicos.

    Esto reduce falsos negativos cuando el DNS del host está filtrando o fallando.
    """

    system_resolver = _build_dns_resolver()
    mx_records, mx_error = _resolve_mx(domain, resolver=system_resolver)
    a_aaaa = _resolve_a_aaaa(domain, resolver=system_resolver)

    meta: dict[str, Any] = {
        "dns_fallback_used": False,
        "dns_inconsistent": False,
        "system_mx_error": mx_error,
        "system_a_aaaa_error": a_aaaa.get("error"),
        "public_nameservers": list(PUBLIC_DNS_NAMESERVERS),
    }

    if mx_error == "NXDOMAIN":
        meta["dns_fallback_used"] = True
        public_resolver = _build_public_dns_resolver()
        public_mx, public_mx_error = _resolve_mx(domain, resolver=public_resolver)
        public_a_aaaa = _resolve_a_aaaa(domain, resolver=public_resolver)

        meta["public_mx_error"] = public_mx_error
        meta["public_a_aaaa_error"] = public_a_aaaa.get("error")

        # Si DNS público contradice NXDOMAIN, marcamos inconsistencia y usamos el resultado público.
        if public_mx_error != "NXDOMAIN" or public_mx or public_a_aaaa.get("a") or public_a_aaaa.get("aaaa"):
            meta["dns_inconsistent"] = True
            mx_records, mx_error = public_mx, public_mx_error
            a_aaaa = public_a_aaaa

    return mx_records, mx_error, a_aaaa, meta


def _smtp_connect(host: str, port: int, timeout_seconds: float) -> tuple[bool, dict[str, Any]]:
    """Conecta a SMTP, envía EHLO y cierra. Sin RCPT/VRFY."""

    import smtplib

    details: dict[str, Any] = {"host": host, "port": port, "ok": False, "code": None, "message": None, "error": None}
    try:
        # Algunos MX sólo aceptan TLS vía STARTTLS; igualmente un banner 220 ya
        # indica que el host responde como SMTP.
        with smtplib.SMTP(host, port, timeout=timeout_seconds) as server:
            server.set_debuglevel(0)
            code, message = server.connect(host, port)
            details["code"] = int(code) if code is not None else None
            try:
                details["message"] = message.decode(errors="ignore") if isinstance(message, (bytes, bytearray)) else str(message)
            except Exception:
                details["message"] = None
            try:
                server.ehlo_or_helo_if_needed()
            except smtplib.SMTPException:
                # No bloquea: el objetivo es comprobar conectividad básica.
                pass
            details["ok"] = True
            return True, details
    except (socket.timeout, ConnectionRefusedError, OSError, smtplib.SMTPException) as exc:
        details["error"] = exc.__class__.__name__
        return False, details


async def validate_email_address(
    *,
    email: str,
    check_smtp: bool = True,
    smtp_timeout_seconds: float = 6.0,
) -> EmailLookupResult:
    checked_at = datetime.now(timezone.utc)
    raw = (email or "").strip()
    if not raw or raw.lower() == "none":
        return EmailLookupResult(status="sin_email", normalized_email=None, details={}, checked_at=checked_at)

    try:
        # Formato / normalización (no DNS aquí).
        normalized = validate_email(raw, check_deliverability=False)
    except EmailNotValidError as exc:
        return EmailLookupResult(
            status="invalido",
            normalized_email=None,
            error=str(exc),
            details={"reason": "format_invalid"},
            checked_at=checked_at,
        )

    normalized_email = str(normalized.email).strip()
    domain = str(normalized.domain).strip().lower()
    local_part = str(normalized.local_part).strip().lower()
    canonical_local = _canonicalize_local_part(local_part)
    if not domain:
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="domain_empty",
            details={"reason": "domain_empty"},
            checked_at=checked_at,
        )

    if domain in PLACEHOLDER_DOMAINS:
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="placeholder_domain",
            details={"reason": "placeholder_domain", "domain": domain},
            checked_at=checked_at,
        )

    # Correos técnicamente válidos pero no contactables (campañas).
    if canonical_local in NO_CONTACT_LOCAL_PARTS or canonical_local.startswith("noreply") or canonical_local.startswith("donotreply"):
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="no_contact_local_part",
            details={
                "reason": "no_contact_local_part",
                "domain": domain,
                "local_part": local_part,
            },
            checked_at=checked_at,
        )

    # Role-based: suele funcionar, pero tiene menor tasa de respuesta / puede ser buzón general.
    quality_tier: EmailQualityTier = _infer_quality_tier(canonical_local=canonical_local)
    role_based_reason = canonical_local in ROLE_BASED_LOCAL_PARTS

    typo_suggestion = DOMAIN_TYPO_SUGGESTIONS.get(domain)
    typo_reason = bool(typo_suggestion)

    disposable_domains = _load_disposable_domains()
    if domain in disposable_domains:
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="disposable_domain",
            details={"reason": "disposable_domain", "domain": domain},
            checked_at=checked_at,
        )

    mx_records, mx_error, a_aaaa, dns_meta = _resolve_dns_with_fallback(domain)
    dns_details: dict[str, Any] = {
        "domain": domain,
        "local_part": local_part,
        "quality_tier": quality_tier,
        "role_based": role_based_reason,
        "mx": mx_records,
        "mx_error": mx_error,
        "a": bool(a_aaaa.get("a")),
        "aaaa": bool(a_aaaa.get("aaaa")),
        "a_aaaa_error": a_aaaa.get("error"),
        "typo_suggestion": typo_suggestion,
        "dns_fallback_used": bool(dns_meta.get("dns_fallback_used")),
        "dns_inconsistent": bool(dns_meta.get("dns_inconsistent")),
        "dns_meta": dns_meta,
    }

    # Clasificación por DNS/MX:
    if mx_error == "NXDOMAIN":
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="nxdomain",
            details={**dns_details, "reason": "domain_nxdomain"},
            checked_at=checked_at,
        )

    if not mx_records:
        # RFC permite fallback a A/AAAA si no hay MX, pero es menos confiable.
        if dns_details["a"] or dns_details["aaaa"]:
            status: EmailLookupStatus = "dudoso"
            reason = "mx_missing_a_present"
            if role_based_reason:
                reason = "role_based_mx_missing_a_present"
            if typo_reason:
                reason = "domain_typo_suspected"
            return EmailLookupResult(
                status=status,
                normalized_email=normalized_email.lower(),
                error="mx_missing_a_present",
                details={**dns_details, "reason": reason},
                checked_at=checked_at,
            )
        # Sin MX y sin A/AAAA => prácticamente no entregable.
        return EmailLookupResult(
            status="invalido",
            normalized_email=normalized_email.lower(),
            error="mx_missing",
            details={**dns_details, "reason": "mx_missing"},
            checked_at=checked_at,
        )

    if not check_smtp:
        status: EmailLookupStatus = "valido"
        reason = "mx_present_smtp_skipped"
        if quality_tier != "alta" or typo_reason or dns_details.get("dns_inconsistent"):
            status = "dudoso"
            if dns_details.get("dns_inconsistent"):
                reason = "dns_inconsistent"
            else:
                reason = "role_based" if quality_tier != "alta" else "domain_typo_suspected"
        return EmailLookupResult(
            status=status,
            normalized_email=normalized_email.lower(),
            details={**dns_details, "smtp": {"skipped": True}, "reason": reason},
            checked_at=checked_at,
        )

    # SMTP: intentamos conectar al MX con menor preference.
    smtp_host = mx_records[0]["host"]
    ok, smtp_details = await asyncio.to_thread(_smtp_connect, smtp_host, 25, smtp_timeout_seconds)
    details = {**dns_details, "smtp": smtp_details}
    if ok:
        status: EmailLookupStatus = "valido"
        reason = "smtp_ok"
        if quality_tier != "alta" or typo_reason or dns_details.get("dns_inconsistent"):
            status = "dudoso"
            if dns_details.get("dns_inconsistent"):
                reason = "dns_inconsistent"
            else:
                reason = "role_based" if quality_tier != "alta" else "domain_typo_suspected"
        return EmailLookupResult(
            status=status,
            normalized_email=normalized_email.lower(),
            details={**details, "reason": reason},
            checked_at=checked_at,
        )

    # Si DNS luce bien pero SMTP falla, lo marcamos dudoso (bloqueos por IP, rate limit, etc).
    return EmailLookupResult(
        status="dudoso",
        normalized_email=normalized_email.lower(),
        error="smtp_unreachable",
        details={**details, "reason": "smtp_unreachable"},
        checked_at=checked_at,
    )
