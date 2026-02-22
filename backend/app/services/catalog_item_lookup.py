"""Búsqueda SQL-first de ítems de catálogo para reducir uso innecesario de vector store."""

from __future__ import annotations

import re
import unicodedata
from typing import Any
from uuid import UUID

from app.repositories.crm import CRMRepository


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    compact = re.sub(r"\s+", " ", without_accents).strip().lower()
    return compact


def _slugify(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    slug = "".join(ch if ch.isalnum() else "-" for ch in text.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def _score_catalog_item(
    *,
    query_normalized: str,
    row: dict[str, Any],
) -> int:
    name = _normalize_text(str(row.get("nombre") or ""))
    slug = _normalize_text(str(row.get("slug") or ""))
    if not query_normalized:
        return 0
    if query_normalized == name or query_normalized == slug:
        return 100
    if query_normalized in name or query_normalized in slug:
        return 80
    query_tokens = [token for token in query_normalized.split(" ") if token]
    if not query_tokens:
        return 0
    overlap = sum(1 for token in query_tokens if token in name or token in slug)
    if overlap <= 0:
        return 0
    return 40 + min(30, overlap * 6)


async def lookup_catalog_items_sql_first(
    repo: CRMRepository,
    *,
    organizacion_id: UUID,
    query: str,
    limit: int = 1,
) -> list[dict[str, Any]]:
    query_text = query.strip()
    if not query_text:
        return []

    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    slug_candidate = _slugify(query_text)
    if slug_candidate:
        by_slug = await repo.get_catalog_item_by_slug(
            organizacion_id=organizacion_id,
            slug=slug_candidate,
        )
        if by_slug:
            item_id = str(by_slug.get("id") or "")
            if item_id:
                seen_ids.add(item_id)
            results.append(by_slug)
            if len(results) >= max(1, min(limit, 5)):
                return results[: max(1, min(limit, 5))]

    search_limit = max(20, min(120, max(1, limit) * 20))
    rows = await repo.list_catalog_items(
        organizacion_id=organizacion_id,
        include_inactive=False,
        search=query_text,
        limit=search_limit,
    )
    query_normalized = _normalize_text(query_text)
    ranked: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        item_id = str(row.get("id") or "")
        if item_id and item_id in seen_ids:
            continue
        score = _score_catalog_item(query_normalized=query_normalized, row=row)
        if score <= 0:
            continue
        ranked.append((score, row))

    ranked.sort(
        key=lambda entry: (
            -entry[0],
            str(entry[1].get("nombre") or "").lower(),
        )
    )
    for _, row in ranked:
        item_id = str(row.get("id") or "")
        if item_id and item_id in seen_ids:
            continue
        if item_id:
            seen_ids.add(item_id)
        results.append(row)
        if len(results) >= max(1, min(limit, 5)):
            break
    return results[: max(1, min(limit, 5))]


__all__ = ["lookup_catalog_items_sql_first"]
