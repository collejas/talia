"""Cliente mínimo de catálogo de plantillas SMTP de Brevo."""

from __future__ import annotations

from typing import Any

import httpx


class BrevoTemplateServiceError(RuntimeError):
    """Error al consultar catálogo de plantillas Brevo."""


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _normalize_base_url(value: str | None) -> str:
    raw = _clean_text(value) or "https://api.brevo.com/v3"
    return raw.rstrip("/")


def _build_headers(api_key: str) -> dict[str, str]:
    return {
        "api-key": api_key,
        "accept": "application/json",
    }


async def list_brevo_smtp_templates(
    *,
    api_key: str,
    base_url: str | None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Lista plantillas SMTP de Brevo (vista catálogo)."""

    if not _clean_text(api_key):
        raise BrevoTemplateServiceError("brevo_api_key_missing")
    normalized_limit = max(1, min(limit, 100))
    endpoint = f"{_normalize_base_url(base_url)}/smtp/templates"
    params = {"limit": str(normalized_limit)}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(endpoint, headers=_build_headers(api_key), params=params)
    except httpx.RequestError as exc:  # pragma: no cover
        raise BrevoTemplateServiceError("brevo_catalog_request_failed") from exc

    if response.status_code >= 400:
        raise BrevoTemplateServiceError(f"brevo_catalog_http_{response.status_code}")
    payload = response.json() if response.content else {}
    templates = payload.get("templates") if isinstance(payload, dict) else []
    if not isinstance(templates, list):
        return []

    items: list[dict[str, Any]] = []
    for row in templates:
        if not isinstance(row, dict):
            continue
        template_id_raw = row.get("id")
        try:
            template_id = int(template_id_raw)
        except (TypeError, ValueError):
            continue
        items.append(
            {
                "id": template_id,
                "name": _clean_text(row.get("name")) or f"Brevo #{template_id}",
                "subject": _clean_text(row.get("subject")),
                "is_active": bool(row.get("isActive")),
                "updated_at": _clean_text(row.get("modifiedAt") or row.get("updatedAt")),
            }
        )
    return items


async def get_brevo_smtp_template(
    *,
    api_key: str,
    base_url: str | None,
    template_id: int,
) -> dict[str, Any]:
    """Obtiene detalle completo de una plantilla SMTP en Brevo."""

    if not _clean_text(api_key):
        raise BrevoTemplateServiceError("brevo_api_key_missing")
    if template_id <= 0:
        raise BrevoTemplateServiceError("brevo_template_id_invalid")

    endpoint = f"{_normalize_base_url(base_url)}/smtp/templates/{template_id}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(endpoint, headers=_build_headers(api_key))
    except httpx.RequestError as exc:  # pragma: no cover
        raise BrevoTemplateServiceError("brevo_template_request_failed") from exc

    if response.status_code == 404:
        raise BrevoTemplateServiceError("brevo_template_not_found")
    if response.status_code >= 400:
        raise BrevoTemplateServiceError(f"brevo_template_http_{response.status_code}")

    payload = response.json() if response.content else {}
    if not isinstance(payload, dict):
        raise BrevoTemplateServiceError("brevo_template_invalid_payload")

    return {
        "id": template_id,
        "name": _clean_text(payload.get("name")) or f"Brevo #{template_id}",
        "subject": _clean_text(payload.get("subject")),
        "html_content": _clean_text(payload.get("htmlContent")),
        "is_active": bool(payload.get("isActive")),
        "updated_at": _clean_text(payload.get("modifiedAt") or payload.get("updatedAt")),
    }

