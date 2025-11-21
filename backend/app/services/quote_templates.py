"""Carga de plantillas de cotización desde Supabase."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.services.quote_templates")


@dataclass
class QuoteTemplate:
    slug: str
    name: str
    description: str | None
    html: str
    css: str
    variables: list[str]
    config: dict[str, Any]


class QuoteTemplateError(RuntimeError):
    pass


async def fetch_active_template(slug: str = "default") -> QuoteTemplate:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise QuoteTemplateError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/quote_templates"
    params = {
        "slug": f"eq.{slug}",
        "limit": "1",
        "select": "slug,nombre,descripcion,html,css,variables,config",
    }
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
    except httpx.RequestError as exc:  # pragma: no cover - errores de red reales
        msg = f"Error de red al consultar quote_templates: {exc}"
        logger.exception(msg)
        raise QuoteTemplateError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener plantilla de cotización"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise QuoteTemplateError(msg)

    rows = response.json() or []
    if not isinstance(rows, list) or not rows:
        raise QuoteTemplateError("quote_template_not_found")
    row = rows[0]

    variables = _parse_list(row.get("variables"))
    config = _parse_dict(row.get("config"))

    return QuoteTemplate(
        slug=row.get("slug") or slug,
        name=row.get("nombre") or "Formato Tal-IA",
        description=row.get("descripcion"),
        html=row.get("html") or "",
        css=row.get("css") or "",
        variables=variables,
        config=config,
    )


def _parse_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if isinstance(item, (str, int, float))]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if isinstance(item, (str, int, float))]
        except json.JSONDecodeError:
            return []
    return []


def _parse_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}
