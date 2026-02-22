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
    modelo_name = _normalize_text(str((row.get("modelo") or {}).get("nombre") or ""))
    familia_name = _normalize_text(str((row.get("familia") or {}).get("nombre") or ""))
    linea_name = _normalize_text(str((row.get("linea") or {}).get("nombre") or ""))
    relation_names = [value for value in (modelo_name, familia_name, linea_name) if value]
    if not query_normalized:
        return 0
    if query_normalized == name or query_normalized == slug:
        return 100
    if any(query_normalized == relation_name for relation_name in relation_names):
        return 95
    if query_normalized in name or query_normalized in slug:
        return 80
    if any(query_normalized in relation_name for relation_name in relation_names):
        return 74
    query_tokens = [token for token in query_normalized.split(" ") if token]
    if not query_tokens:
        return 0
    overlap = sum(
        1
        for token in query_tokens
        if token in name
        or token in slug
        or any(token in relation_name for relation_name in relation_names)
    )
    if overlap <= 0:
        return 0
    return 40 + min(30, overlap * 6)


def _score_relation_row(
    *,
    query_normalized: str,
    row: dict[str, Any],
) -> int:
    name = _normalize_text(str(row.get("nombre") or ""))
    description = _normalize_text(str(row.get("descripcion") or ""))
    if not query_normalized:
        return 0
    if query_normalized == name:
        return 100
    if query_normalized in name:
        return 80
    query_tokens = [token for token in query_normalized.split(" ") if token]
    if not query_tokens:
        return 0
    overlap = sum(1 for token in query_tokens if token in name or token in description)
    if overlap <= 0:
        return 0
    return 30 + min(30, overlap * 8)


async def _collect_catalog_items_by_relation(
    repo: CRMRepository,
    *,
    organizacion_id: UUID,
    query_text: str,
    relation: str,
    max_relation_hits: int,
    per_relation_items_limit: int,
) -> list[dict[str, Any]]:
    query_normalized = _normalize_text(query_text)
    if relation == "modelo":
        relation_rows = await repo.list_modelos_productos(
            organizacion_id=organizacion_id,
            include_inactive=False,
            search=query_text,
            limit=max_relation_hits,
        )
        relation_filter_key = "modelo_id"
    elif relation == "familia":
        relation_rows = await repo.list_familias_productos(
            organizacion_id=organizacion_id,
            include_inactive=False,
            search=query_text,
            limit=max_relation_hits,
        )
        relation_filter_key = "familia_id"
    elif relation == "linea":
        relation_rows = await repo.list_lineas_de_negocio(
            organizacion_id=organizacion_id,
            include_inactive=False,
            search=query_text,
            limit=max_relation_hits,
        )
        relation_filter_key = "linea_id"
    else:
        return []

    ranked_relations: list[tuple[int, dict[str, Any]]] = []
    for relation_row in relation_rows:
        score = _score_relation_row(query_normalized=query_normalized, row=relation_row)
        if score <= 0:
            continue
        ranked_relations.append((score, relation_row))
    ranked_relations.sort(
        key=lambda entry: (
            -entry[0],
            str(entry[1].get("nombre") or "").lower(),
        )
    )

    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for _, relation_row in ranked_relations[:max_relation_hits]:
        relation_id_raw = relation_row.get("id")
        if not relation_id_raw:
            continue
        relation_id = UUID(str(relation_id_raw))
        kwargs: dict[str, Any] = {
            "organizacion_id": organizacion_id,
            "include_inactive": False,
            "search": None,
            "limit": per_relation_items_limit,
        }
        kwargs[relation_filter_key] = relation_id
        relation_items = await repo.list_catalog_items(**kwargs)
        for relation_item in relation_items:
            item_id = str(relation_item.get("id") or "")
            if item_id and item_id in seen_ids:
                continue
            if item_id:
                seen_ids.add(item_id)
            results.append(relation_item)
    return results


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

    desired_limit = max(1, min(limit, 5))
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
            if len(results) >= desired_limit:
                return results[:desired_limit]

    search_limit = max(20, min(120, desired_limit * 20))
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
    if not ranked:
        relation_candidates: list[dict[str, Any]] = []
        relation_candidates.extend(
            await _collect_catalog_items_by_relation(
                repo,
                organizacion_id=organizacion_id,
                query_text=query_text,
                relation="modelo",
                max_relation_hits=3,
                per_relation_items_limit=40,
            )
        )
        relation_candidates.extend(
            await _collect_catalog_items_by_relation(
                repo,
                organizacion_id=organizacion_id,
                query_text=query_text,
                relation="familia",
                max_relation_hits=2,
                per_relation_items_limit=40,
            )
        )
        relation_candidates.extend(
            await _collect_catalog_items_by_relation(
                repo,
                organizacion_id=organizacion_id,
                query_text=query_text,
                relation="linea",
                max_relation_hits=1,
                per_relation_items_limit=40,
            )
        )
        for row in relation_candidates:
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
        if len(results) >= desired_limit:
            break
    return results[:desired_limit]


__all__ = ["lookup_catalog_items_sql_first"]
