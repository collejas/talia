"""Helpers para enriquecer prompts con fragmentos del catálogo vectorizado."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Sequence
from urllib.parse import quote_plus
from uuid import UUID

from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.catalog_embeddings import CatalogDocumentMatch, CatalogEmbeddingService

logger = get_logger("app.services.catalog_context")


@dataclass
class CatalogContext:
    text: str
    matches: list[CatalogDocumentMatch]


_catalog_embedding_service: CatalogEmbeddingService | None = None


def _get_catalog_embedding_service() -> CatalogEmbeddingService | None:
    global _catalog_embedding_service
    if _catalog_embedding_service is not None:
        return _catalog_embedding_service
    try:
        _catalog_embedding_service = CatalogEmbeddingService(CRMRepository())
    except CRMRepositoryError as exc:
        logger.debug(
            "catalog_context.service_unavailable",
            extra={"error": str(exc)},
        )
        return None
    return _catalog_embedding_service


def _summarize_catalog_text(value: str, max_chars: int = 220) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= max_chars:
        return normalized
    truncated = normalized[:max_chars]
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return truncated.rstrip() + "..."


MAX_METADATA_REFERENCE_LINES = 40
METADATA_KEYS_HIDE = {"linea", "linea_id", "familia", "familia_id"}


def _normalize_metadata_display(value: Any) -> str:
    if isinstance(value, bool):
        return "sí" if value else "no"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def _parse_metadata_dict(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None


def _metadata_entries(raw: Any, *, limit: int | None = None) -> list[str]:
    parsed = _parse_metadata_dict(raw)
    if not parsed:
        return []
    filtered = [(key, parsed[key]) for key in sorted(parsed) if key not in METADATA_KEYS_HIDE]
    if not filtered:
        return []
    display = filtered if limit is None else filtered[:limit]
    lines = [f"{key}: {_normalize_metadata_display(value)}" for key, value in display]
    if limit is not None and len(filtered) > len(display):
        lines.append(f"...y {len(filtered) - len(display)} datos más")
    return lines


def _metadata_preview(raw: Any) -> str | None:
    entries = _metadata_entries(raw, limit=3)
    if not entries:
        return None
    return "; ".join(entries)


def _catalog_match_label(match: CatalogDocumentMatch) -> str:
    for key in ("nombre", "slug", "tipo"):
        candidate = match.metadata.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return "sin nombre"


def _catalog_product_summary_parts(match: CatalogDocumentMatch) -> list[str]:
    parts: list[str] = []
    tipo = _get_metadata_value(match, ("tipo",))
    if tipo:
        parts.append(tipo)
    precio = _get_metadata_value(match, ("precio_base",))
    moneda = _get_metadata_value(match, ("moneda",))
    if precio:
        precio_text = precio
        if moneda:
            precio_text += f" {moneda}"
        parts.append(f"precio base {precio_text}")
    requiere_factura = _get_metadata_value(match, ("requiere_factura",))
    if requiere_factura:
        parts.append(f"requiere factura {requiere_factura}")
    return parts


def _catalog_product_context_summary(match: CatalogDocumentMatch) -> str:
    label = _catalog_match_label(match)
    summary_parts = _catalog_product_summary_parts(match)
    header = f"Producto {label}"
    if summary_parts:
        header += f" ({'; '.join(summary_parts)})"
    snippet = _summarize_catalog_text(match.contenido)
    if snippet:
        header += f" — {snippet}"
    metadata_preview = _metadata_preview(match.metadata.get("metadata"))
    if metadata_preview:
        header += f" — metadata: {metadata_preview}"
    return header


def _catalog_product_reference(match: CatalogDocumentMatch) -> str:
    label = _catalog_match_label(match)
    summary_parts = _catalog_product_summary_parts(match)
    header = label
    if summary_parts:
        header += f" ({'; '.join(summary_parts)})"
    lines: list[str] = [f"- {header}"]
    snippet = _summarize_catalog_text(match.contenido)
    if snippet:
        lines.append(f"  {snippet}")
    metadata_lines = _metadata_entries(match.metadata.get("metadata"), limit=MAX_METADATA_REFERENCE_LINES)
    if metadata_lines:
        lines.append("  Metadatos:")
        lines.extend(f"    {entry}" for entry in metadata_lines)
    return "\n".join(lines)


def _format_catalog_matches(matches: Sequence[CatalogDocumentMatch]) -> str | None:
    product_matches = [
        match for match in matches if match.entity_type.lower() == "producto"
    ]
    if not product_matches:
        return None
    lines = ["Contexto relevante del catálogo (vector store):"]
    for index, match in enumerate(product_matches[:3], start=1):
        lines.append(f"{index}. {_catalog_product_context_summary(match)}")
    lines.append(
        "Uso estos fragmentos del catálogo para responder con los atributos actuales de los productos mencionados."
    )
    return "\n".join(lines)


ENTITY_PANEL_PATHS = {
    "producto": "items",
    "familia": "familias",
    "linea": "lineas",
    "modelo": "modelos",
}


def _catalog_panel_search_term(match: CatalogDocumentMatch) -> str | None:
    for key in ("slug", "nombre", "tipo"):
        raw = match.metadata.get(key)
        if isinstance(raw, str):
            trimmed = raw.strip()
            if trimmed:
                return trimmed
    return None


def _catalog_panel_url(match: CatalogDocumentMatch) -> str | None:
    path = ENTITY_PANEL_PATHS.get(match.entity_type.lower())
    if not path:
        return None
    search_term = _catalog_panel_search_term(match)
    base = f"/settings/productos/{path}"
    if not search_term:
        return base
    encoded = quote_plus(search_term)
    return f"{base}?search={encoded}"


def _get_metadata_value(match: CatalogDocumentMatch, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = match.metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, bool):
            return "sí" if value else "no"
        if isinstance(value, (int, float)):
            return str(value)
    return None


def _format_catalog_references(matches: Sequence[CatalogDocumentMatch]) -> str | None:
    product_matches = [
        match for match in matches if match.entity_type.lower() == "producto"
    ]
    if not product_matches:
        return None
    fragments: list[str] = [
        "Datos completos del catálogo para los productos que estás consultando:"
    ]
    for match in product_matches[:3]:
        fragments.append(_catalog_product_reference(match))
    fragments.append("Visita Productos > Ítems si necesitas la ficha completa en el panel.")
    return "\n".join(fragments)


async def build_catalog_context(
    organizacion_id: str | None,
    query: str,
    *,
    limit: int = 3,
    user_id: str | None = None,
    channel: str | None = None,
) -> CatalogContext | None:
    if not organizacion_id:
        return None
    prompt = query.strip()
    if not prompt:
        return None
    try:
        org_uuid = UUID(organizacion_id)
    except ValueError:
        return None
    service = _get_catalog_embedding_service()
    if not service:
        return None
    try:
        matches = await service.query_documents(
            org_uuid,
            query=prompt,
            limit=limit,
            user_id=user_id,
            channel=channel,
            reason="catalog_context_autoload",
        )
    except CRMRepositoryError as exc:
        logger.debug(
            "catalog_context.search_failed",
            extra={"organizacion_id": organizacion_id, "error": str(exc)},
        )
        return None
    formatted = _format_catalog_matches(matches)
    if not formatted:
        return None
    return CatalogContext(text=formatted, matches=matches)


def format_catalog_references(matches: Sequence[CatalogDocumentMatch]) -> str | None:
    return _format_catalog_references(matches)


def catalog_reference_payload(context: CatalogContext | None) -> list[dict[str, str]] | None:
    if not context:
        return None
    payload: list[dict[str, str]] = []
    for match in context.matches[:3]:
        label = _catalog_match_label(match)
        payload.append({"entity_type": match.entity_type, "label": label})
    return payload or None


def append_catalog_references(text: str | None, context: CatalogContext | None) -> str | None:
    if not context:
        return text
    references = _format_catalog_references(context.matches)
    if not references:
        return text
    if text:
        return f"{text}\n\n{references}".strip()
    return references
