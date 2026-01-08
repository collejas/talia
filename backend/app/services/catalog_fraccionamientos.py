"""Helper para listar fraccionamientos activos y sus prototipos representativos."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from app.repositories.crm import CRMRepository, CRMRepositoryError


def _safe_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return None


def _parse_json_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(key): val for key, val in value.items() if val is not None}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return {str(key): val for key, val in parsed.items() if val is not None}
    return {}


def _segment_from_metadata(metadata: dict[str, Any], fallback: str | None = None) -> str | None:
    for key in ("segmento", "zona", "segmento_id"):
        candidate = metadata.get(key)
        if isinstance(candidate, str):
            trimmed = candidate.strip()
            if trimmed:
                return trimmed
    if fallback:
        return fallback
    return None


async def list_catalog_fraccionamientos(
    repo: CRMRepository,
    organizacion_id: UUID,
    *,
    include_inactive: bool = False,
    prototipos_limit: int = 6,
) -> list[dict[str, Any]]:
    familias = await repo.list_familias_productos(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
    )
    catalog_items = await repo.list_catalog_items(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
        limit=500,
    )
    lineas = await repo.list_lineas_de_negocio(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
        limit=500,
    )

    linea_names: dict[str, str] = {
        str(linea["id"]): _safe_text(linea.get("nombre")) or ""
        for linea in lineas
    }
    prototipos_by_family: dict[str, list[str]] = {}
    seen_by_family: dict[str, set[str]] = {}
    for item in catalog_items:
        familia_id = item.get("familia_id")
        if not familia_id:
            continue
        name = _safe_text(item.get("nombre"))
        if not name:
            continue
        family_key = str(familia_id)
        seen = seen_by_family.setdefault(family_key, set())
        if name in seen:
            continue
        if len(seen) >= prototipos_limit:
            continue
        seen.add(name)
        prototipos_by_family.setdefault(family_key, []).append(name)

    rows: list[dict[str, Any]] = []
    for familia in familias:
        family_id = str(familia.get("id"))
        metadata = _parse_json_metadata(familia.get("metadata"))
        segmento = _segment_from_metadata(
            metadata,
            fallback=linea_names.get(str(familia.get("linea_id"))),
        )
        linea = linea_names.get(str(familia.get("linea_id"))) or None
        prototipos = prototipos_by_family.get(family_id, [])
        rows.append(
            {
                "nombre": familia.get("nombre") or "",
                "descripcion": familia.get("descripcion"),
                "segmento": segmento,
                "linea": linea,
                "activo": bool(familia.get("activo")),
                "prototipos": prototipos,
            }
        )
    rows.sort(key=lambda value: value["nombre"].lower())
    return rows
