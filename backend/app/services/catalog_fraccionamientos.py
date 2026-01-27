"""Helper para listar fraccionamientos activos y sus prototipos representativos."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from app.repositories.crm import CRMRepository
from app.services.catalog_locations import (
    LocationResolver,
    extract_development_id,
    format_location_payload,
)


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


def _normalize_metadata_value(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return {str(key): val for key, val in value.items() if val is not None}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, Mapping):
            return {str(key): val for key, val in parsed.items() if val is not None}
    return {}


def _collect_development_id_from_item(item: Mapping[str, Any]) -> str | None:
    for key in ("metadata", "metadatos", "metadatos_extra"):
        meta = item.get(key)
        if isinstance(meta, Mapping):
            dev_id = extract_development_id(meta)
            if dev_id:
                return dev_id
    return extract_development_id(item)


def _location_signature(location: Mapping[str, str | None]) -> tuple[str | None, ...]:
    return (
        location.get("estado_cve"),
        location.get("estado_nombre"),
        location.get("municipio_cve"),
        location.get("municipio_nombre"),
        location.get("colonia"),
        location.get("codigo_postal"),
        location.get("desarrollo_id"),
        location.get("nombre"),
    )


def _sorted_locations(locations: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    return sorted(
        locations,
        key=lambda value: (
            value.get("estado_nombre") or "",
            value.get("municipio_nombre") or "",
            value.get("desarrollo_nombre") or "",
        ),
    )


def _location_payload_for_item(
    location_map: Mapping[str, dict[str, str | None]],
    item: Mapping[str, Any],
) -> dict[str, str | None] | None:
    desarrollo_id = _collect_development_id_from_item(item)
    location = location_map.get(desarrollo_id) if desarrollo_id else None
    return format_location_payload(location)


def _resolve_property_type(
    raw_tipo: str | None,
    property_types: dict[str, dict[str, Any]],
) -> tuple[str | None, str | None]:
    normalized = (raw_tipo or "").strip().lower()
    if not normalized:
        return None, None
    match = property_types.get(normalized)
    if match:
        return match.get("id"), match.get("nombre")
    for alias, entry in property_types.items():
        if alias and alias in normalized:
            return entry.get("id"), entry.get("nombre")
    return None, None


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
    location_resolver = LocationResolver(repo, str(organizacion_id))
    development_ids: list[str] = []
    for item in catalog_items:
        dev_id = _collect_development_id_from_item(item)
        if dev_id:
            development_ids.append(dev_id)
    location_map = await location_resolver.resolve(development_ids)
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
    family_locations: dict[str, dict[tuple[str | None, ...], dict[str, str | None]]] = defaultdict(dict)
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
        desarrollo_id = _collect_development_id_from_item(item)
        if desarrollo_id:
            location = location_map.get(desarrollo_id)
            if location:
                signature = _location_signature(location)
                family_locations[family_key][signature] = format_location_payload(location)

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
        row = {
            "nombre": familia.get("nombre") or "",
            "descripcion": familia.get("descripcion"),
            "segmento": segmento,
            "linea": linea,
            "activo": bool(familia.get("activo")),
            "prototipos": prototipos,
        }
        location_entries = family_locations.get(family_id)
        if location_entries:
            row["ubicaciones"] = _sorted_locations(list(location_entries.values()))
        rows.append(row)
    rows.sort(key=lambda value: value["nombre"].lower())
    return rows


async def list_catalog_modelos(
    repo: CRMRepository,
    organizacion_id: UUID,
    *,
    include_inactive: bool = False,
    limit: int = 500,
) -> dict[str, Any]:
    familias = await repo.list_familias_productos(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
    )
    lineas = await repo.list_lineas_de_negocio(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
        limit=limit,
    )
    catalog_items = await repo.list_catalog_items(
        organizacion_id=organizacion_id,
        include_inactive=include_inactive,
        limit=limit,
    )
    location_resolver = LocationResolver(repo, str(organizacion_id))
    development_ids: list[str] = []
    for item in catalog_items:
        dev_id = _collect_development_id_from_item(item)
        if dev_id:
            development_ids.append(dev_id)
    location_map = await location_resolver.resolve(development_ids)
    tipos = await repo.list_propiedad_tipos(organizacion_id=organizacion_id)

    linea_lookup = {
        str(linea["id"]): {
            "id": str(linea["id"]),
            "nombre": _safe_text(linea.get("nombre")) or "",
            "activo": bool(linea.get("activo")),
            "descripcion": linea.get("descripcion"),
        }
        for linea in lineas
    }
    property_types: dict[str, dict[str, Any]] = {}
    tipos_result: list[dict[str, Any]] = []
    for tipo in tipos:
        nombre = _safe_text(tipo.get("nombre")) or ""
        if not nombre:
            continue
        key = nombre.lower()
        property_types[key] = tipo
        tipos_result.append(
            {
                "id": str(tipo.get("id")),
                "nombre": nombre,
                "descripcion": tipo.get("descripcion"),
                "color": tipo.get("color"),
            }
        )

    familias_map: dict[str, dict[str, Any]] = {}
    for familia in familias:
        family_id = str(familia.get("id"))
        metadata = _parse_json_metadata(familia.get("metadata"))
        segmento = _segment_from_metadata(
            metadata,
            fallback=linea_lookup.get(str(familia.get("linea_id")) or {}).get("nombre"),
        )
        familias_map[family_id] = {
            "id": family_id,
            "nombre": familia.get("nombre") or "",
            "linea_id": str(familia.get("linea_id")) if familia.get("linea_id") else None,
            "linea_nombre": linea_lookup.get(str(familia.get("linea_id")) or {}).get(
                "nombre"
            )
            or None,
            "segmento": segmento,
            "activo": bool(familia.get("activo")),
            "descripcion": familia.get("descripcion"),
            "modelos": [],
        }

    for item in catalog_items:
        familia_id_raw = item.get("familia_id")
        if not familia_id_raw:
            continue
        family_id = str(familia_id_raw)
        familia_entry = familias_map.get(family_id)
        if familia_entry is None:
            continue
        metadata = _normalize_metadata_value(
            item.get("metadata")
            or item.get("metadatos")
            or item.get("metadatos_extra")
        )
        tipo_id, tipo_nombre = _resolve_property_type(
            item.get("tipo"), property_types
        )
        model_entry = {
            "id": str(item.get("id")),
            "nombre": item.get("nombre"),
            "slug": item.get("slug"),
            "unidad": item.get("unidad"),
            "precio_base": item.get("precio_base"),
            "moneda": item.get("moneda"),
            "activo": bool(item.get("activo")),
            "tipo": tipo_nombre or _safe_text(item.get("tipo")),
            "tipo_id": tipo_id,
            "metadata": metadata,
            "metadata_keys": sorted(metadata.keys()),
        }
        location_payload = _location_payload_for_item(location_map, item)
        if location_payload:
            model_entry["ubicacion"] = location_payload
        familia_entry["modelos"].append(model_entry)

    lineas_result: list[dict[str, Any]] = []
    familias_by_line: dict[str, list[dict[str, Any]]] = {}
    orphan_familias: list[dict[str, Any]] = []
    for family in familias_map.values():
        line_id = family.get("linea_id")
        if line_id and line_id in linea_lookup:
            familias_by_line.setdefault(line_id, []).append(family)
        else:
            orphan_familias.append(family)

    for linea_id, linea in linea_lookup.items():
        lineas_result.append(
            {
                "id": linea_id,
                "nombre": linea.get("nombre"),
                "activo": linea.get("activo"),
                "descripcion": linea.get("descripcion"),
                "familias": sorted(
                    familias_by_line.get(linea_id, []),
                    key=lambda value: value["nombre"].lower(),
                ),
            }
        )

    if orphan_familias:
        lineas_result.append(
            {
                "id": None,
                "nombre": "Sin Línea definida",
                "activo": True,
                "descripcion": None,
                "familias": sorted(
                    orphan_familias, key=lambda value: value["nombre"].lower()
                ),
            }
        )

    modelos_total = sum(len(family["modelos"]) for family in familias_map.values())
    return {
        "lineas": lineas_result,
        "propiedad_tipos": tipos_result,
        "modelos_total": modelos_total,
        "familias_total": len(familias_map),
    }
