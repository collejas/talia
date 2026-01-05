"""Helpers para enriquecer prompts con fragmentos del catálogo vectorizado."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
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


def _catalog_match_label(match: CatalogDocumentMatch) -> str:
    for key in ("nombre", "slug", "tipo"):
        candidate = match.metadata.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return "sin nombre"


def _format_catalog_matches(matches: Sequence[CatalogDocumentMatch]) -> str | None:
    if not matches:
        return None
    lines = ["Contexto relevante del catálogo (vector store):"]
    for index, match in enumerate(matches[:3], start=1):
        label = _catalog_match_label(match)
        snippet = _summarize_catalog_text(match.contenido)
        similarity = match.similarity
        sim_text = f" (sim: {similarity:.3f})" if similarity is not None else ""
        lines.append(f"{index}. {match.entity_type.title()} {label}{sim_text}: {snippet}")
    lines.append("Los fragmentos anteriores se obtienen de la vector store autorizada del catálogo.")
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
    if not matches:
        return None

    lineas: list[str] = []
    familias: list[str] = []
    modelos: list[str] = []
    productos: list[str] = []

    for match in matches:
        label = _catalog_match_label(match)
        entity_type = match.entity_type.lower()
        if entity_type == "linea":
            active_value = match.metadata.get("activo")
            is_active = True if active_value is None else bool(active_value)
            if not is_active:
                continue
            lineas.append(label)
        elif entity_type == "familia":
            familia_text = label
            linea = _get_metadata_value(match, ("linea_id", "linea"))
            if linea:
                familia_text += f" de la línea {linea}"
            familias.append(familia_text)
        elif entity_type == "modelo":
            detalles = label
            modelos.append(f"{detalles}")
        elif entity_type == "producto":
            partes: list[str] = [label]
            tipo = _get_metadata_value(match, ("tipo",))
            if tipo:
                partes.append(tipo)
            precio = _get_metadata_value(match, ("precio_base",))
            moneda = _get_metadata_value(match, ("moneda",))
            if precio:
                precio_text = f"{precio}"
                if moneda:
                    precio_text += f" {moneda}"
                partes.append(f"desde {precio_text}")
            productos.append(" · ".join(partes))

    if not lineas:
        return None

    if not (familias or modelos or productos):
        return f"Líneas disponibles: {', '.join(lineas)}."

    fragments = [f"Líneas disponibles: {', '.join(lineas)}."]
    if familias:
        fragments.append(f"Familias destacadas: {', '.join(familias)}.")
    if modelos:
        fragments.append(f"Modelos relacionados: {', '.join(modelos)}.")
    if productos:
        fragments.append(
            f"Productos mencionados: {', '.join(productos)}; para explorar sus detalles usa Productos > Ítems."
        )
    return " ".join(fragments)


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
