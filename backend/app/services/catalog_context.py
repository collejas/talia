"""Helpers para enriquecer prompts con fragmentos del catálogo vectorizado."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
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
    lines = ["Contexto relevante del catálogo:"]
    for index, match in enumerate(matches[:3], start=1):
        label = _catalog_match_label(match)
        snippet = _summarize_catalog_text(match.contenido)
        similarity = match.similarity
        sim_text = f" (sim: {similarity:.3f})" if similarity is not None else ""
        lines.append(f"{index}. {match.entity_type.title()} {label}{sim_text}: {snippet}")
    return "\n".join(lines)


def _format_catalog_references(matches: Sequence[CatalogDocumentMatch]) -> str | None:
    if not matches:
        return None
    lines = ["Referencias catalogadas:"]
    for match in matches[:3]:
        label = _catalog_match_label(match)
        lines.append(f"- {match.entity_type.title()}: {label}")
    return "\n".join(lines)


async def build_catalog_context(
    organizacion_id: str | None,
    query: str,
    *,
    limit: int = 3,
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
        matches = await service.query_documents(org_uuid, query=prompt, limit=limit)
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


def append_catalog_references(text: str | None, context: CatalogContext | None) -> str | None:
    if not context:
        return text
    references = _format_catalog_references(context.matches)
    if not references:
        return text
    if text:
        return f"{text}\n\n{references}".strip()
    return references
