"""Helpers para enriquecer prompts con fragmentos del catálogo vectorizado."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from time import monotonic
from typing import Any, Sequence
from urllib.parse import quote_plus
from uuid import UUID

from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.catalog_fraccionamientos import list_catalog_fraccionamientos, list_catalog_modelos
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
INVENTORY_SNAPSHOT_CACHE_TTL_SECONDS = 60.0
_inventory_snapshot_cache: dict[tuple[str, bool], tuple[float, str]] = {}

_PRICE_GENERAL_KEYWORDS: tuple[str, ...] = (
    "precio",
    "precios",
    "precio por m",
    "m²",
    "m2",
    "mensualidad",
    "contado",
    "crédito",
    "credito",
    "infonavit",
    "financiamiento",
)
_PRICE_SPECIFIC_LOT_KEYWORDS: tuple[str, ...] = (
    "este lote",
    "ese lote",
    "lote ",
    "lote#",
    "lote número",
    "lote numero",
    "cuánto cuesta este lote",
    "cuanto cuesta este lote",
    "precio de este lote",
    "precio total",
    "total del lote",
)


def _should_skip_catalog_autoload(query: str) -> bool:
    normalized = " ".join(query.lower().split())
    if not normalized:
        return False
    has_price_keyword = any(keyword in normalized for keyword in _PRICE_GENERAL_KEYWORDS)
    if not has_price_keyword:
        return False
    if any(keyword in normalized for keyword in _PRICE_SPECIFIC_LOT_KEYWORDS):
        return False
    if re.search(r"\blote\s+\d+\b", normalized):
        return False
    return True


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


def _extract_item_area(item: dict[str, Any]) -> str | None:
    metadata = _parse_metadata_dict(
        item.get("metadata") or item.get("metadatos") or item.get("metadatos_extra")
    )
    candidates = []
    if metadata:
        candidates.extend(
            [
                metadata.get("m2_de_terreno"),
                metadata.get("area_m2"),
                metadata.get("superficie"),
                metadata.get("m2"),
            ]
        )
    candidates.extend(
        [
            item.get("area_m2"),
            item.get("m2_de_terreno"),
            item.get("superficie"),
        ]
    )
    for candidate in candidates:
        if candidate is None:
            continue
        if isinstance(candidate, (int, float)):
            return str(candidate)
        text = str(candidate).strip()
        if text:
            return text
    return None


def _extract_item_price(item: dict[str, Any]) -> str | None:
    precio = item.get("precio_base")
    moneda = item.get("moneda")
    if precio is None:
        return None
    if isinstance(precio, (int, float)):
        precio_text = f"{precio:g}"
    else:
        precio_text = str(precio).strip()
    if not precio_text:
        return None
    if moneda:
        moneda_text = str(moneda).strip()
        if moneda_text:
            return f"{precio_text} {moneda_text}"
    return precio_text


def _extract_item_location(item: dict[str, Any]) -> str | None:
    ubicacion = item.get("ubicacion")
    if not isinstance(ubicacion, dict):
        return None
    parts: list[str] = []
    desarrollo = ubicacion.get("desarrollo_nombre")
    if desarrollo:
        parts.append(str(desarrollo).strip())
    colonia = ubicacion.get("colonia")
    municipio = ubicacion.get("municipio_nombre")
    estado = ubicacion.get("estado_nombre")
    zone_bits = [bit for bit in (colonia, municipio, estado) if isinstance(bit, str) and bit.strip()]
    if zone_bits:
        parts.append(", ".join(bit.strip() for bit in zone_bits))
    return " | ".join(part for part in parts if part)


def _parse_hierarchy_features(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    features = payload.get("features")
    if not isinstance(features, list):
        return []
    return [feature for feature in features if isinstance(feature, dict)]


def _flatten_property_units(
    features: Sequence[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]]:
    rows: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]] = []
    for development in features:
        capas = development.get("capas")
        if not isinstance(capas, list):
            continue
        for capa in capas:
            if not isinstance(capa, dict):
                continue
            unidades = capa.get("unidades")
            if not isinstance(unidades, list):
                continue
            for unidad in unidades:
                if not isinstance(unidad, dict):
                    continue
                rows.append((development, capa, unidad))
    return rows


def _format_unit_area(unit: dict[str, Any]) -> str | None:
    candidates = [
        unit.get("area_m2"),
        _parse_metadata_dict(unit.get("metadata") or {}).get("m2_de_terreno") if unit.get("metadata") else None,
        _parse_metadata_dict(unit.get("metadata") or {}).get("area_m2") if unit.get("metadata") else None,
        _parse_metadata_dict(unit.get("metadata") or {}).get("superficie") if unit.get("metadata") else None,
    ]
    for candidate in candidates:
        if candidate is None:
            continue
        if isinstance(candidate, (int, float)):
            return f"{candidate:g}"
        text = str(candidate).strip()
        if text:
            return text
    return None


def _format_unit_price(unit: dict[str, Any]) -> str | None:
    price = unit.get("precio")
    if price is None:
        return None
    if isinstance(price, (int, float)):
        return f"{price:g}"
    text = str(price).strip()
    return text or None


def _coerce_numeric_area(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _format_development_location(development: dict[str, Any]) -> str | None:
    parts = [
        development.get("colonia"),
        development.get("municipio_nombre"),
        development.get("estado_nombre"),
    ]
    normalized = [str(part).strip() for part in parts if isinstance(part, str) and part.strip()]
    return ", ".join(normalized) if normalized else None


async def build_catalog_inventory_context(
    organizacion_id: str | None,
    *,
    include_inactive: bool = False,
) -> str | None:
    if not organizacion_id:
        return None
    cache_key = (str(organizacion_id), include_inactive)
    cached = _inventory_snapshot_cache.get(cache_key)
    if cached:
        cached_at, cached_text = cached
        if (monotonic() - cached_at) <= INVENTORY_SNAPSHOT_CACHE_TTL_SECONDS:
            return cached_text
    try:
        org_uuid = UUID(organizacion_id)
    except ValueError:
        return None
    repo = CRMRepository()
    try:
        hierarchy = await repo.get_propiedad_hierarquia(organizacion_id=org_uuid)
        prop_tipos = await repo.list_propiedad_tipos(organizacion_id=org_uuid)
    except CRMRepositoryError as exc:
        logger.debug(
            "catalog_inventory_context.failed",
            extra={"organizacion_id": organizacion_id, "error": str(exc)},
        )
        return None

    lines: list[str] = ["Inventario inicial del catálogo activo:"]
    features = _parse_hierarchy_features(hierarchy)
    tipo_lookup = {
        str(tipo.get("id")): str(tipo.get("nombre") or "").strip()
        for tipo in prop_tipos
        if isinstance(tipo, dict) and tipo.get("id")
    }

    if features:
        development_count = len(features)
        unit_rows = _flatten_property_units(features)
        type_counts: dict[str, int] = {}
        development_type_counts: dict[str, dict[str, int]] = {}
        development_units: dict[str, list[dict[str, Any]]] = {}
        development_areas: dict[str, set[str]] = {}

        for development, _capa, unit in unit_rows:
            type_name = tipo_lookup.get(str(unit.get("tipo_id") or "")) or "Sin tipo"
            type_counts[type_name] = type_counts.get(type_name, 0) + 1
            dev_name = str(development.get("nombre") or "Sin nombre").strip()
            if not dev_name:
                dev_name = "Sin nombre"
            per_dev = development_type_counts.setdefault(dev_name, {})
            per_dev[type_name] = per_dev.get(type_name, 0) + 1
            development_units.setdefault(dev_name, []).append(unit)
            area_text = _format_unit_area(unit)
            if area_text:
                development_areas.setdefault(dev_name, set()).add(area_text)

        lines.append(f"Desarrollos detectados: {development_count}")
        if type_counts:
            lines.append("Unidades por tipo:")
            for type_name, count in sorted(type_counts.items(), key=lambda item: (-item[1], item[0].lower())):
                lines.append(f"- {type_name}: {count}")

        lines.append("Desarrollos / áreas detectadas:")
        for development in features[:10]:
            name = str(development.get("nombre") or "").strip()
            if not name:
                continue
            dev_type = str(development.get("tipo") or "").strip()
            status = str(development.get("status") or "").strip()
            location_text = _format_development_location(development)
            unit_summary = development_type_counts.get(name) or {}
            total_units = sum(unit_summary.values())
            header_bits = [name]
            if dev_type:
                header_bits.append(dev_type)
            if status:
                header_bits.append(status)
            if total_units:
                header_bits.append(f"{total_units} unidades")
            if location_text:
                header_bits.append(location_text)
            lines.append(f"- {' | '.join(header_bits)}")
            area_values = development_areas.get(name) or set()
            if area_values:
                numeric_areas = [value for value in (_coerce_numeric_area(area) for area in area_values) if value is not None]
                if numeric_areas:
                    min_area = min(numeric_areas)
                    max_area = max(numeric_areas)
                    lines.append(f"  Rango de superficie: {min_area:g} m² a {max_area:g} m²")
                ordered_areas = sorted(
                    area_values,
                    key=lambda value: (_coerce_numeric_area(value) if _coerce_numeric_area(value) is not None else float("inf"), value),
                )
                lines.append(f"  Medidas disponibles: {', '.join(f'{value} m²' for value in ordered_areas)}")
            if unit_summary:
                summary_bits = ", ".join(
                    f"{type_name} {count}"
                    for type_name, count in sorted(unit_summary.items(), key=lambda item: (-item[1], item[0].lower()))
                )
                lines.append(f"  Tipos: {summary_bits}")
            sample_units = development_units.get(name, [])[:6]
            if sample_units:
                lines.append("  Ejemplos:")
                for unit in sample_units:
                    unit_name = str(unit.get("nombre") or unit.get("unidad") or "").strip()
                    if not unit_name:
                        continue
                    area = _format_unit_area(unit)
                    price = _format_unit_price(unit)
                    unit_status = str(unit.get("status") or "").strip()
                    metadata = _parse_metadata_dict(unit.get("metadata"))
                    metadata_bits: list[str] = []
                    if metadata:
                        for key in ("m2_de_terreno", "area_m2", "superficie"):
                            value = metadata.get(key)
                            if value:
                                metadata_bits.append(f"{key}: {value}")
                                break
                    pieces = [unit_name]
                    if area:
                        pieces.append(f"{area} m²")
                    if price:
                        pieces.append(f"precio {price}")
                    if unit_status:
                        pieces.append(unit_status)
                    if metadata_bits:
                        pieces.append("; ".join(metadata_bits))
                    lines.append(f"    - {' | '.join(pieces)}")

    if not features:
        fraccionamientos = await list_catalog_fraccionamientos(
            repo,
            org_uuid,
            include_inactive=include_inactive,
        )
        modelos = await list_catalog_modelos(
            repo,
            org_uuid,
            include_inactive=include_inactive,
            limit=500,
        )
        if fraccionamientos:
            lines.append("Desarrollos / áreas detectadas:")
            for fraccionamiento in fraccionamientos[:10]:
                nombre = str(fraccionamiento.get("nombre") or "").strip()
                if not nombre:
                    continue
                ubicaciones = fraccionamiento.get("ubicaciones")
                location_text = None
                if isinstance(ubicaciones, list) and ubicaciones:
                    first_location = ubicaciones[0]
                    if isinstance(first_location, dict):
                        location_parts = [
                            first_location.get("colonia"),
                            first_location.get("municipio_nombre"),
                            first_location.get("estado_nombre"),
                        ]
                        location_text = ", ".join(
                            str(part).strip()
                            for part in location_parts
                            if isinstance(part, str) and part.strip()
                        )
                if location_text:
                    lines.append(f"- {nombre} ({location_text})")
                else:
                    lines.append(f"- {nombre}")
                prototipos = [
                    str(value).strip()
                    for value in (fraccionamiento.get("prototipos") or [])
                    if isinstance(value, str) and value.strip()
                ]
                if prototipos:
                    lines.append(f"  Prototipos: {', '.join(prototipos[:8])}")

        lineas_result = modelos.get("lineas") or []
        if lineas_result:
            lines.append("Lotes / terrenos detectados:")
            for linea in lineas_result:
                familias = linea.get("familias") if isinstance(linea, dict) else None
                if not isinstance(familias, list):
                    continue
                for familia in familias:
                    if not isinstance(familia, dict):
                        continue
                    familia_nombre = str(familia.get("nombre") or "").strip()
                    if not familia_nombre:
                        continue
                    modelos_familia = familia.get("modelos")
                    if not isinstance(modelos_familia, list) or not modelos_familia:
                        continue
                    lines.append(f"- {familia_nombre}:")
                    for model in modelos_familia[:12]:
                        if not isinstance(model, dict):
                            continue
                        nombre = str(model.get("nombre") or "").strip()
                        if not nombre:
                            continue
                        area = _extract_item_area(model)
                        price = _extract_item_price(model)
                        location = _extract_item_location(model)
                        bits: list[str] = [nombre]
                        if area:
                            bits.append(f"{area} m²")
                        if price:
                            bits.append(f"precio {price}")
                        if location:
                            bits.append(location)
                        lines.append(f"  - {' | '.join(bits)}")

    if len(lines) == 1:
        return None
    snapshot = "\n".join(lines)
    _inventory_snapshot_cache[cache_key] = (monotonic(), snapshot)
    return snapshot


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
    if _should_skip_catalog_autoload(prompt):
        logger.debug(
            "catalog_context.skipped_for_price_query",
            extra={"query": prompt[:120]},
        )
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
