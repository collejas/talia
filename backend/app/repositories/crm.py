"""Repositorio para interactuar con las tablas CRM en Supabase."""

from __future__ import annotations

import asyncio
from difflib import SequenceMatcher
import json
import re
import time
import unicodedata
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import lru_cache
from hashlib import sha1
from time import monotonic
from typing import Any, Iterable, Literal, Mapping, Sequence
from urllib.parse import quote as urlquote, urlparse
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx

from app.core.config import resolve_log_path, settings
from app.core.logging import get_logger
from app.data.geo.locations import get_municipality_name, get_state_name, list_states
from app.services.phone_utils import normalize_phone, normalize_phone_digits


class CRMRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase CRM."""


def _normalize_pipeline_stage_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    code = str(normalized.get("codigo") or "").strip().lower()
    if code == "demo":
        normalized["nombre"] = "Cita agendada"
    elif code == "ganado" or code.endswith("_ganado"):
        normalized["codigo"] = "cerrado_ganado"
        normalized["nombre"] = "Cerrado · Ganado"
        if not normalized.get("categoria"):
            normalized["categoria"] = "ganada"
    elif code == "perdido" or code.endswith("_perdido"):
        normalized["codigo"] = "cerrado_perdido"
        normalized["nombre"] = "Cerrado · Perdido"
        if not normalized.get("categoria"):
            normalized["categoria"] = "perdida"
    return normalized


def _align_postgrest_bulk_items(items: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Alinea las llaves de un lote antes de enviarlo a PostgREST."""

    normalized_items = [dict(item) for item in items]
    if not normalized_items:
        return []

    all_keys: list[str] = []
    seen_keys: set[str] = set()
    for row in normalized_items:
        for key in row:
            if key in seen_keys:
                continue
            seen_keys.add(key)
            all_keys.append(key)

    for row in normalized_items:
        for key in all_keys:
            row.setdefault(key, None)

    return normalized_items


QUOTE_WITH_ITEMS_SELECT = "*,items:lead_cotizacion_items(*,catalog_item:catalog_items(id,slug,nombre,tipo,unidad,precio_base,moneda,impuestos,activo,descripcion,descripcion_corta,descripcion_larga,maneja_inventario))"

PROSPECTOS_ENVIO_IDS_CACHE_TTL_SECONDS = 30.0
PROSPECTOS_SCRAPER_IDS_CACHE_TTL_SECONDS = 30.0
PROSPECTOS_IDS_CACHE_MAX_ENTRIES = 256
_PROSPECTOS_ENVIO_IDS_CACHE: dict[str, tuple[float, set[str]]] = {}
_PROSPECTOS_SCRAPER_IDS_CACHE: dict[str, tuple[float, set[str]]] = {}
SUPABASE_CONNECTIVITY_LOG_FILE = resolve_log_path("supabase-connectivity.log")
SUPABASE_TRANSIENT_MARKERS = (
    "error de red al llamar supabase",
    "no address associated with hostname",
    "temporary failure in name resolution",
    "name or service not known",
    "connecttimeout",
    "connect timeout",
    "timed out",
    "timeout",
    "connection reset",
    "temporarily unavailable",
)
LATEST_ENVIOS_BY_PHONES_CACHE_TTL_SECONDS = 60.0
LATEST_ENVIOS_BY_PHONES_CACHE_MAX_ENTRIES = 64
_LATEST_ENVIOS_BY_PHONES_CACHE: dict[str, tuple[float, dict[str, dict[str, Any]]]] = {}
_LATEST_ENVIOS_BY_PHONES_CACHE_LOCK = asyncio.Lock()


def _next_sequential_code(prefix: str, existing_codes: Sequence[Any], *, width: int = 3) -> str:
    prefix_clean = prefix.strip()
    prefix_lower = prefix_clean.lower()
    highest = 0
    for raw_code in existing_codes:
        code = str(raw_code or "").strip()
        if not code.lower().startswith(prefix_lower):
            continue
        suffix = code[len(prefix_clean) :].strip()
        match = re.search(r"(\d+)$", suffix)
        if not match:
            continue
        try:
            highest = max(highest, int(match.group(1)))
        except ValueError:
            continue
    return f"{prefix_clean}{highest + 1:0{width}d}"


def _is_account_code_duplicate_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "cuentas_org_codigo_cuenta_uidx" in message
        or 'unique constraint "cuentas_org_codigo_cuenta_uidx"' in message
        or ("duplicate key value violates unique constraint" in message and "codigo_cuenta" in message)
    )


def _normalize_account_type_payload(payload: dict[str, Any]) -> dict[str, Any]:
    body = dict(payload)
    raw_tipo = str(body.get("tipo") or body.get("tipo_cuenta") or "").strip().lower()
    raw_persona = str(body.get("tipo_persona") or "").strip().lower()
    raw_code = str(body.get("codigo_cuenta") or "").strip().upper()

    normalized_tipo = ""
    if raw_tipo in {"persona_fisica_actividad_empresarial", "pfae"}:
        normalized_tipo = "persona_fisica_actividad_empresarial"
    elif raw_tipo in {"empresa", "moral"}:
        normalized_tipo = "empresa"
    elif raw_persona == "fisica":
        normalized_tipo = "persona_fisica_actividad_empresarial"
    elif raw_persona == "moral":
        normalized_tipo = "empresa"
    elif raw_code.startswith("PFAE-"):
        normalized_tipo = "persona_fisica_actividad_empresarial"
    elif raw_code.startswith("EMP-"):
        normalized_tipo = "empresa"

    if normalized_tipo:
        body["tipo"] = normalized_tipo
        if "tipo_cuenta" in body:
            body["tipo_cuenta"] = normalized_tipo

    # `cuentas` no tiene columna `tipo_persona`; ese dato solo se usa como señal de entrada.
    body.pop("tipo_persona", None)

    return body


def _is_opportunity_code_duplicate_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "oportunidades_org_codigo_oportunidad_uidx" in message
        or 'unique constraint "oportunidades_org_codigo_oportunidad_uidx"' in message
        or (
            "duplicate key value violates unique constraint" in message
            and "codigo_oportunidad" in message
        )
    )


def _is_opportunity_request_id_duplicate_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "oportunidades_request_id_uidx" in message
        or 'unique constraint "oportunidades_request_id_uidx"' in message
        or ("duplicate key value violates unique constraint" in message and "request_id" in message)
    )


def _is_persona_request_id_duplicate_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "personas_request_id_uidx" in message
        or 'unique constraint "personas_request_id_uidx"' in message
        or ("duplicate key value violates unique constraint" in message and "request_id" in message)
    )


def _is_whats_prosp_template_duplicate_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "prospeccion_contacto_templates_whats_prosp_meta_unique" in message
        or (
            "duplicate key value violates unique constraint" in message
            and "template_name" in message
            and "language_code" in message
        )
    )


def _is_request_id_schema_cache_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "pgrst204" in message
        and "request_id" in message
        and ("schema cache" in message or "could not find" in message)
    )


def _is_active_crm_row(row: Mapping[str, Any]) -> bool:
    archived_at = row.get("archived_at")
    merged_persona = row.get("merged_into_persona_id")
    merged_cuenta = row.get("merged_into_cuenta_id")
    estado = str(row.get("estado") or "").strip().lower()
    return archived_at is None and merged_persona is None and merged_cuenta is None and estado != "fusionado"

PERSONA_SELECT_FIELDS = (
    "id,organizacion_id,codigo_contacto,nombre,apellido_paterno,apellido_materno,nombre_completo,"
    "correo_principal,correo_secundario,correo_institucional,correo_personal_3,"
    "telefono_principal_e164,telefono_principal_tipo_linea,telefono_principal_extension,telefono_movil_1_e164,telefono_movil_1_tipo_linea,telefono_movil_2_e164,telefono_movil_2_tipo_linea,telefono_movil_2_extension,telefono_secundario_e164,telefono_secundario_tipo_linea,telefono_secundario_extension,"
    "telefono_empresa_1_e164,telefono_empresa_1_extension,telefono_empresa_2_e164,telefono_empresa_2_extension,"
    "puesto,area,rol_decision,estado,"
    "clave_entidad,entidad,clave_municipio,municipio,pais,"
    "origen,notas,metadata,persona_datos,propietario_usuario_id,creado_en,actualizado_en,"
    "archived_at,merged_into_persona_id,merge_metadata"
)
PERSONA_WHATSAPP_SELECT_FIELDS = (
    "id,organizacion_id,nombre,apellido_paterno,apellido_materno,nombre_completo,"
    "correo_principal,correo_secundario,correo_institucional,telefono_principal_e164,"
    "telefono_movil_1_e164,telefono_movil_2_e164,telefono_secundario_e164,"
    "telefono_empresa_1_e164,telefono_empresa_2_e164,telefono_principal_tipo_linea,"
    "telefono_movil_1_tipo_linea,telefono_movil_2_tipo_linea,telefono_secundario_tipo_linea,"
    "telefono_empresa_1_extension,telefono_empresa_2_extension,estado,origen,creado_en,"
    "actualizado_en,clave_entidad,entidad,clave_municipio,municipio,pais,notas,metadata,persona_datos"
)
PERSONA_ESTADO_VALIDOS = {"lead", "activo", "inactivo", "bloqueado", "fusionado"}
PERSONA_ESTADO_ALIAS = {
    "nuevo": "lead",
    "nueva": "lead",
    "prospecto": "lead",
    "prospecta": "lead",
    "lead": "lead",
    "activo": "activo",
    "activa": "activo",
    "cliente": "activo",
    "cliente_activo": "activo",
    "inactivo": "inactivo",
    "inactiva": "inactivo",
    "bloqueado": "bloqueado",
    "bloqueada": "bloqueado",
    "fusionado": "fusionado",
    "fusionada": "fusionado",
}


def _is_transient_supabase_error_message(value: Any) -> bool:
    message = str(value or "").lower()
    return any(marker in message for marker in SUPABASE_TRANSIENT_MARKERS)


def _append_supabase_connectivity_event(entry: dict[str, Any]) -> None:
    try:
        Path(SUPABASE_CONNECTIVITY_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
        with SUPABASE_CONNECTIVITY_LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(f"{json.dumps(entry, default=str)}\n")
    except Exception:
        # Best-effort: nunca romper flujo principal por falla de observabilidad.
        pass


def _normalize_provider_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        numeric = float(raw)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    if numeric > 10_000_000_000:
        numeric /= 1000.0
    return datetime.fromtimestamp(numeric, tz=timezone.utc)


def _coerce_uuid(value: Any, *, field: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise CRMRepositoryError(f"{field}_invalid") from exc


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return _coerce_uuid(value, field="uuid")
    except CRMRepositoryError:
        return None


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    return text in {"1", "true", "t", "yes", "y", "on"}


def _normalize_account_direction_relation_type(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "sucursal"
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("-", "_").replace(" ", "_").casefold()
    alias_map = {
        "operativa": "principal",
        "principal": "principal",
        "fiscal": "fiscal",
        "facturacion": "fiscal",
        "sucursal": "sucursal",
        "envio": "sucursal",
        "historial": "sucursal",
        "otro": "sucursal",
    }
    return alias_map.get(normalized, normalized if normalized in {"fiscal", "principal", "sucursal"} else "sucursal")


def _account_direction_relation_type_for_storage(value: Any) -> str:
    return _normalize_account_direction_relation_type(value)


def _ensure_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_persona_estado(value: Any) -> str:
    raw = _clean_text(value)
    if not raw:
        return "lead"
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("-", "_").replace(" ", "_").casefold()
    if normalized in PERSONA_ESTADO_ALIAS:
        return PERSONA_ESTADO_ALIAS[normalized]
    if normalized in PERSONA_ESTADO_VALIDOS:
        return normalized
    return "lead"


def _normalize_trade_responsibility(value: Any) -> str | None:
    raw = _clean_text(value)
    if not raw:
        return None
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("-", "_").replace(" ", "_").casefold()
    if "compr" in normalized or normalized in {"buyer", "buyer_side"}:
        return "comprador"
    if "vend" in normalized or normalized in {"seller", "seller_side"}:
        return "vendedor"
    return None


def _deep_merge_metadata(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if value is None:
            continue
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge_metadata(existing, value)
            continue
        merged[key] = value
    return merged


def _normalize_opportunity_payload(
    payload: dict[str, Any],
    *,
    include_metadata: bool = False,
    allow_title_fallback: bool = False,
) -> dict[str, Any]:
    """Materializa campos de oportunidades que antes se leían desde metadata."""

    body = dict(payload)
    metadata_present = "metadata" in body
    metadata = _ensure_metadata(body.get("metadata"))
    metadata_changed = False

    def _set_metadata(key: str, value: Any) -> None:
        nonlocal metadata_changed
        if value is None:
            return
        metadata[key] = value
        metadata_changed = True

    canal_raw = body.get("canal")
    if not isinstance(canal_raw, str) or not canal_raw.strip():
        canal_raw = metadata.get("canal") or metadata.get("channel")
    canal = str(canal_raw or "").strip().lower()
    if canal:
        body["canal"] = canal
        _set_metadata("canal", canal)
        _set_metadata("channel", canal)

    contacto_nombre_raw = body.get("contacto_nombre")
    if not isinstance(contacto_nombre_raw, str) or not contacto_nombre_raw.strip():
        contacto_nombre_raw = metadata.get("contacto_nombre")
    if (not isinstance(contacto_nombre_raw, str) or not contacto_nombre_raw.strip()) and allow_title_fallback:
        titulo_raw = body.get("titulo")
        if isinstance(titulo_raw, str) and titulo_raw.strip():
            contacto_nombre_raw = titulo_raw
    contacto_nombre = str(contacto_nombre_raw or "").strip()
    if contacto_nombre:
        body["contacto_nombre"] = contacto_nombre
        _set_metadata("contacto_nombre", contacto_nombre)

    restart_sequence_raw = body.get("restart_sequence")
    if restart_sequence_raw is None or str(restart_sequence_raw).strip() == "":
        restart_sequence_raw = metadata.get("restart_sequence")
    if restart_sequence_raw is not None and str(restart_sequence_raw).strip() != "":
        restart_sequence = _coerce_positive_int(restart_sequence_raw, default=1)
        body["restart_sequence"] = restart_sequence
        _set_metadata("restart_sequence", restart_sequence)

    if include_metadata or metadata_present or metadata_changed:
        body["metadata"] = metadata
    else:
        body.pop("metadata", None)
    return body


def _postgrest_in_clause(values: Iterable[str]) -> str:
    quoted: list[str] = []
    for value in values:
        text = str(value or "")
        escaped = text.replace('"', '""')
        quoted.append(f'"{escaped}"')
    return f"in.({','.join(quoted)})"


def _postgrest_eq_literal(value: str) -> str:
    return urlquote(value, safe="")


def _postgrest_ilike_literal(value: str) -> str:
    """Build a PostgREST literal for case-insensitive ilike filters."""
    literal = _postgrest_eq_literal(value)
    return f"*{literal}*"


def _postgrest_presence_clause(fields: Sequence[str], present: bool) -> str:
    if not fields:
        raise ValueError("fields must not be empty")
    joiner = "or" if present else "and"
    parts = []
    for field in fields:
        if present:
            parts.append(f"{field}.not.is.null")
        else:
            parts.append(f"{field}.is.null")
    return f"{joiner}({','.join(parts)})"


def _resolve_timezone_zone(value: str | None) -> ZoneInfo:
    tz_name = (value or settings.webchat_calendar_timezone or "America/Mexico_City").strip()
    if not tz_name:
        tz_name = "America/Mexico_City"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def _make_json_serializable(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _make_json_serializable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_make_json_serializable(item) for item in value]
    return value


def _sanitize_search_pattern(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed.replace("%", "").replace("*", "")


def _search_variants(value: str | None) -> list[str]:
    sanitized = _sanitize_search_pattern(value)
    if not sanitized:
        return []
    variants: list[str] = []
    seen: set[str] = set()
    for candidate in (
        sanitized,
        unicodedata.normalize("NFKD", sanitized).encode("ascii", "ignore").decode("ascii"),
    ):
        for raw_term in re.split(r"\s+", candidate):
            text = raw_term.strip()
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            variants.append(text)
    return variants


def _build_search_clause(fields: Sequence[str], value: str | None) -> str | None:
    variants = _search_variants(value)
    if not variants:
        return None
    groups: list[str] = []
    for term in variants:
        pattern = _postgrest_ilike_literal(term)
        groups.append("or(" + ",".join(f"{field}.ilike.{pattern}" for field in fields) + ")")
    if len(groups) == 1:
        return groups[0]
    return "and(" + ",".join(groups) + ")"


def _normalize_search_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(normalized.split())


def _search_row_text(row: dict[str, Any]) -> str:
    parts: list[str] = []

    def _collect(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, str):
            cleaned = _normalize_search_text(value)
            if cleaned:
                parts.append(cleaned)
            return
        if isinstance(value, dict):
            for inner in value.values():
                _collect(inner)
            return
        if isinstance(value, list):
            for inner in value:
                _collect(inner)

    # El buscador del embudo debe ser semántico, pero deliberadamente acotado
    # a los campos que el usuario reconoce como datos de la oportunidad.
    for key in (
        "codigo_oportunidad",
        "titulo",
        "descripcion",
        "contacto_nombre",
        "correo",
        "proyecto_nombre",
        "proyecto_necesidades",
    ):
        _collect(row.get(key))

    metadata = row.get("metadata")
    if isinstance(metadata, dict):
        for key in ("project_name", "proyecto_necesidades"):
            _collect(metadata.get(key))

    contacto = row.get("contacto")
    if isinstance(contacto, dict):
        for key in (
            "nombre_completo",
            "correo_principal",
            "correo_secundario",
            "correo_institucional",
            "correo",
        ):
            _collect(contacto.get(key))
    return " ".join(parts)


def _opportunity_code_search_candidates(value: str | None) -> list[str]:
    sanitized = _sanitize_search_pattern(value)
    if not sanitized:
        return []

    normalized = re.sub(r"[\s._/\\-]+", "", sanitized).casefold()
    candidates: list[str] = []
    seen: set[str] = set()

    def _push(candidate: str | None) -> None:
        text = str(candidate or "").strip()
        if not text:
            return
        key = text.casefold()
        if key in seen:
            return
        seen.add(key)
        candidates.append(text)

    _push(sanitized)
    _push(sanitized.replace(" ", ""))
    _push(sanitized.replace(" ", "").replace("_", "-"))

    match = re.search(r"opo(\d{1,})$", normalized)
    if match:
        number = int(match.group(1))
        _push(f"Opo-{number:04d}")
        _push(f"Opo-{number}")

    return candidates


_EMAIL_PATTERN = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.IGNORECASE)


def _extract_email_values(value: Any) -> list[str]:
    emails: list[str] = []

    def _collect(candidate: Any) -> None:
        if candidate is None:
            return
        if isinstance(candidate, str):
            normalized = _normalize_search_text(candidate)
            if not normalized:
                return
            emails.extend(match.casefold() for match in _EMAIL_PATTERN.findall(normalized))
            return
        if isinstance(candidate, dict):
            for inner in candidate.values():
                _collect(inner)
            return
        if isinstance(candidate, list):
            for inner in candidate:
                _collect(inner)

    _collect(value)
    deduped: list[str] = []
    seen: set[str] = set()
    for email in emails:
        if email in seen:
            continue
        seen.add(email)
        deduped.append(email)
    return deduped


def _matches_email_filter(row: dict[str, Any], query: str | None) -> bool:
    variants = _search_variants(query)
    if not variants:
        return True
    candidate_values: list[Any] = []
    candidate_values.append(row.get("correo"))

    metadata = row.get("metadata")
    if isinstance(metadata, dict):
        candidate_values.extend(
            metadata.get(key)
            for key in (
                "correo",
                "email",
                "contacto_correo",
                "contacto_email",
                "contact_email",
                "correo_principal",
                "correo_secundario",
                "correo_institucional",
                "cuenta_correo_principal",
                "cuenta_correo_secundario",
            )
        )

    contacto = row.get("contacto")
    if isinstance(contacto, dict):
        candidate_values.extend(
            contacto.get(key)
            for key in (
                "correo",
                "email",
                "correo_principal",
                "correo_secundario",
                "correo_institucional",
            )
        )

    cuenta = row.get("cuenta")
    if isinstance(cuenta, dict):
        candidate_values.extend(
            cuenta.get(key)
            for key in (
                "correo",
                "email",
                "correo_principal",
                "correo_secundario",
                "correo_institucional",
            )
        )

    emails: list[str] = []
    for candidate in candidate_values:
        emails.extend(_extract_email_values(candidate))
    if not emails:
        return False
    for term in variants:
        normalized_term = _normalize_search_text(term)
        if not normalized_term:
            continue
        if any(email.startswith(normalized_term) for email in emails):
            continue
        return False
    return True


def _matches_search_query(row: dict[str, Any], query: str | None) -> bool:
    variants = _search_variants(query)
    if not variants:
        return True
    haystack = _search_row_text(row)
    if not haystack:
        return False
    haystack_tokens = haystack.split()
    for term in variants:
        normalized_term = _normalize_search_text(term)
        if not normalized_term:
            continue
        if normalized_term in haystack:
            continue
        if any(normalized_term in token or token in normalized_term for token in haystack_tokens):
            continue
        if any(SequenceMatcher(None, normalized_term, token).ratio() >= 0.72 for token in haystack_tokens):
            continue
        return False
    return True


def _normalize_geo_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(normalized.split())


def _digits_only(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _phone_lookup_variants(value: Any) -> list[str]:
    trimmed = str(value or "").strip()
    if not trimmed:
        return []
    variants: list[str] = []
    seen: set[str] = set()

    def _push(candidate: str | None) -> None:
        text = str(candidate or "").strip()
        if not text or text in seen:
            return
        seen.add(text)
        variants.append(text)

    _push(trimmed)
    normalized = normalize_phone(trimmed)
    normalized_digits = normalize_phone_digits(trimmed)
    _push(normalized)
    _push(normalized_digits)

    digits_only = _digits_only(trimmed)
    _push(digits_only)

    if normalized_digits:
        if normalized_digits.startswith("521") and len(normalized_digits) >= 13:
            national = normalized_digits[3:]
            alt_52 = f"52{national}"
            _push(national)
            _push(alt_52)
            _push(f"+{alt_52}")
            _push(f"521521{national}")
            _push(f"+521521{national}")
        elif normalized_digits.startswith("52") and len(normalized_digits) >= 12:
            national = normalized_digits[2:]
            _push(national)
            _push(f"+{normalized_digits}")
    return variants


def _extract_geo_values(container: Any, keys: Sequence[str]) -> list[str]:
    if not isinstance(container, dict):
        return []
    values: list[str] = []
    for key in keys:
        value = container.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            values.append(text)
    return values


@lru_cache(maxsize=1)
def _known_state_names_normalized() -> tuple[str, ...]:
    names: list[str] = []
    seen: set[str] = set()
    for item in list_states():
        raw = item.get("name")
        normalized = _normalize_geo_text(raw)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        names.append(normalized)
    names.sort(key=len, reverse=True)
    return tuple(names)


def _extract_state_names_from_text(text: str) -> set[str]:
    normalized_text = _normalize_geo_text(text)
    if not normalized_text:
        return set()
    matches: list[str] = []
    for state_name in _known_state_names_normalized():
        if state_name not in normalized_text:
            continue
        pattern = r"(^|[^a-z0-9])" + r"\s+".join(re.escape(part) for part in state_name.split()) + r"([^a-z0-9]|$)"
        if re.search(pattern, normalized_text):
            matches.append(state_name)
    pruned: set[str] = set()
    for candidate in matches:
        if any(other != candidate and other.startswith(candidate + " ") for other in matches):
            continue
        pruned.add(candidate)
    return pruned


def _row_matches_geo_filters(
    row: dict[str, Any],
    *,
    geo_estado: str | None = None,
    geo_municipio: str | None = None,
) -> bool:
    metadata = _ensure_metadata(row.get("metadata"))
    busqueda_meta = metadata.get("busqueda_meta") if isinstance(metadata.get("busqueda_meta"), dict) else {}
    ubicacion_meta = metadata.get("ubicacion") if isinstance(metadata.get("ubicacion"), dict) else {}
    ubicacion_busqueda = (
        busqueda_meta.get("ubicacion") if isinstance(busqueda_meta.get("ubicacion"), dict) else {}
    )

    state_code_keys = ("estado_cve", "cve_ent", "state_code", "codigo_estado")
    state_name_keys = (
        "estado",
        "estado_nombre",
        "nom_ent",
        "state",
        "entidad",
        "entidad_federativa",
    )
    municipality_code_keys = ("municipio_cve", "cve_mun", "municipio_code", "codigo_municipio")
    municipality_name_keys = ("municipio", "municipio_nombre", "nom_mun", "city", "localidad")

    state_code_values: list[str] = _extract_geo_values(row, state_code_keys)
    state_name_values: list[str] = _extract_geo_values(row, state_name_keys)
    municipality_code_values: list[str] = _extract_geo_values(row, municipality_code_keys)
    municipality_name_values: list[str] = _extract_geo_values(row, municipality_name_keys)

    # Legacy fallback: only inspect metadata when the row does not already expose
    # normalized geo columns. This keeps the exact-column path authoritative.
    if not state_code_values and not state_name_values:
        for source in (metadata, busqueda_meta, ubicacion_meta, ubicacion_busqueda):
            state_code_values.extend(_extract_geo_values(source, state_code_keys))
            state_name_values.extend(_extract_geo_values(source, state_name_keys))
    if not municipality_code_values and not municipality_name_values:
        for source in (metadata, busqueda_meta, ubicacion_meta, ubicacion_busqueda):
            municipality_code_values.extend(_extract_geo_values(source, municipality_code_keys))
            municipality_name_values.extend(_extract_geo_values(source, municipality_name_keys))

    if geo_estado:
        raw_state = str(geo_estado).strip()
        expected_state_digits = _digits_only(raw_state)
        expected_state_code = expected_state_digits[-2:].zfill(2) if expected_state_digits else None
        state_name_candidates: list[str] = []
        if expected_state_code:
            state_name_candidates.extend(_search_variants(get_state_name(expected_state_code)))
        else:
            state_name_candidates.extend(_search_variants(raw_state))

        state_match = False
        if expected_state_code:
            compact = expected_state_code.lstrip("0")
            for value in state_code_values:
                candidate_digits = _digits_only(value)
                if not candidate_digits:
                    continue
                padded = candidate_digits[-2:].zfill(2)
                if padded == expected_state_code or (compact and candidate_digits == compact):
                    state_match = True
                    break
        if not state_match and state_name_candidates:
            normalized_state_names = {_normalize_geo_text(value) for value in state_name_values if _normalize_geo_text(value)}
            for name_candidate in state_name_candidates:
                normalized_candidate = _normalize_geo_text(name_candidate)
                if normalized_candidate and normalized_candidate in normalized_state_names:
                    state_match = True
                    break
        if not state_match:
            return False

    if geo_municipio:
        raw_municipality = str(geo_municipio).strip()
        expected_municipality_digits = _digits_only(raw_municipality)
        expected_municipality_code = (
            expected_municipality_digits[-3:].zfill(3) if expected_municipality_digits else None
        )
        state_for_municipality_digits = _digits_only(geo_estado)
        state_for_municipality_code = (
            state_for_municipality_digits[-2:].zfill(2) if state_for_municipality_digits else None
        )
        municipality_name_candidates: list[str] = []
        if expected_municipality_code:
            municipality_name_candidates.extend(
                _search_variants(get_municipality_name(state_for_municipality_code, expected_municipality_code))
            )
        else:
            municipality_name_candidates.extend(_search_variants(raw_municipality))

        municipality_match = False
        if expected_municipality_code:
            compact = expected_municipality_code.lstrip("0")
            for value in municipality_code_values:
                candidate_digits = _digits_only(value)
                if not candidate_digits:
                    continue
                padded = candidate_digits[-3:].zfill(3)
                if padded == expected_municipality_code or (compact and candidate_digits == compact):
                    municipality_match = True
                    break
        if not municipality_match and municipality_name_candidates:
            normalized_municipality_names = {
                _normalize_geo_text(value) for value in municipality_name_values if _normalize_geo_text(value)
            }
            for name_candidate in municipality_name_candidates:
                normalized_candidate = _normalize_geo_text(name_candidate)
                if normalized_candidate and normalized_candidate in normalized_municipality_names:
                    municipality_match = True
                    break
        if not municipality_match:
            return False

    return True


def _row_matches_query_filters(
    row: dict[str, Any],
    *,
    query_filters: Sequence[str],
) -> bool:
    if not query_filters:
        return True
    metadata = _ensure_metadata(row.get("metadata"))
    busqueda_meta = metadata.get("busqueda_meta") if isinstance(metadata.get("busqueda_meta"), dict) else {}
    candidates = {
        str(row.get("busqueda_ref") or "").strip(),
        str(row.get("query_sort") or "").strip(),
        str(metadata.get("busqueda_query") or "").strip(),
        str(metadata.get("query") or "").strip(),
    }
    if isinstance(busqueda_meta, dict):
        candidates.add(str(busqueda_meta.get("query") or "").strip())
        candidates.add(str(busqueda_meta.get("busqueda_query") or "").strip())
    normalized_candidates = {value for value in candidates if value}
    if not normalized_candidates:
        return False
    normalized_filters = {str(value or "").strip() for value in query_filters if str(value or "").strip()}
    if not normalized_filters:
        return True
    return bool(normalized_candidates & normalized_filters)


def _build_geo_postgrest_filters(
    *,
    geo_estado: str | None = None,
    geo_municipio: str | None = None,
) -> list[str]:
    """Build PostgREST-compatible geo filters to avoid backend full scans."""

    filters: list[str] = []
    state_code: str | None = None

    if geo_estado:
        raw_state = str(geo_estado).strip()
        state_digits = _digits_only(raw_state)
        if state_digits:
            state_code = state_digits[-2:].zfill(2)
        state_clauses: list[str] = []
        if state_code:
            state_code_literal = _postgrest_eq_literal(state_code)
            state_clauses.append(f"estado_cve.eq.{state_code_literal}")
            state_clauses.append(f"estado_nombre.ilike.{_postgrest_ilike_literal(get_state_name(state_code) or state_code)}")
        else:
            for candidate in _search_variants(raw_state):
                literal = _postgrest_ilike_literal(candidate)
                state_clauses.append(f"estado_nombre.ilike.{literal}")

        if state_clauses:
            filters.append(f"or({','.join(state_clauses)})")

    if geo_municipio:
        raw_municipality = str(geo_municipio).strip()
        municipality_digits = _digits_only(raw_municipality)
        municipality_code = municipality_digits[-3:].zfill(3) if municipality_digits else None
        municipality_clauses: list[str] = []
        if municipality_code:
            municipality_code_literal = _postgrest_eq_literal(municipality_code)
            municipality_clauses.append(f"municipio_cve.eq.{municipality_code_literal}")
            municipality_name = get_municipality_name(state_code, municipality_code) if state_code else None
            if municipality_name:
                municipality_clauses.append(
                    f"municipio_nombre.ilike.{_postgrest_ilike_literal(municipality_name)}"
                )
        else:
            for candidate in _search_variants(raw_municipality):
                literal = _postgrest_ilike_literal(candidate)
                municipality_clauses.append(f"municipio_nombre.ilike.{literal}")

        if municipality_clauses:
            filters.append(f"or({','.join(municipality_clauses)})")

    return filters


def _format_query_geo_state_label(raw_value: Any) -> str | None:
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    if raw.casefold() == "multiple":
        return "Múltiples"
    digits = _digits_only(raw)
    if not digits:
        return raw
    state_code = digits[-2:].zfill(2)
    return get_state_name(state_code) or state_code


def _format_query_geo_municipality_label(raw_value: Any) -> str | None:
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    if raw.casefold() == "multiple":
        return "Múltiples"
    parts = raw.split("::", 1)
    if len(parts) != 2:
        return raw
    state_digits = _digits_only(parts[0])
    municipality_digits = _digits_only(parts[1])
    if not state_digits or not municipality_digits:
        return raw
    state_code = state_digits[-2:].zfill(2)
    municipality_code = municipality_digits[-3:].zfill(3)
    return get_municipality_name(state_code, municipality_code) or f"{state_code}-{municipality_code}"


def _sort_prospect_rows(rows: list[dict[str, Any]], *, order: str | None = None) -> list[dict[str, Any]]:
    """Sort prospect rows consistently when results are assembled in backend chunks."""

    normalized_order = str(order or "").strip().lower()
    if normalized_order.startswith("display_name.asc"):
        return sorted(
            rows,
            key=lambda row: (
                not str(row.get("display_name") or "").strip(),
                str(row.get("display_name") or "").casefold(),
            ),
        )
    return sorted(
        rows,
        key=lambda row: str(row.get("creado_en") or ""),
        reverse=True,
    )


def _build_prospectos_ids_cache_key(
    *,
    usuario_token: str,
    suffix: str,
    organizacion_id: UUID | None = None,
) -> str:
    token_hash = sha1(usuario_token.encode("utf-8")).hexdigest()[:16]
    org_part = str(organizacion_id) if organizacion_id else "__no_org__"
    return f"{token_hash}:{org_part}:{suffix}"


def _read_prospectos_ids_cache(
    cache: dict[str, tuple[float, set[str]]],
    *,
    key: str,
    ttl_seconds: float,
) -> set[str] | None:
    now = monotonic()
    payload = cache.get(key)
    if payload is None:
        return None
    created_at, values = payload
    if now - created_at > ttl_seconds:
        cache.pop(key, None)
        return None
    return set(values)


def _write_prospectos_ids_cache(
    cache: dict[str, tuple[float, set[str]]],
    *,
    key: str,
    values: set[str],
) -> None:
    cache[key] = (monotonic(), set(values))
    if len(cache) <= PROSPECTOS_IDS_CACHE_MAX_ENTRIES:
        return
    oldest_key = min(cache.items(), key=lambda item: item[1][0])[0]
    cache.pop(oldest_key, None)


def _coerce_positive_int(value: Any, default: int = 1) -> int:
    try:
        number = int(value)
        if number > 0:
            return number
    except (TypeError, ValueError):
        pass
    return default


def _build_conversation_history(
    previous_metadata: dict[str, Any],
    new_conversation_id: str,
) -> list[str]:
    """Combina el historial previo de conversaciones con la conversación actual."""
    history: list[str] = []
    prev_history = previous_metadata.get("conversation_history")
    if isinstance(prev_history, list):
        for item in prev_history:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    history.append(trimmed)
    prev_conversation_id = previous_metadata.get("conversation_id")
    if isinstance(prev_conversation_id, str):
        trimmed = prev_conversation_id.strip()
        if trimmed:
            history.append(trimmed)
    history.append(new_conversation_id)
    deduped: list[str] = []
    seen: set[str] = set()
    for item in history:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped


def _is_jwt_expired_error(error: Exception) -> bool:
    return "JWT expired" in str(error)


def _map_fk_delete_error(exc: CRMRepositoryError, detail_key: str) -> CRMRepositoryError:
    if "violates foreign key constraint" in str(exc).lower():
        return CRMRepositoryError(detail_key)
    return exc


class CRMRepository:
    """Cliente ligero contra Supabase REST usando service role."""

    _PIPELINE_SELECT = ",".join(
        [
            "id",
            "organizacion_id",
            "codigo_oportunidad",
            "cuenta_id",
            "persona_id",
            "contacto_principal_id",
            "contacto:personas!oportunidades_contacto_principal_org_fkey("
            "id,nombre_completo,correo_principal,correo_secundario,correo_institucional,telefono_principal_e164,telefono_principal_extension,telefono_movil_1_e164,company_name,notas,origen,estado,metadata,persona_datos"
            ")",
            "etapa_id",
            "titulo",
            "contacto_nombre",
            "canal",
            "restart_sequence",
            "descripcion",
            "monto_estimado",
            "moneda",
            "probabilidad",
            "fecha_cierre_probable",
            "estado",
            "motivo_perdida",
            "propietario_usuario_id",
            "asignado_a_usuario_id",
            "metadata",
            "creado_en",
            "actualizado_en",
            "cerrado_en",
            "asignado:usuarios!oportunidades_asignado_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "propietario:usuarios!oportunidades_propietario_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "etapa:etapas_pipeline!oportunidades_etapa_org_fkey(id,nombre,codigo,categoria,orden,metadata)",
            "cuenta:cuentas!oportunidades_cuenta_org_fkey(id,nombre,telefono,correo,necesidad_proposito)",
        ]
    )

    _stage_cache: dict[str, UUID] = {}
    _stage_code_cache: dict[tuple[str, str], dict[str, Any]] = {}

    _CLIENTE_SELECT = (
        "id,organizacion_id,contacto_id,persona_id,cuenta_id,oportunidad_id,"
        "estado_onboarding,rfc,razon_social,domicilio_fiscal,domicilio_fisico,regimen_fiscal,"
        "datos_facturacion,fuente,monto_estimado,moneda,metadatos,ganado_en,creado_en,actualizado_en,"
        "documentos:cliente_documentos!cliente_documentos_cliente_org_fkey(id,tipo,estado,descripcion,storage_url,"
        "storage_path,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id),"
        "responsables:cliente_responsables!cliente_responsables_cliente_org_fkey(id,nombre,correo,telefono_e164,rol,"
        "es_responsable_principal,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id)"
    )

    _PORTAL_TOKEN_SELECT = (
        "id,cliente_id,organizacion_id,cuenta_id,oportunidad_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        f"cliente:clientes!cliente_portal_tokens_cliente_org_fkey({_CLIENTE_SELECT})"
    )

    _PORTAL_TOKEN_MIN_SELECT = (
        "id,cliente_id,organizacion_id,cuenta_id,oportunidad_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        "cliente:clientes!cliente_portal_tokens_cliente_org_fkey(id)"
    )

    _HISTORY_SELECT = ",".join(
        [
            "id",
            "oportunidad_id",
            "cambiado_en",
            "fuente",
            "motivo",
            "metadata",
            "etapa_origen_id",
            "etapa_destino_id",
            "cambiado_por_usuario_id",
            "etapa_origen:etapas_pipeline!oportunidad_historial_etapa_origen_org_fkey(id,nombre)",
            "etapa_destino:etapas_pipeline!oportunidad_historial_etapa_destino_org_fkey(id,nombre,categoria)",
            "cambiado_por:usuarios!oportunidad_historial_cambiado_por_usuario_org_fkey(id,nombre_completo,correo)",
        ]
    )

    _ACCOUNT_DIRECTION_SELECT = (
        "id,organizacion_id,cuenta_id,direccion_id,tipo_relacion,es_principal,activo,notas,"
        "metadata,creado_en,actualizado_en,"
        "direccion:direcciones!cuenta_direcciones_direccion_org_fkey("
        "id,organizacion_id,tipo,pais,clave_entidad,entidad,clave_municipio,municipio,clave_localidad,localidad,"
        "tipo_vialidad,nombre_vialidad,numero_exterior,letra_exterior,edificio,edificio_piso,numero_interior,"
        "letra_interior,tipo_asentamiento,colonia,tipo_centro_comercial,corredor_industrial,"
        "numero_local,codigo_postal,latitud,longitud,metadata,creado_en,actualizado_en)"
    )

    def __init__(self, *, timeout: float = 10.0, user_token: str | None = None) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise CRMRepositoryError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout
        self._user_token = user_token.strip() if isinstance(user_token, str) and user_token.strip() else None
        self._permission_context_cache: dict[str, Any] | None = None
        self._current_user_perm_cache: dict[str, bool] = {}

    async def list_accounts(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
        lite: bool = False,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": order,
            "limit": str(limit),
            "offset": str(offset),
        }
        if lite:
            params["select"] = "id,organizacion_id,nombre,razon_social,codigo_cuenta,creado_en,actualizado_en"
        else:
            params["select"] = (
                "id,organizacion_id,nombre,alias,tipo,estado,industria,tamano,sitio_web,telefono,correo,direccion,"
                "propietario_usuario_id,propietario:usuarios!cuentas_propietario_usuario_org_fkey(id,nombre_completo,correo),"
                "metadata,creado_en,actualizado_en,codigo_cuenta,razon_social,rfc,regimen_capital,uso_cfdi,metodo_pago,forma_pago,"
                "email_facturacion,tipo_industria,notas,necesidad_proposito,tipo_vialidad,nombre_vialidad,numero_exterior,"
                "letra_exterior,edificio,edificio_piso,numero_interior,letra_interior,tipo_asentamiento,"
                "tipo_centro_comercial,corredor_industrial,numero_local,codigo_postal,clave_entidad,entidad,clave_municipio,"
                "municipio,clave_localidad,localidad,pais,email,website,tipo_establecimiento,latitud,longitud,fecha_incorporacion,"
                "archived_at,merged_into_cuenta_id,merge_metadata"
            )
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cuentas: {data!r}")
        return data

    async def preview_account_code(
        self,
        *,
        organizacion_id: UUID,
        tipo: str | None = None,
    ) -> str:
        tipo_norm = str(tipo or "").strip().lower()
        prefix = "PFAE-" if tipo_norm in {"persona_fisica_actividad_empresarial", "pfae"} else "Emp-"
        rows: list[dict[str, Any]] = []
        offset = 0
        page_size = 200
        while True:
            batch = await self.list_accounts(
                organizacion_id=organizacion_id,
                limit=page_size,
                offset=offset,
                order="creado_en.desc",
            )
            rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
            if offset >= 2000:
                break
        codes = [row.get("codigo_cuenta") for row in rows if isinstance(row, dict)]
        return _next_sequential_code(prefix, codes, width=1)

    async def preview_contact_code(
        self,
        *,
        organizacion_id: UUID,
    ) -> str:
        rows: list[dict[str, Any]] = []
        offset = 0
        page_size = 200
        while True:
            params = {
                "organizacion_id": f"eq.{organizacion_id}",
                "select": "codigo_contacto",
                "order": "creado_en.desc",
                "limit": str(page_size),
                "offset": str(offset),
            }
            resp = await self._request("GET", "/rest/v1/personas", params=params)
            batch = resp.json()
            if not isinstance(batch, list):
                raise CRMRepositoryError(f"Respuesta inesperada al previsualizar codigo de contacto: {batch!r}")
            rows.extend([row for row in batch if isinstance(row, dict)])
            if len(batch) < page_size:
                break
            offset += page_size
            if offset >= 2000:
                break
        codes = [row.get("codigo_contacto") for row in rows if isinstance(row, dict)]
        return _next_sequential_code("Con", codes, width=1)

    async def get_propiedades_geojson(
        self,
        *,
        organizacion_id: UUID,
        nivel: int | None = None,
        tipo_id: UUID | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_organizacion": str(organizacion_id)}
        if nivel is not None:
            payload["p_nivel"] = nivel
        if tipo_id is not None:
            payload["p_tipo"] = str(tipo_id)
        result = await self._rpc("crm_propiedades_geojson", payload)
        if not isinstance(result, dict):
            raise CRMRepositoryError("crm_propiedades_geojson_invalid_response")
        return result

    async def list_propiedades_ventas_vendedores(
        self,
        *,
        organizacion_id: UUID,
        unidad_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"p_organizacion": str(organizacion_id)}
        if unidad_ids:
            payload["p_unidades"] = [str(value) for value in unidad_ids]
        else:
            payload["p_unidades"] = []
        result = await self._rpc("crm_propiedades_ventas_vendedores", payload)
        if result is None:
            return []
        if not isinstance(result, list):
            raise CRMRepositoryError("crm_propiedades_ventas_vendedores_invalid_response")
        return result

    async def get_propiedad_hierarquia(self, *, organizacion_id: UUID) -> dict[str, Any]:
        payload = {"p_organizacion": str(organizacion_id)}
        result = await self._rpc("crm_propiedad_hierarquia", payload)
        if not isinstance(result, dict):
            raise CRMRepositoryError("crm_propiedad_hierarquia_invalid_response")
        return result

    async def create_propiedad(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {**payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedades",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("crm_propiedad_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"crm_propiedad_invalid_response:{row!r}")
        return row

    async def create_propiedad_unidad(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {**payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_unidades",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("crm_propiedad_unidad_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"crm_propiedad_unidad_invalid_response:{row!r}")
        return row

    async def update_propiedad_unidad(
        self,
        *,
        organizacion_id: UUID,
        unidad_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/propiedad_unidades?id=eq.{unidad_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_unidad_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_unidad_invalid_update_response:{row!r}")
        return row

    async def get_propiedad_unidad(
        self,
        *,
        unidad_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{unidad_id}",
            "limit": "1",
            "select": "*",
        }
        resp = await self._request("GET", "/rest/v1/propiedad_unidades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_unidad_invalid_response:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_unidad_invalid_response:{row!r}")
        return row

    async def list_propiedad_unidades_by_capa(
        self,
        *,
        organizacion_id: UUID,
        capa_id: UUID,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_unidades",
            params={
                "nivel_id": f"eq.{capa_id}",
                "select": "id,unidad,manzana_id",
                "limit": "5000",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_unidades_invalid_response:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def create_propiedad_unidad_movimiento(
        self,
        *,
        payload: dict[str, Any],
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any]:
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/propiedad_unidad_movimientos",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_unidad_movimiento_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"propiedad_unidad_movimiento_invalid_response:{row!r}"
            )
        return row

    async def delete_propiedad_unidad(
        self,
        *,
        organizacion_id: UUID,
        unidad_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/propiedad_unidades",
            params={"id": f"eq.{unidad_id}"},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_unidad_delete_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_unidad_invalid_delete_response:{row!r}")
        return row

    async def get_propiedad_capa(
        self,
        *,
        organizacion_id: UUID,
        capa_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{capa_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_capas",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_capa_invalid_response:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_capa_invalid_response:{row!r}")
        return row

    async def list_propiedad_capas_by_desarrollo(
        self,
        *,
        organizacion_id: UUID,
        desarrollo_id: UUID,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_capas",
            params={
                "desarrollo_id": f"eq.{desarrollo_id}",
                "select": "id,nombre,nivel",
                "limit": "1000",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_capas_invalid_response:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_propiedad_desarrollo(
        self,
        *,
        organizacion_id: UUID,
        desarrollo_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{desarrollo_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_desarrollos",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_desarrollo_invalid_response:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_invalid_response:{row!r}")
        return row

    async def list_propiedad_desarrollos_by_ids(
        self,
        *,
        organizacion_id: UUID,
        desarrollo_ids: list[str],
    ) -> list[dict[str, Any]]:
        if not desarrollo_ids:
            return []
        ids = ",".join(str(value) for value in desarrollo_ids)
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"in.({ids})",
            "limit": str(len(desarrollo_ids)),
        }
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_desarrollos",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_desarrollos_invalid_response:{data!r}")
        desarrollos: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            desarrollos.append(row)
        return desarrollos

    async def list_propiedad_desarrollos(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_desarrollos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "select": "id,nombre,tipo,status",
                "limit": "1000",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_desarrollos_invalid_response:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def delete_propiedad_capa(
        self,
        *,
        organizacion_id: UUID,
        capa_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            "/rest/v1/propiedad_capas",
            params={"id": f"eq.{capa_id}"},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_capa_delete_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_capa_invalid_delete_response:{row!r}")
        return row

    async def create_propiedad_manzana(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_manzanas",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_manzana_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_manzana_invalid_response:{row!r}")
        return row

    async def update_propiedad_manzana(
        self,
        *,
        organizacion_id: UUID,
        manzana_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/propiedad_manzanas?id=eq.{manzana_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_manzana_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_manzana_invalid_update_response:{row!r}")
        return row

    async def list_propiedad_manzanas_by_capa(
        self,
        *,
        organizacion_id: UUID,
        capa_id: UUID,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_manzanas",
            params={
                "macrolote_id": f"eq.{capa_id}",
                "select": "id,nombre",
                "limit": "1000",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"propiedad_manzanas_invalid_response:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def delete_propiedad_manzana(
        self,
        *,
        organizacion_id: UUID,
        manzana_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            "/rest/v1/propiedad_manzanas",
            params={"id": f"eq.{manzana_id}"},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_manzana_delete_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_manzana_invalid_delete_response:{row!r}")
        return row

    async def delete_propiedad_desarrollo(
        self,
        *,
        organizacion_id: UUID,
        desarrollo_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            "/rest/v1/propiedad_desarrollos",
            params={"id": f"eq.{desarrollo_id}"},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_desarrollo_delete_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_invalid_delete_response:{row!r}")
        return row

    async def delete_propiedad_poligono(
        self,
        *,
        organizacion_id: UUID,
        poligono_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            "/rest/v1/propiedad_poligonos",
            params={"id": f"eq.{poligono_id}"},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_poligono_delete_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_poligono_invalid_delete_response:{row!r}")
        return row

    async def create_propiedad_desarrollo(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_desarrollos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_desarrollo_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_invalid_response:{row!r}")
        return row

    async def create_propiedad_desarrollo_mix(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_desarrollos_mix",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_desarrollo_mix_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_mix_invalid_response:{row!r}")
        return row

    async def create_propiedad_desarrollo_mix_item(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_desarrollos_mix_items",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_desarrollo_mix_item_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_mix_item_invalid_response:{row!r}")
        return row

    async def create_propiedad_poligono(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_poligonos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_poligono_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_poligono_invalid_response:{row!r}")
        return row

    async def update_propiedad_poligono(
        self,
        *,
        organizacion_id: UUID,
        poligono_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/propiedad_poligonos?id=eq.{poligono_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_poligono_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_poligono_invalid_update_response:{row!r}")
        return row

    async def get_propiedad_poligono(
        self,
        *,
        organizacion_id: UUID,
        target_type: str,
        target_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_poligonos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "target_type": f"eq.{target_type}",
                "target_id": f"eq.{target_id}",
                "limit": "1",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("propiedad_poligono_invalid_response")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_poligono_invalid_response:{row!r}")
        return row

    async def create_propiedad_capa(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_capas",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_capa_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_capa_invalid_response:{row!r}")
        return row

    async def update_propiedad_capa(
        self,
        *,
        organizacion_id: UUID,
        capa_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/propiedad_capas?id=eq.{capa_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_capa_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_capa_update_invalid_response:{row!r}")
        return row

    async def update_propiedad_desarrollo(
        self,
        *,
        organizacion_id: UUID,
        desarrollo_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "PATCH",
            f"/rest/v1/propiedad_desarrollos?id=eq.{desarrollo_id}",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_desarrollo_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_desarrollo_update_invalid_response:{row!r}")
        return row

    async def list_propiedad_tipos(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "GET",
            "/rest/v1/propiedad_tipos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "order": "nombre.asc",
                "select": "id,nombre,descripcion,color",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("propiedad_tipos_invalid_response")
        return [
            {
                "id": str(row.get("id")) if row.get("id") else "",
                "nombre": str(row.get("nombre") or "Sin nombre"),
                "descripcion": row.get("descripcion"),
                "color": str(row.get("color") or "#95A5A6"),
            }
            for row in data
            if isinstance(row, dict)
        ]

    async def create_propiedad_tipo(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/propiedad_tipos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("propiedad_tipo_creation_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"propiedad_tipo_invalid_response:{row!r}")
        return row

    async def create_account(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = _normalize_account_type_payload({"organizacion_id": str(organizacion_id), **payload})
        body.pop("colonia", None)
        body["fecha_incorporacion"] = datetime.now(timezone.utc).isoformat()
        tipo_code = str(body.get("tipo") or body.get("tipo_cuenta") or "")
        codigo_original = str(body.get("codigo_cuenta") or "").strip()
        last_exc: CRMRepositoryError | None = None
        for attempt in range(3):
            if not str(body.get("codigo_cuenta") or "").strip():
                body["codigo_cuenta"] = await self.preview_account_code(
                    organizacion_id=organizacion_id,
                    tipo=tipo_code,
                )
            try:
                resp = await self._request(
                    "POST",
                    "/rest/v1/cuentas",
                    json=body,
                    prefer="return=representation",
                )
                data = resp.json()
                if not isinstance(data, list) or not data:
                    raise CRMRepositoryError("Supabase no devolvió la cuenta creada")
                row = data[0]
                if not isinstance(row, dict):
                    raise CRMRepositoryError(f"Respuesta inválida al crear cuenta: {row!r}")
                return row
            except CRMRepositoryError as exc:
                last_exc = exc
                if not _is_account_code_duplicate_error(exc) or attempt >= 2:
                    raise
                logger.warning(
                    "crm.create_account_retry_codigo",
                    extra={
                        "attempt": attempt + 1,
                        "organizacion_id": str(organizacion_id),
                        "codigo_cuenta": str(body.get("codigo_cuenta") or ""),
                        "codigo_original": codigo_original,
                        "error": str(exc),
                    },
                )
                body["codigo_cuenta"] = await self.preview_account_code(
                    organizacion_id=organizacion_id,
                    tipo=tipo_code,
                )
        raise last_exc or CRMRepositoryError("cuenta_creation_retry_exhausted")

    async def update_account(
        self,
        *,
        organizacion_id: UUID,
        account_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not payload:
            existing = await self.get_account(organizacion_id=organizacion_id, account_id=account_id)
            if existing is None:
                raise CRMRepositoryError("cuenta_no_encontrada")
            return existing

        body = _normalize_account_type_payload(
            {key: value for key, value in payload.items() if key not in {"codigo_cuenta", "fecha_incorporacion"}}
        )
        body.pop("colonia", None)
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{account_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/cuentas",
            params=params,
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("cuenta_no_encontrada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar cuenta: {row!r}")
        return row

    async def delete_account(
        self,
        *,
        organizacion_id: UUID,
        account_id: UUID,
    ) -> None:
        existing = await self.get_account(organizacion_id=organizacion_id, account_id=account_id)
        if not existing:
            raise CRMRepositoryError("cuenta_no_encontrada")

        person_relations_count = await self.count_account_person_relations(
            organizacion_id=organizacion_id,
            cuenta_id=account_id,
            activo=None,
        )
        if person_relations_count:
            raise CRMRepositoryError(f"cuenta_tiene_contactos:{person_relations_count}")

        opportunities_count = await self.count_account_opportunities(
            organizacion_id=organizacion_id,
            cuenta_id=account_id,
        )
        if opportunities_count:
            raise CRMRepositoryError(f"cuenta_tiene_oportunidades:{opportunities_count}")

        address_relations = await self.list_account_address_relations(
            organizacion_id=organizacion_id,
            cuenta_id=account_id,
            activo=None,
        )
        for relation in address_relations:
            relation_id = relation.get("id")
            if not relation_id:
                continue
            await self.delete_account_address_relation(
                organizacion_id=organizacion_id,
                cuenta_id=account_id,
                relacion_id=UUID(str(relation_id)),
            )

        resp = await self._request(
            "DELETE",
            "/rest/v1/cuentas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{account_id}",
            },
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"cuenta_delete_invalid_response:{data!r}")
        if data and not isinstance(data[0], dict):
            raise CRMRepositoryError(f"cuenta_delete_invalid_response:{data[0]!r}")

    async def list_pipelines(
        self,
        *,
        organizacion_id: UUID,
        tablero_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Listar etapas de pipeline, opcionalmente filtradas por tablero."""

        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
        }
        if tablero_id:
            tablero_filter = str(tablero_id)
            params["or"] = (
                f"(metadata->>tablero_id.eq.{tablero_filter})"
            )
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar etapas: {data!r}")
        return [_normalize_pipeline_stage_row(row) for row in data if isinstance(row, dict)]

    async def get_pipeline_stage_by_code(
        self,
        *,
        organizacion_id: UUID,
        code: str,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "codigo": f"eq.{code}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar etapa: {data!r}")
        if not data:
            return None
        stage = data[0]
        if not isinstance(stage, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar etapa: {stage!r}")
        return _normalize_pipeline_stage_row(stage)

    async def list_opportunities(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        persona_id: UUID | None = None,
        etapa_id: UUID | None = None,
        estado: str | None = None,
        asignado_id: UUID | None = None,
        cuenta_id: UUID | None = None,
        canal: str | None = None,
        q: str | None = None,
        monto_min: float | None = None,
        monto_max: float | None = None,
        cierre_desde: str | None = None,
        cierre_hasta: str | None = None,
        creado_desde: str | None = None,
        creado_hasta: str | None = None,
        reinicio_min: int | None = None,
        include_contact_rows: bool = True,
        count_exact: bool = False,
    ) -> tuple[list[dict[str, Any]], int | None]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
            "select": self._PIPELINE_SELECT,
        }
        and_filters: list[str] = []
        if persona_id:
            params["contacto_principal_id"] = f"eq.{persona_id}"
        if etapa_id:
            params["etapa_id"] = f"eq.{etapa_id}"
        if estado:
            params["estado"] = f"eq.{estado}"
        if asignado_id:
            params["asignado_a_usuario_id"] = f"eq.{asignado_id}"
        if cuenta_id:
            params["cuenta_id"] = f"eq.{cuenta_id}"
        if canal:
            params["canal"] = f"eq.{_postgrest_eq_literal(canal.strip().lower())}"
        if q:
            safe = q.replace("%", "").replace(",", " ").strip()
            if safe:
                opportunity_code_terms = [
                    f"codigo_oportunidad.ilike.*{candidate}*"
                    for candidate in _opportunity_code_search_candidates(safe)
                ]
                params["or"] = "(" + ",".join(
                    [
                        f"titulo.ilike.*{safe}*",
                        f"contacto_nombre.ilike.*{safe}*",
                        *opportunity_code_terms,
                    ]
                ) + ")"
        if monto_min is not None:
            and_filters.append(f"monto_estimado.gte.{monto_min}")
        if monto_max is not None:
            and_filters.append(f"monto_estimado.lte.{monto_max}")
        if cierre_desde:
            and_filters.append(f"fecha_cierre_probable.gte.{cierre_desde}")
        if cierre_hasta:
            and_filters.append(f"fecha_cierre_probable.lte.{cierre_hasta}")
        if creado_desde:
            and_filters.append(f"creado_en.gte.{creado_desde}")
        if creado_hasta:
            and_filters.append(f"creado_en.lte.{creado_hasta}")
        if reinicio_min is not None:
            params["restart_sequence"] = f"gte.{reinicio_min}"
        if and_filters:
            params["and"] = "(" + ",".join(and_filters) + ")"
        prefer = "count=exact" if count_exact else None
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params, prefer=prefer)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar oportunidades: {data!r}")
        rows = [row for row in data if isinstance(row, dict)]
        if rows and include_contact_rows:
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=rows,
                source_fields=("contacto_principal_id",),
            )
        total = self._extract_total_count(resp.headers.get("content-range")) if count_exact else None
        return rows, total

    async def list_opportunities_by_ids(
        self,
        *,
        organizacion_id: UUID,
        opportunity_ids: Sequence[UUID],
        include_contact_rows: bool = True,
    ) -> list[dict[str, Any]]:
        unique_ids = sorted({str(opportunity_id) for opportunity_id in opportunity_ids if opportunity_id})
        if not unique_ids:
            return []
        rows: list[dict[str, Any]] = []
        chunk_size = 200
        for start in range(0, len(unique_ids), chunk_size):
            chunk = unique_ids[start : start + chunk_size]
            params = {
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"in.({','.join(chunk)})",
                "select": self._PIPELINE_SELECT,
                "order": "creado_en.desc",
                "limit": str(len(chunk)),
            }
            resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
            data = resp.json()
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar oportunidades por id: {data!r}")
            rows.extend(row for row in data if isinstance(row, dict))
        if rows and include_contact_rows:
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=rows,
                source_fields=("contacto_principal_id",),
            )
        return rows

    async def list_users(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,nombre_completo,correo,telefono_e164",
            "order": "nombre_completo.asc",
            "limit": str(limit),
        }
        resp = await self._request_service_role("GET", "/rest/v1/usuarios", params=params, organizacion_id=organizacion_id)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar usuarios: {data!r}")
        return data

    async def list_users_by_ids(
        self,
        *,
        organizacion_id: UUID,
        user_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        unique_ids = sorted({str(user_id) for user_id in user_ids if user_id})
        if not unique_ids:
            return []
        in_values = ",".join(unique_ids)
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"in.({in_values})",
            "select": "id,nombre_completo,correo,telefono_e164",
            "limit": str(min(len(unique_ids), 500)),
        }
        resp = await self._request_service_role("GET", "/rest/v1/usuarios", params=params, organizacion_id=organizacion_id)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar usuarios por id: {data!r}")
        return data

    async def get_user_by_id(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{usuario_id}",
            "select": "id,nombre_completo,correo,telefono_e164,timezone,organizacion_id",
            "limit": "1",
        }
        resp = await self._request_service_role("GET", "/rest/v1/usuarios", params=params, organizacion_id=organizacion_id)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def update_user_profile_by_id(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._request_service_role(
            "PATCH",
            "/rest/v1/usuarios",
            params={"organizacion_id": f"eq.{organizacion_id}", "id": f"eq.{usuario_id}"},
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("usuario_update_failed")
        return data[0]

    async def get_user_mail_config(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "usuario_id": f"eq.{usuario_id}",
            "select": (
                "usuario_id,organizacion_id,mail_habilitado,mail_username,mail_password_nonce,"
                "mail_password_ciphertext,mail_incoming_server,mail_incoming_port_imap,"
                "mail_outgoing_server,mail_outgoing_port_smtp,mail_use_ssl,mail_use_tls,"
                "mail_from_name,mail_reply_to,creado_en,actualizado_en"
            ),
            "limit": "1",
        }
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/usuarios_correo_config",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def upsert_user_mail_config(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {
            "organizacion_id": str(organizacion_id),
            "usuario_id": str(usuario_id),
            **payload,
        }
        log_payload = {
            "organizacion_id": str(organizacion_id),
            "usuario_id": str(usuario_id),
            "mail_habilitado": body.get("mail_habilitado"),
            "mail_username_present": bool(body.get("mail_username")),
            "mail_password_nonce_present": bool(body.get("mail_password_nonce")),
            "mail_password_ciphertext_present": bool(body.get("mail_password_ciphertext")),
            "mail_incoming_server_present": bool(body.get("mail_incoming_server")),
            "mail_incoming_port_imap": body.get("mail_incoming_port_imap"),
            "mail_outgoing_server_present": bool(body.get("mail_outgoing_server")),
            "mail_outgoing_port_smtp": body.get("mail_outgoing_port_smtp"),
            "mail_use_ssl": body.get("mail_use_ssl"),
            "mail_use_tls": body.get("mail_use_tls"),
            "mail_from_name_present": bool(body.get("mail_from_name")),
            "mail_reply_to_present": bool(body.get("mail_reply_to")),
        }
        logger.info("crm.user_mail_config_upsert_start", extra=log_payload)
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/usuarios_correo_config",
            params={"on_conflict": "usuario_id"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
            organizacion_id=organizacion_id,
        )
        try:
            data = resp.json()
        except Exception:
            logger.warning(
                "crm.user_mail_config_upsert_non_json_response",
                extra={
                    **log_payload,
                    "status_code": resp.status_code,
                    "response_text": resp.text[:500],
                },
            )
            data = None
        if isinstance(data, list) and data and isinstance(data[0], dict):
            logger.info(
                "crm.user_mail_config_upsert_success",
                extra={**log_payload, "result_shape": "list", "result_count": len(data)},
            )
            return data[0]
        if isinstance(data, dict):
            logger.info(
                "crm.user_mail_config_upsert_success",
                extra={**log_payload, "result_shape": "dict"},
            )
            return data
        refreshed = await self.get_user_mail_config(
            organizacion_id=organizacion_id,
            usuario_id=usuario_id,
        )
        if isinstance(refreshed, dict):
            logger.info(
                "crm.user_mail_config_upsert_refreshed_success",
                extra=log_payload,
            )
            return refreshed
        logger.error(
            "crm.user_mail_config_upsert_failed",
            extra={
                **log_payload,
                "status_code": resp.status_code,
                "response_text": resp.text[:500],
            },
        )
        raise CRMRepositoryError(
            f"usuario_mail_config_upsert_failed:{resp.status_code}:{resp.text[:300]}"
        )

    async def get_email_inbound_sync_state(
        self,
        *,
        organizacion_id: UUID,
        mailbox_email: str,
        folder_name: str,
    ) -> dict[str, Any] | None:
        mailbox_value = mailbox_email.strip().lower()
        folder_value = folder_name.strip()
        if not mailbox_value or not folder_value:
            return None
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/tenant_mailbox_sync_state",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "mailbox_email": f"eq.{mailbox_value}",
                "folder_name": f"eq.{folder_value}",
                "select": (
                    "id,organizacion_id,mailbox_email,folder_name,last_seen_uid,"
                    "last_sync_at,last_error,creado_en,actualizado_en"
                ),
                "limit": "1",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def upsert_email_inbound_sync_state(
        self,
        *,
        organizacion_id: UUID,
        mailbox_email: str,
        folder_name: str,
        last_seen_uid: int,
        last_sync_at: str | None = None,
        last_error: str | None = None,
    ) -> dict[str, Any]:
        mailbox_value = mailbox_email.strip().lower()
        folder_value = folder_name.strip()
        if not mailbox_value or not folder_value:
            raise CRMRepositoryError("email_inbound_sync_state_invalid_key")
        body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "mailbox_email": mailbox_value,
            "folder_name": folder_value,
            "last_seen_uid": max(0, int(last_seen_uid)),
            "last_error": last_error.strip() if isinstance(last_error, str) and last_error.strip() else None,
        }
        if last_sync_at:
            body["last_sync_at"] = last_sync_at
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/tenant_mailbox_sync_state",
            params={"on_conflict": "organizacion_id,mailbox_email,folder_name"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError("email_inbound_sync_state_upsert_failed")

    async def list_users_with_primary_role_by_ids(
        self,
        *,
        organizacion_id: UUID,
        user_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        users = await self.list_users_by_ids(organizacion_id=organizacion_id, user_ids=user_ids)
        unique_ids = sorted({str(user_id) for user_id in user_ids if user_id})
        if not users or not unique_ids:
            return users

        roles_by_id: dict[str, dict[str, str]] = {}
        try:
            role_rows = await self._request_service_role(
                "GET",
                "/rest/v1/usuarios_roles",
                params={
                    "organizacion_id": f"eq.{organizacion_id}",
                    "usuario_id": f"in.({','.join(unique_ids)})",
                    "select": "usuario_id,rol_id",
                    "limit": str(min(len(unique_ids) * 4, 500)),
                },
                organizacion_id=organizacion_id,
            )
            role_rows_data = role_rows.json() or []
            if isinstance(role_rows_data, list) and role_rows_data:
                role_ids = sorted({
                    str(row.get("rol_id")).strip()
                    for row in role_rows_data
                    if isinstance(row, dict) and str(row.get("rol_id") or "").strip()
                })
                role_names_by_id: dict[str, str] = {}
                if role_ids:
                    roles_resp = await self._request_service_role(
                        "GET",
                        "/rest/v1/roles",
                        params={
                            "organizacion_id": f"eq.{organizacion_id}",
                            "id": f"in.({','.join(role_ids)})",
                            "select": "id,codigo,nombre",
                            "limit": str(min(len(role_ids), 500)),
                        },
                        organizacion_id=organizacion_id,
                    )
                    roles_data = roles_resp.json() or []
                    if isinstance(roles_data, list):
                        for role_row in roles_data:
                            if not isinstance(role_row, dict):
                                continue
                            role_id = str(role_row.get("id") or "").strip()
                            if not role_id:
                                continue
                            label = str(role_row.get("nombre") or role_row.get("codigo") or "").strip()
                            if not label:
                                continue
                            role_names_by_id[role_id] = label
                for row in role_rows_data:
                    if not isinstance(row, dict):
                        continue
                    user_id = str(row.get("usuario_id") or "").strip()
                    role_id = str(row.get("rol_id") or "").strip()
                    if not user_id or not role_id:
                        continue
                    role_label = role_names_by_id.get(role_id)
                    if not role_label:
                        continue
                    entry = roles_by_id.setdefault(user_id, {"rol_principal": "", "roles": []})
                    roles = entry.setdefault("roles", [])
                    if role_label not in roles:
                        roles.append(role_label)
                    if not entry.get("rol_principal") or role_label.lower() in {"admin", "owner", "supervisor", "vendedor"}:
                        entry["rol_principal"] = role_label
        except CRMRepositoryError:
            roles_by_id = {}

        enriched: list[dict[str, Any]] = []
        for user in users:
            if not isinstance(user, dict):
                continue
            user_id = str(user.get("id") or "").strip()
            if not user_id:
                continue
            role_entry = roles_by_id.get(user_id, {})
            enriched.append(
                {
                    **user,
                    "rol_principal": role_entry.get("rol_principal") or None,
                    "roles": role_entry.get("roles") or [],
                }
            )
        return enriched

    async def list_sale_ready_opportunities(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 200,
        contacto_captura_estado: str | None = "completo",
    ) -> list[dict[str, Any]]:
        select_fields = ",".join(
            [
                "id",
                "contacto_principal_id",
                "titulo",
                "descripcion",
                "estado",
                "monto_estimado",
                "moneda",
                "probabilidad",
                "metadata",
                "codigo_oportunidad",
                "contacto:personas!oportunidades_contacto_principal_org_fkey("
                "id,nombre_completo,nombre,correo_principal,correo_secundario,correo_institucional,correo_personal_3,"
                "telefono_principal_e164,telefono_movil_1_e164,telefono_movil_2_e164,telefono_secundario_e164,"
                "persona_datos,metadata"
                ")",
                "cuenta:cuentas!oportunidades_cuenta_org_fkey(id,nombre)",
                "etapa:etapas_pipeline!oportunidades_etapa_org_fkey(id,nombre,codigo,categoria,orden)",
            ]
        )
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "select": select_fields,
        }
        contact_ids: list[str] | None = None
        if contacto_captura_estado:
            contact_ids = await self._list_contact_ids_by_captura_estado(
                organizacion_id, contacto_captura_estado
            )
            if not contact_ids:
                return []
            params["contacto_principal_id"] = f"in.({','.join(contact_ids)})"
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar oportunidades de venta: {data!r}")
        rows = [row for row in data if isinstance(row, dict)]
        if rows:
            filtered_rows: list[dict[str, Any]] = []
            for row in rows:
                stage = row.get("etapa") or {}
                stage_code = ""
                if isinstance(stage, dict):
                    stage_code = str(stage.get("codigo") or "").strip().lower()
                if not self._is_sale_ready_stage_code(stage_code):
                    continue
                contact = row.get("contacto") or {}
                if not self._contact_has_basic_channel(contact):
                    continue
                filtered_rows.append(row)
            rows = filtered_rows
        return rows


    @staticmethod
    def _contact_capture_is_complete(row: dict[str, Any]) -> bool:
        def _text(*keys: str) -> str:
            for key in keys:
                value = row.get(key)
                if isinstance(value, str):
                    text = value.strip()
                    if text:
                        return text
                elif value is not None and not isinstance(value, dict):
                    text = str(value).strip()
                    if text:
                        return text
            return ""

        return all(
            [
                _text("cuenta_tipo", "tipo"),
                _text("tamano"),
                _text("tipo_establecimiento"),
                _text("estado"),
                _text("origen"),
                _text("puesto"),
                _text("rol_decision"),
                _text("area"),
            ]
        )

    @classmethod
    def _contact_has_basic_channel(cls, contact: dict[str, Any]) -> bool:
        if not isinstance(contact, dict):
            return False
        email = cls._pick_text(
            contact,
            "correo",
            "correo_principal",
            "correo_secundario",
            "correo_institucional",
            "email",
        )
        phone = cls._pick_text(
            contact,
            "telefono_e164",
            "telefono_principal_e164",
            "telefono_movil_1_e164",
            "phone_e164",
            "telefono",
            "phone",
        )
        return bool(email or phone)

    @staticmethod
    def _is_sale_ready_stage_code(stage_code: str) -> bool:
        normalized = (stage_code or "").strip().lower()
        if not normalized:
            return False
        if normalized in {
            "ganada",
            "perdida",
            "cerrado_ganado",
            "cerrado_perdido",
            "general_cerrado_ganado",
            "general_cerrado_perdido",
        }:
            return False
        if normalized.endswith("_ganado") or normalized.endswith("_perdido"):
            return False
        if normalized in {
            "prospeccion_primer_contacto",
            "general_visitantes_sin_chat",
            "visitantes_sin_chat",
            "sin_conversacion",
        }:
            return False
        if "visitantes" in normalized or "sin_conversacion" in normalized:
            return False
        return True

    async def _list_contact_ids_by_captura_estado(
        self,
        organizacion_id: UUID,
        captura_estado: str,
        *,
        limit: int = 500,
    ) -> list[str]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "or": f"(estado.eq.{captura_estado},metadata->>captura_estado.eq.{captura_estado})",
            "select": "metadata",
            "limit": str(limit),
        }
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar contactos por captura_estado: {data!r}"
            )
        ids: list[str] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            contact_id = row.get("id")
            if contact_id:
                ids.append(str(contact_id))
        return ids

    async def create_opportunity(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = _normalize_opportunity_payload(
            {"organizacion_id": str(organizacion_id), **payload},
            include_metadata=True,
            allow_title_fallback=True,
        )
        request_id = str(body.get("request_id") or "").strip()
        if not request_id:
            request_id = str(uuid4())
            body["request_id"] = request_id
        last_exc: CRMRepositoryError | None = None
        request_id_disabled = False
        for attempt in range(3):
            try:
                resp = await self._request(
                    "POST",
                    "/rest/v1/oportunidades",
                    json=body,
                    prefer="return=representation",
                )
                data = resp.json()
                if not isinstance(data, list) or not data:
                    raise CRMRepositoryError("Supabase no devolvió la oportunidad creada")
                row = data[0]
                if not isinstance(row, dict):
                    raise CRMRepositoryError(f"Respuesta inválida al crear oportunidad: {row!r}")
                return row
            except CRMRepositoryError as exc:
                last_exc = exc
                if _is_opportunity_request_id_duplicate_error(exc):
                    existing = await self.get_opportunity_by_request_id(
                        organizacion_id=organizacion_id,
                        request_id=request_id,
                    )
                    if existing:
                        return existing
                    raise
                if not request_id_disabled and _is_request_id_schema_cache_error(exc):
                    request_id_disabled = True
                    body.pop("request_id", None)
                    logger.warning(
                        "crm.create_opportunity_request_id_fallback",
                        extra={
                            "organizacion_id": str(organizacion_id),
                            "error": str(exc),
                        },
                    )
                    continue
                if not _is_opportunity_code_duplicate_error(exc) or attempt >= 2:
                    raise
                logger.warning(
                    "crm.create_opportunity_retry_codigo",
                    extra={
                        "attempt": attempt + 1,
                        "organizacion_id": str(organizacion_id),
                        "error": str(exc),
                    },
                )
        raise last_exc or CRMRepositoryError("oportunidad_creation_retry_exhausted")

    async def get_opportunity_by_request_id(
        self,
        *,
        organizacion_id: UUID,
        request_id: str,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "request_id": f"eq.{request_id}",
            "limit": "1",
            "select": "*",
        }
        try:
            resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        except CRMRepositoryError as exc:
            if _is_request_id_schema_cache_error(exc):
                return None
            raise
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar oportunidad por request_id: {row!r}")
        return row

    async def get_opportunity(
        self,
        *,
        organizacion_id: UUID,
        opportunity_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{opportunity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener oportunidad: {row!r}")
        return row

    async def get_opportunity_with_stage(
        self,
        *,
        organizacion_id: UUID,
        opportunity_id: UUID,
    ) -> dict[str, Any] | None:
        select_fields = ",".join(
            [
                "*",
                "etapa:etapas_pipeline!oportunidades_etapa_org_fkey(id,nombre,codigo,categoria,orden)",
            ]
        )
        params = {
            "id": f"eq.{opportunity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
            "select": select_fields,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"opportunity_with_stage_invalid:{row!r}")
        return row

    async def list_activities(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None = None,
        cuenta_id: UUID | None = None,
        persona_id: UUID | None = None,
        contacto_id: UUID | None = None,
        asignado_a_usuario_id: UUID | None = None,
        estado: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "inicio_en.desc.nullslast",
            "limit": str(limit),
            "offset": str(offset),
        }
        if oportunidad_id:
            params["oportunidad_id"] = f"eq.{oportunidad_id}"
        if cuenta_id:
            params["cuenta_id"] = f"eq.{cuenta_id}"
        if persona_id:
            params["persona_id"] = f"eq.{persona_id}"
        if contacto_id:
            params["contacto_id"] = f"eq.{contacto_id}"
        if asignado_a_usuario_id:
            params["asignado_a_usuario_id"] = f"eq.{asignado_a_usuario_id}"
        if estado:
            params["estado"] = f"eq.{estado}"
        params["select"] = (
            "*,"
            "creado_por_usuario:usuarios!actividades_creado_por_usuario_org_fkey("
            "id,nombre_completo,correo,telefono_e164"
            "),"
            "asignado_a_usuario:usuarios!actividades_asignado_usuario_org_fkey("
            "id,nombre_completo,correo,telefono_e164"
            ")"
        )
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar actividades: {data!r}")
        return data

    async def list_due_activities_for_reminders(
        self,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "estado": "eq.pendiente",
            "recordatorio_en": f"lte.{datetime.now(timezone.utc).isoformat()}",
            "recordatorio_notificado_en": "is.null",
            "order": "recordatorio_en.asc.nullslast",
            "limit": str(max(1, min(limit, 200))),
        }
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar recordatorios de actividades: {data!r}")
        return data

    async def list_due_activities_for_whatsapp_reminders(
        self,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "estado": "eq.pendiente",
            "whatsapp_recordatorio_en": f"lte.{datetime.now(timezone.utc).isoformat()}",
            "whatsapp_recordatorio_enviado_en": "is.null",
            "order": "whatsapp_recordatorio_en.asc.nullslast",
            "limit": str(max(1, min(limit, 200))),
        }
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar recordatorios WhatsApp: {data!r}")
        return data

    async def mark_whatsapp_activity_reminder_sent(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
        sent_at: str,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{activity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "whatsapp_recordatorio_enviado_en": "is.null",
            "limit": "1",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/actividades",
            params=params,
            json={"whatsapp_recordatorio_enviado_en": sent_at},
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        return data[0] if isinstance(data[0], dict) else None

    async def create_activity(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/actividades",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la actividad creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear actividad: {row!r}")
        return row

    async def update_activity(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not payload:
            raise CRMRepositoryError("activity_update_empty")
        payload = dict(payload)
        if "recordatorio_en" in payload and "recordatorio_notificado_en" not in payload:
            payload["recordatorio_notificado_en"] = None
        params = {
            "id": f"eq.{activity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/actividades",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la actividad actualizada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar actividad: {row!r}")
        return row

    async def complete_activity(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
        cerrado_por_usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "estado": "completada",
            "completado_en": datetime.now(timezone.utc).isoformat(),
            "cancelado_en": None,
        }
        if cerrado_por_usuario_id:
            payload["cerrado_por_usuario_id"] = str(cerrado_por_usuario_id)
        return await self.update_activity(
            organizacion_id=organizacion_id,
            activity_id=activity_id,
            payload=payload,
        )

    async def cancel_activity(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
        cerrado_por_usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "estado": "cancelada",
            "cancelado_en": datetime.now(timezone.utc).isoformat(),
            "completado_en": None,
        }
        if cerrado_por_usuario_id:
            payload["cerrado_por_usuario_id"] = str(cerrado_por_usuario_id)
        return await self.update_activity(
            organizacion_id=organizacion_id,
            activity_id=activity_id,
            payload=payload,
        )

    async def get_activity(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{activity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener actividad: {row!r}")
        return row

    async def get_ui_notification_by_dedupe_key(
        self,
        *,
        usuario_id: UUID,
        organizacion_id: UUID,
        dedupe_key: str,
    ) -> dict[str, Any] | None:
        normalized = dedupe_key.strip()
        if not normalized:
            return None
        params = {
            "usuario_id": f"eq.{usuario_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "dedupe_key": f"eq.{normalized}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/ui_notificaciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar notificación: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar notificación: {row!r}")
        return row

    async def list_tickets(
        self,
        *,
        organizacion_id: UUID,
        estado: str | None = None,
        prioridad: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        if prioridad:
            params["prioridad"] = f"eq.{prioridad}"
        resp = await self._request("GET", "/rest/v1/tickets", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar tickets: {data!r}")
        return data

    async def create_ticket(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/tickets",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el ticket creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear ticket: {row!r}")
        return row

    async def get_ticket(
        self,
        *,
        organizacion_id: UUID,
        ticket_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{ticket_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/tickets", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener ticket: {row!r}")
        return row

    async def list_ticket_comments(
        self,
        *,
        organizacion_id: UUID,
        ticket_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "ticket_id": f"eq.{ticket_id}",
            "order": "creado_en.asc",
        }
        resp = await self._request("GET", "/rest/v1/ticket_comentarios", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar comentarios de ticket: {data!r}"
            )
        return data

    async def create_ticket_comment(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/ticket_comentarios",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el comentario del ticket")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear comentario: {row!r}")
        return row

    async def list_files(
        self,
        *,
        organizacion_id: UUID,
        relacion_tipo: str | None = None,
        relacion_id: UUID | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "subido_en.desc",
            "limit": str(limit),
        }
        if relacion_tipo:
            params["relacion_tipo"] = f"eq.{relacion_tipo}"
        if relacion_id:
            params["relacion_id"] = f"eq.{relacion_id}"
        resp = await self._request("GET", "/rest/v1/archivos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar archivos: {data!r}")
        return data

    async def create_file(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/archivos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el archivo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear archivo: {row!r}")
        return row

    async def delete_file(
        self,
        *,
        organizacion_id: UUID,
        archivo_id: UUID,
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/archivos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{archivo_id}",
            },
        )

    async def create_orden_compra_documento(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/ordenes_compra_documentos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el documento de orden creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear documento de orden: {row!r}")
        return row

    async def delete_orden_compra_documento(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        documento_id: UUID,
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/ordenes_compra_documentos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "orden_compra_id": f"eq.{orden_id}",
                "id": f"eq.{documento_id}",
            },
        )

    async def list_orden_compra_pagos_programados(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "orden_compra_id": f"eq.{orden_id}",
            "order": "creado_en.asc",
            "select": (
                "id,organizacion_id,orden_compra_id,tipo_pago,evento_base,porcentaje,monto,moneda_codigo,tipo_cambio_aplicado,monto_mxn,"
                "dias_credito,fecha_vencimiento_calculada,fecha_evento_real,fecha_pago_real,referencia_pago,estado,observaciones,creado_en,actualizado_en"
            ),
        }
        resp = await self._request("GET", "/rest/v1/ordenes_compra_pagos_programados", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar pagos programados: {data!r}")
        return data

    async def create_orden_compra_pago_programado(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/ordenes_compra_pagos_programados",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el pago programado creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear pago programado: {row!r}")
        return row

    async def update_orden_compra_pago_programado(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        pago_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/ordenes_compra_pagos_programados?id=eq.{pago_id}&orden_compra_id=eq.{orden_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pago_programado_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar pago programado: {row!r}")
        return row

    async def delete_orden_compra_pago_programado(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        pago_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/ordenes_compra_pagos_programados?id=eq.{pago_id}&orden_compra_id=eq.{orden_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pago_programado_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar pago programado: {row!r}")
        return row

    async def replace_orden_compra_pagos_programados(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        pagos_programados: list[dict[str, Any]],
    ) -> None:
        payload_keys = (
            "organizacion_id",
            "orden_compra_id",
            "tipo_pago",
            "evento_base",
            "porcentaje",
            "monto",
            "moneda_codigo",
            "dias_credito",
            "fecha_vencimiento_calculada",
            "fecha_evento_real",
            "fecha_pago_real",
            "referencia_pago",
            "estado",
            "observaciones",
        )

        def _row_with_all_keys(row: dict[str, Any]) -> dict[str, Any]:
            normalized_row: dict[str, Any] = {}
            for key in payload_keys:
                value = row.get(key)
                if value is not None:
                    normalized_row[key] = value
                else:
                    normalized_row[key] = None
            return normalized_row

        current_rows = await self.list_orden_compra_pagos_programados(
            organizacion_id=organizacion_id,
            orden_id=orden_id,
        )
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "orden_compra_id": f"eq.{orden_id}",
        }
        await self._request(
            "DELETE",
            "/rest/v1/ordenes_compra_pagos_programados",
            params=params,
        )
        if not pagos_programados:
            return
        try:
            for payload in pagos_programados:
                row_body = _row_with_all_keys(
                    {
                        "organizacion_id": str(organizacion_id),
                        "orden_compra_id": str(orden_id),
                        **payload,
                    }
                )
                resp = await self._request(
                    "POST",
                    "/rest/v1/ordenes_compra_pagos_programados",
                    json=row_body,
                    prefer="return=representation",
                )
                data = resp.json()
                if not isinstance(data, list) or not data:
                    raise CRMRepositoryError(f"Respuesta inválida al reemplazar pagos programados: {data!r}")
        except CRMRepositoryError:
            if current_rows:
                restore_body = []
                for row in current_rows:
                    if not isinstance(row, dict):
                        continue
                    restore_body.append(
                        _row_with_all_keys(
                            {
                                "organizacion_id": str(organizacion_id),
                                "orden_compra_id": str(orden_id),
                                **row,
                            }
                        )
                    )
                for restore_row in restore_body:
                    await self._request(
                        "POST",
                        "/rest/v1/ordenes_compra_pagos_programados",
                        json=restore_row,
                        prefer="return=representation",
                    )
            raise

    async def delete_orden_compra_documentos(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        tipo_documento: str | None = None,
    ) -> None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "orden_compra_id": f"eq.{orden_id}",
        }
        if tipo_documento:
            params["tipo_documento"] = f"eq.{tipo_documento}"
        await self._request(
            "DELETE",
            "/rest/v1/ordenes_compra_documentos",
            params=params,
        )

    async def list_assistant_documents(
        self,
        *,
        organizacion_id: UUID,
        channel_scope: str | None = None,
        category: str | None = None,
        active: bool | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "sort_order.asc,updated_at.desc",
            "limit": str(max(1, min(limit, 200))),
        }
        if channel_scope:
            params["channel_scope"] = f"eq.{channel_scope}"
        if category:
            params["category"] = f"eq.{category}"
        if active is not None:
            params["active"] = f"eq.{str(active).lower()}"
        resp = await self._request("GET", "/rest/v1/assistant_documents", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar documentos: {data!r}")
        return data

    async def get_assistant_document(
        self,
        *,
        organizacion_id: UUID,
        document_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{document_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/assistant_documents", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def create_assistant_document(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/assistant_documents",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el documento creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear documento: {row!r}")
        return row

    async def update_assistant_document(
        self,
        *,
        organizacion_id: UUID,
        document_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {
            "id": f"eq.{document_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/assistant_documents",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el documento actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar documento: {row!r}")
        return row

    async def delete_assistant_document(
        self,
        *,
        organizacion_id: UUID,
        document_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{document_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/assistant_documents",
            params=params,
            prefer="return=minimal",
        )
        if resp.status_code not in (200, 204):
            raise CRMRepositoryError(
                f"Supabase respondió error al eliminar documento: {resp.status_code} {resp.text}"
            )

    async def list_tags(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
        }
        resp = await self._request("GET", "/rest/v1/tags", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar tags: {data!r}")
        return data

    async def create_tag(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/tags",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el tag creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear tag: {row!r}")
        return row

    async def create_tagging(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/taggings",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el tagging creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear tagging: {row!r}")
        return row

    async def delete_tagging(
        self,
        *,
        organizacion_id: UUID,
        tagging_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{tagging_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/taggings",
            params=params,
            prefer="return=minimal",
        )
        if resp.status_code not in (200, 204):
            raise CRMRepositoryError(
                f"Supabase respondió error al eliminar tagging: {resp.status_code} {resp.text}"
            )

    async def list_products(
        self,
        *,
        organizacion_id: UUID,
        activos: bool | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
        }
        if activos is not None:
            params["activo"] = f"eq.{str(activos).lower()}"
        resp = await self._request("GET", "/rest/v1/productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar productos: {data!r}")
        return data

    async def create_product(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/productos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el producto creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear producto: {row!r}")
        return row

    async def list_logos(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,descripcion,file_path,file_url,metadata,uploaded_by,created_at,updated_at",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "created_at.desc",
        }
        resp = await self._request("GET", "/rest/v1/logos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar logos: {data!r}")
        return data

    async def create_logo(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {
            "organizacion_id": str(organizacion_id),
            **payload,
        }
        resp = await self._request(
            "POST",
            "/rest/v1/logos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el logo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear logo: {row!r}")
        return row

    async def delete_logo(
        self,
        *,
        organizacion_id: UUID,
        logo_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request(
            "DELETE",
            "/rest/v1/logos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{logo_id}",
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar logo: {data!r}")
        row = data[0] if data else None
        if row is not None and not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar logo: {row!r}")
        return row

    async def list_quotes(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if oportunidad_id:
            params["oportunidad_id"] = f"eq.{oportunidad_id}"
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cotizaciones: {data!r}")
        return data

    async def reserve_quote_folio(
        self,
        *,
        organizacion_id: UUID,
        vendedor_nombre: str,
        fecha: date | None = None,
    ) -> dict[str, Any]:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_vendedor_nombre": vendedor_nombre,
            "p_fecha": fecha.isoformat() if fecha else None,
        }
        result = await self._rpc("crm_reservar_folio_cotizacion", body)
        if isinstance(result, dict):
            payload = result.get("crm_reservar_folio_cotizacion")
            if isinstance(payload, dict):
                return payload
            if isinstance(payload, list) and payload and isinstance(payload[0], dict):
                return payload[0]
            if isinstance(result.get("folio"), str):
                return result
        elif isinstance(result, list) and result and isinstance(result[0], dict):
            return result[0]
        raise CRMRepositoryError(f"Respuesta invalida al reservar folio de cotizacion: {result!r}")

    async def quote_folio_exists(
        self,
        *,
        organizacion_id: UUID,
        folio: str,
    ) -> bool:
        resp = await self._request(
            "GET",
            "/rest/v1/cotizaciones",
            params={
                "select": "id",
                "organizacion_id": f"eq.{organizacion_id}",
                "folio": f"eq.{_postgrest_eq_literal(folio)}",
                "limit": "1",
            },
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al validar folio de cotizacion: {data!r}"
            )
        return bool(data)

    async def create_quote(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cotizaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cotización creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear cotización: {row!r}")
        return row

    async def list_quote_items(
        self,
        *,
        organizacion_id: UUID,
        cotizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "cotizacion_id": f"eq.{cotizacion_id}",
            "order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizacion_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar items de cotización: {data!r}"
            )
        return data

    async def add_quote_item(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cotizacion_items",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el item de cotización creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear item de cotización: {row!r}")
        return row

    async def list_quote_entries(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "order": "creado_en.desc",
            "select": "id,organizacion_id,oportunidad_id,folio,cuenta_id,contacto_id,estatus,total,moneda,valida_hasta,creada_por_usuario_id,metadata,creado_en,actualizado_en,items:cotizacion_items(*,catalog_item:productos(id,nombre,codigo,descripcion))",
            "items.order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cotizaciones: {data!r}")
        return data

    async def get_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{quote_id}",
            "limit": "1",
            "select": "id,organizacion_id,oportunidad_id,folio,cuenta_id,contacto_id,estatus,total,moneda,valida_hasta,creada_por_usuario_id,metadata,creado_en,actualizado_en,items:cotizacion_items(*,catalog_item:productos(id,nombre,codigo,descripcion))",
            "items.order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        raise CRMRepositoryError("quote_not_found")

    async def create_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        cuenta_id: UUID | None,
        contacto_id: UUID | None,
        folio: str | None,
        estatus: str,
        total: float | None,
        moneda: str,
        valida_hasta: str | None,
        metadata: dict[str, Any],
        items: list[dict[str, Any]],
        usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "oportunidad_id": str(oportunidad_id),
            "cuenta_id": str(cuenta_id) if cuenta_id else None,
            "contacto_id": str(contacto_id) if contacto_id else None,
            "folio": folio,
            "estatus": estatus,
            "total": total,
            "moneda": moneda,
            "valida_hasta": valida_hasta,
            "metadata": metadata,
        }
        if usuario_id:
            body["creada_por_usuario_id"] = str(usuario_id)
        resp = await self._request(
            "POST",
            "/rest/v1/cotizaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cotización creada")
        row = data[0]
        quote_id = row.get("id")
        if not quote_id:
            raise CRMRepositoryError("quote_create_missing_id")
        if items:
            await self._insert_quote_items(quote_id=UUID(str(quote_id)), items=items)
        return await self.get_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=UUID(str(quote_id)),
        )

    async def _insert_quote_items(
        self,
        *,
        quote_id: UUID,
        items: list[dict[str, Any]],
    ) -> None:
        rows = []
        for item in items:
            payload = dict(item)
            payload["cotizacion_id"] = str(quote_id)
            rows.append(payload)
        if not rows:
            return
        resp = await self._request(
            "POST",
            "/rest/v1/cotizacion_items",
            json=rows,
            prefer="return=representation",
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Error creando items de cotización: {resp.status_code} {resp.text}"
            )

    async def mark_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
        estatus: str | None = None,
        metadata_patch: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        current = await self.get_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=quote_id,
        )
        payload: dict[str, Any] = {}
        if estatus:
            payload["estatus"] = estatus
        if metadata_patch:
            existing = _ensure_metadata(current.get("metadata"))
            existing.update(metadata_patch)
            payload["metadata"] = existing
        resp = await self._request(
            "PATCH",
            "/rest/v1/cotizaciones",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{quote_id}",
                "limit": "1",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        raise CRMRepositoryError("quote_mark_failed")

    async def get_opportunity_with_contact(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{oportunidad_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                await self._attach_contact_rows(
                    organizacion_id=organizacion_id,
                    rows=[row],
                    source_fields=("contacto_principal_id",),
                )
                return row
        return None

    async def list_campaigns(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        resp = await self._request("GET", "/rest/v1/campanas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar campañas: {data!r}")
        return data

    async def list_web_sessions_campaign_links(
        self,
        *,
        organizacion_id: UUID,
        utm_campaigns: Sequence[str],
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        state_code: str | None = None,
        source_class: str | None = None,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        limit: int = 2000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        campaign_values = [str(value or "").strip().lower() for value in utm_campaigns]
        campaign_values = [value for value in campaign_values if value]
        if not campaign_values:
            return []

        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "utm_campaign,cid,actualizado_en,last_seen_at",
            "order": "actualizado_en.desc,last_seen_at.desc",
            "limit": str(max(1, min(limit, 5000))),
            "offset": str(max(0, int(offset))),
            "cid": "not.is.null",
            "utm_campaign": _postgrest_in_clause(campaign_values),
        }
        if date_from:
            params["last_seen_at"] = f"gte.{date_from.isoformat()}"
        if date_to:
            params["first_seen_at"] = f"lte.{date_to.isoformat()}"
        if state_code:
            params["cve_ent"] = f"eq.{state_code}"
        if source_class:
            params["source_class"] = f"eq.{source_class}"
        if utm_source:
            params["utm_source"] = f"eq.{utm_source}"
        if utm_medium:
            params["utm_medium"] = f"eq.{utm_medium}"

        resp = await self._request("GET", "/rest/v1/web_sessions", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar links utm_campaign/cid: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def list_web_sessions_attribution_detail(
        self,
        *,
        organizacion_id: UUID,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        state_code: str | None = None,
        source_class: str | None = None,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        utm_campaign: str | None = None,
        template_id: UUID | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": (
                "session_id,persona_id,contacto_id,first_seen_at,last_seen_at,visit_count,ip,"
                "device_type,country_code,country_name,cve_ent,nom_ent,cve_mun,nom_mun,cvegeo,"
                "referrer,referrer_host,landing_url,utm_source,utm_medium,utm_campaign,eid,cid,tid,source_class,metadata"
            ),
            "order": "last_seen_at.desc,first_seen_at.desc",
            "limit": str(max(1, min(limit, 5000))),
            "offset": str(max(0, int(offset))),
        }
        if date_from and date_to:
            params["and"] = (
                f"(first_seen_at.gte.{date_from.isoformat()},"
                f"first_seen_at.lte.{date_to.isoformat()})"
            )
        elif date_from:
            params["first_seen_at"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            params["first_seen_at"] = f"lte.{date_to.isoformat()}"
        if state_code:
            params["cve_ent"] = f"eq.{state_code}"
        if source_class:
            params["source_class"] = f"eq.{source_class}"
        if utm_source:
            params["utm_source"] = f"eq.{utm_source}"
        if utm_medium:
            params["utm_medium"] = f"eq.{utm_medium}"
        if utm_campaign:
            params["utm_campaign"] = f"eq.{utm_campaign}"
        if template_id:
            params["tid"] = f"eq.{template_id}"
        resp = await self._request("GET", "/rest/v1/web_sessions", params=params)

        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar detalle de web_sessions: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def summarize_web_session_contacts(
        self,
        *,
        organizacion_id: UUID,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        state_code: str | None = None,
        source_class: str | None = None,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        utm_campaign: str | None = None,
        campaign_id: UUID | None = None,
        template_id: UUID | None = None,
        limit: int = 5000,
    ) -> dict[str, Any]:
        async def fetch_all_rows(path: str, base_params: dict[str, str]) -> list[dict[str, Any]]:
            page_size = 1000
            offset = 0
            rows: list[dict[str, Any]] = []
            while True:
                params = {
                    **base_params,
                    "limit": str(page_size),
                    "offset": str(offset),
                }
                response = await self._request("GET", path, params=params)
                page = response.json() or []
                if not isinstance(page, list):
                    raise CRMRepositoryError(
                        f"Respuesta inesperada al resumir {path}: {page!r}"
                    )
                rows.extend(row for row in page if isinstance(row, dict))
                if len(page) < page_size:
                    break
                offset += page_size
            return rows

        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "session_id,persona_id,contacto_id,referrer,referrer_host,landing_url",
        }
        if date_from and date_to:
            params["and"] = (
                f"(first_seen_at.gte.{date_from.isoformat()},"
                f"first_seen_at.lt.{date_to.isoformat()})"
            )
        elif date_from:
            params["first_seen_at"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            params["first_seen_at"] = f"lt.{date_to.isoformat()}"
        if state_code:
            params["cve_ent"] = f"eq.{state_code}"
        if source_class:
            params["source_class"] = f"eq.{source_class}"
        if utm_source:
            params["utm_source"] = f"eq.{utm_source}"
        if utm_medium:
            params["utm_medium"] = f"eq.{utm_medium}"
        if utm_campaign:
            params["utm_campaign"] = f"eq.{utm_campaign}"
        if campaign_id:
            params["cid"] = f"eq.{campaign_id}"
        if template_id:
            params["tid"] = f"eq.{template_id}"

        session_rows = await fetch_all_rows("/rest/v1/web_sessions", params)

        source_class_values = {
            "direct",
            "campaign",
            "organic_search",
            "organic_social",
            "referral",
            "ai_referral",
            "unknown",
        }

        def external_referrer_host(row: Mapping[str, Any]) -> str:
            raw_host = str(row.get("referrer_host") or "").strip().lower()
            raw_referrer = str(row.get("referrer") or "").strip().lower()
            value = raw_host or raw_referrer
            if not value or value in source_class_values:
                return ""
            try:
                parsed = urlparse(value if "://" in value else f"https://{value}")
                host = (parsed.hostname or "").strip().lower()
                landing = str(row.get("landing_url") or "").strip()
                landing_host = (urlparse(landing).hostname or "").strip().lower() if landing else ""
            except ValueError:
                return ""
            if not host or "." not in host or host in source_class_values or host == landing_host:
                return ""
            return host

        referrer_totals: dict[str, int] = {}
        referrer_people: dict[str, set[str]] = {}
        for row in session_rows:
            host = external_referrer_host(row)
            if not host:
                continue
            referrer_totals[host] = referrer_totals.get(host, 0) + 1
            person_key = str(row.get("persona_id") or row.get("contacto_id") or "").strip().lower()
            if person_key:
                referrer_people.setdefault(host, set()).add(person_key)

        def referrer_rows() -> list[dict[str, int | str]]:
            return [
                {
                    "host": host,
                    "total": total,
                    "converted": len(referrer_people.get(host, set())),
                }
                for host, total in sorted(
                    referrer_totals.items(),
                    key=lambda item: (-item[1], item[0]),
                )
            ]

        session_ids = {
            str(row.get("session_id") or "").strip()
            for row in session_rows
            if isinstance(row, dict) and str(row.get("session_id") or "").strip()
        }
        if not session_ids:
            return {
                "sessions": 0,
                "sessions_with_contact": 0,
                "unique_people": 0,
                "referrer_rows": referrer_rows(),
            }

        visitor_params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "session_id,persona_id,contacto_id",
        }
        if date_from and date_to:
            visitor_params["and"] = (
                f"(registrado_en.gte.{date_from.isoformat()},"
                f"registrado_en.lt.{date_to.isoformat()})"
            )
        elif date_from:
            visitor_params["registrado_en"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            visitor_params["registrado_en"] = f"lt.{date_to.isoformat()}"

        conversation_params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,persona_id,contacto_id",
        }
        message_params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "conversacion_id,datos",
        }
        if date_from and date_to:
            conversation_params["and"] = (
                f"(iniciada_en.gte.{date_from.isoformat()},"
                f"iniciada_en.lt.{date_to.isoformat()})"
            )
            message_params["and"] = (
                f"(creado_en.gte.{date_from.isoformat()},"
                f"creado_en.lt.{date_to.isoformat()})"
            )
        elif date_from:
            conversation_params["iniciada_en"] = f"gte.{date_from.isoformat()}"
            message_params["creado_en"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            conversation_params["iniciada_en"] = f"lt.{date_to.isoformat()}"
            message_params["creado_en"] = f"lt.{date_to.isoformat()}"

        visitor_rows, conversation_rows, message_rows = await asyncio.gather(
            fetch_all_rows("/rest/v1/webchat_visitantes", visitor_params),
            fetch_all_rows("/rest/v1/conversaciones", conversation_params),
            fetch_all_rows("/rest/v1/mensajes", message_params),
        )

        visitor_rows_by_session = {
            str(row.get("session_id") or "").strip(): row
            for row in visitor_rows
            if isinstance(row, dict) and str(row.get("session_id") or "").strip() in session_ids
        }
        conversations_by_id = {
            str(row.get("id") or "").strip(): row
            for row in conversation_rows
            if isinstance(row, dict) and str(row.get("id") or "").strip()
        }
        conversation_contacts_by_session: dict[str, tuple[str, str]] = {}
        for message in message_rows:
            if not isinstance(message, dict):
                continue
            conversation = conversations_by_id.get(str(message.get("conversacion_id") or "").strip())
            if not conversation:
                continue
            payload = message.get("datos")
            if not isinstance(payload, dict):
                continue
            extra = payload.get("extra")
            session_id = payload.get("session_id")
            if isinstance(extra, dict):
                session_id = session_id or extra.get("session_id")
            session_id = str(session_id or "").strip()
            if session_id not in session_ids:
                continue
            person_id = str(conversation.get("persona_id") or "").strip().lower()
            contact_id = str(conversation.get("contacto_id") or "").strip().lower()
            if person_id or contact_id:
                conversation_contacts_by_session[session_id] = (person_id, contact_id)

        session_referrer_by_id = {
            str(row.get("session_id") or "").strip(): external_referrer_host(row)
            for row in session_rows
            if str(row.get("session_id") or "").strip()
        }
        for session_id, row in visitor_rows_by_session.items():
            host = session_referrer_by_id.get(session_id)
            person_key = str(row.get("persona_id") or row.get("contacto_id") or "").strip().lower()
            if host and person_key:
                referrer_people.setdefault(host, set()).add(person_key)
        for session_id, (person_id, contact_id) in conversation_contacts_by_session.items():
            host = session_referrer_by_id.get(session_id)
            person_key = (person_id or contact_id).strip().lower()
            if host and person_key:
                referrer_people.setdefault(host, set()).add(person_key)

        people = {
            str(row.get("persona_id") or row.get("contacto_id") or "").strip().lower()
            for row in visitor_rows_by_session.values()
            if row.get("persona_id") or row.get("contacto_id")
        }
        people.update(
            person_id or contact_id
            for person_id, contact_id in conversation_contacts_by_session.values()
        )
        sessions_with_contact = {
            session_id
            for session_id, row in visitor_rows_by_session.items()
            if row.get("persona_id") or row.get("contacto_id")
        }
        sessions_with_contact.update(conversation_contacts_by_session)
        return {
            "sessions": len(session_ids),
            "sessions_with_contact": len(sessions_with_contact),
            "unique_people": len(people),
            "referrer_rows": referrer_rows(),
        }

    async def list_contact_envios_by_ids(
        self,
        *,
        organizacion_id: UUID,
        envio_ids: Sequence[str],
    ) -> list[dict[str, Any]]:
        values = [str(value or "").strip() for value in envio_ids]
        values = [value for value in values if value]
        if not values:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": _postgrest_in_clause(values),
            "select": "id,prospecto_id,canal,payload,detalle,estado,creado_en",
            "limit": str(min(1000, max(1, len(values)))),
        }
        resp = await self._request("GET", "/rest/v1/prospeccion_contacto_envio", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar envios por id: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def list_web_sessions_template_links(
        self,
        *,
        organizacion_id: UUID,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        state_code: str | None = None,
        source_class: str | None = None,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        utm_campaign: str | None = None,
        campaign_ids: Sequence[UUID] | None = None,
        template_id: UUID | None = None,
        limit: int = 5000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
                "select": "tid,cid,last_seen_at,actualizado_en",
            "order": "actualizado_en.desc,last_seen_at.desc",
            "limit": str(max(1, min(limit, 10000))),
            "offset": str(max(0, int(offset))),
            "tid": "not.is.null",
        }
        if date_from:
            params["last_seen_at"] = f"gte.{date_from.isoformat()}"
        if date_to:
            params["first_seen_at"] = f"lte.{date_to.isoformat()}"
        if state_code:
            params["cve_ent"] = f"eq.{state_code}"
        if source_class:
            params["source_class"] = f"eq.{source_class}"
        if utm_source:
            params["utm_source"] = f"eq.{utm_source}"
        if utm_medium:
            params["utm_medium"] = f"eq.{utm_medium}"
        if utm_campaign:
            params["utm_campaign"] = f"eq.{utm_campaign}"
        if campaign_ids:
            params["cid"] = _postgrest_in_clause([str(value) for value in campaign_ids])
        if template_id:
            params["tid"] = f"eq.{template_id}"

        resp = await self._request("GET", "/rest/v1/web_sessions", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar links tid: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def list_contact_templates_by_ids(
        self,
        *,
        organizacion_id: UUID,
        template_ids: Sequence[str],
    ) -> list[dict[str, Any]]:
        values = [str(value or "").strip() for value in template_ids]
        values = [value for value in values if value]
        if not values:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": _postgrest_in_clause(values),
            "select": "id,nombre,slug,canal,activo,metadata",
        }
        resp = await self._request("GET", "/rest/v1/prospeccion_contacto_templates", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar plantillas por id: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def create_campaign(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/campanas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la campaña creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear campaña: {row!r}")
        return row

    async def get_campaign(
        self,
        *,
        organizacion_id: UUID,
        campana_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{campana_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/campanas", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"campaign_get_invalid:{row!r}")
        return row

    async def update_campaign(
        self,
        *,
        organizacion_id: UUID,
        campana_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            "/rest/v1/campanas",
            params={
                "id": f"eq.{campana_id}",
                "organizacion_id": f"eq.{organizacion_id}",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("campaign_update_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"campaign_update_invalid:{row!r}")
        return row

    async def list_leads(
        self,
        *,
        organizacion_id: UUID,
        estado: str | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        resp = await self._request("GET", "/rest/v1/leads", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar leads: {data!r}")
        return data

    async def get_lead_by_id(
        self,
        *,
        organizacion_id: UUID,
        lead_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{lead_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/leads", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"lead_get_invalid:{row!r}")
        return row

    async def create_lead(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/leads",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el lead creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear lead: {row!r}")
        return row

    async def list_lead_events(
        self,
        *,
        organizacion_id: UUID,
        lead_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "lead_id": f"eq.{lead_id}",
            "order": "registrado_en.asc",
        }
        resp = await self._request("GET", "/rest/v1/lead_eventos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar eventos de lead: {data!r}")
        return data

    async def contact_restart_stats(
        self,
        *,
        organizacion_id: UUID,
        min_restart_sequence: int = 1,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_organizacion_id": str(organizacion_id),
            "p_min_restart_sequence": max(1, min_restart_sequence),
            "p_limit": max(1, min(limit, 500)),
        }
        data = await self._rpc("crm_contact_restart_stats", payload)
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada al obtener reinicios de contactos: {data!r}"
        )

    async def contact_restart_stats_debug(
        self,
        *,
        actor_user_id: UUID,
        organizacion_id: UUID,
        min_restart_sequence: int = 1,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_actor_user_id": str(actor_user_id),
            "p_organizacion_id": str(organizacion_id),
            "p_min_restart_sequence": max(1, min_restart_sequence),
            "p_limit": max(1, min(limit, 500)),
        }
        data = await self._rpc("crm_contact_restart_stats_debug", payload)
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada al obtener reinicios (debug): {data!r}"
        )

    async def ensure_conversation_opportunity(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        conversation_id: str,
        canal: str | None = None,
        contacto_nombre: str | None = None,
        contacto_empresa: str | None = None,
        force_new_opportunity_on_restart: bool = False,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> tuple[UUID, bool, int]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")

        base_metadata = {
            "conversation_id": conversation_key,
            "channel": canal,
            "canal": canal,
            "source": "assistant",
            "origin": "assistant",
        }

        def _merged_metadata(raw: Any) -> dict[str, Any]:
            metadata = _ensure_metadata(raw)
            for key, value in base_metadata.items():
                if value is None:
                    continue
                current = metadata.get(key)
                if isinstance(current, str) and current.strip():
                    continue
                metadata[key] = value
            return metadata

        def _is_closed_opportunity(row: dict[str, Any]) -> bool:
            estado = str(row.get("estado") or "").strip().lower()
            if estado in {
                "cerrada",
                "ganada",
                "perdida",
                "closed",
                "won",
                "lost",
                "cerrado_ganado",
                "cerrado_perdido",
            }:
                return True

            etapa = row.get("etapa")
            etapa_categoria = ""
            etapa_codigo = ""
            if isinstance(etapa, dict):
                etapa_categoria = str(etapa.get("categoria") or "").strip().lower()
                etapa_codigo = str(etapa.get("codigo") or "").strip().lower()
            elif isinstance(etapa, list) and etapa and isinstance(etapa[0], dict):
                etapa_categoria = str(etapa[0].get("categoria") or "").strip().lower()
                etapa_codigo = str(etapa[0].get("codigo") or "").strip().lower()

            return etapa_categoria in {"ganada", "perdida", "cerrada"} or etapa_codigo in {
                "cerrado_ganado",
                "cerrado_perdido",
                "ganada",
                "perdida",
            }

        async def _conversation_is_closed(conversation_id: str) -> bool:
            conversation_key = str(conversation_id or "").strip()
            if not conversation_key:
                return False
            response = await self._request(
                "GET",
                "/rest/v1/conversaciones",
                params={
                    "id": f"eq.{conversation_key}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "select": "estado",
                    "limit": "1",
                },
            )
            rows = response.json() or []
            if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
                return False
            return str(rows[0].get("estado") or "").strip().lower() in {"cerrada", "closed"}

        async def _patch_metadata(
            opportunity_id: UUID,
            metadata: dict[str, Any],
            *,
            row: dict[str, Any] | None = None,
        ) -> UUID:
            patch_payload: dict[str, Any] = {"metadata": metadata}
            if row:
                for key in ("canal", "contacto_nombre", "restart_sequence", "titulo"):
                    value = row.get(key)
                    if value not in (None, ""):
                        patch_payload[key] = value
            patch_payload = _normalize_opportunity_payload(
                patch_payload,
                include_metadata=True,
                allow_title_fallback=True,
            )
            params = {
                "id": f"eq.{opportunity_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            }
            await self._request(
                "PATCH",
                "/rest/v1/oportunidades",
                params=params,
                json=patch_payload,
                prefer="return=representation",
            )
            return opportunity_id

        select_columns = (
            "id,contacto_principal_id,metadata,canal,contacto_nombre,restart_sequence,asignado_a_usuario_id,"
            "etapa_id,estado,titulo,descripcion,monto_estimado,moneda,probabilidad,"
            "etapa:etapas_pipeline!oportunidades_etapa_org_fkey(codigo,categoria)"
        )

        # Buscar por metadata->>conversation_id
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>conversation_id": f"eq.{conversation_key}",
            "select": select_columns,
            "order": "creado_en.desc",
            "limit": "25",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        rows = resp.json() or []
        if isinstance(rows, list) and rows:
            row: dict[str, Any] | None = None
            for candidate in rows:
                if isinstance(candidate, dict) and not _is_closed_opportunity(candidate):
                    row = candidate
                    break
            if row is None and isinstance(rows[0], dict):
                row = rows[0]
            if row is None:
                raise CRMRepositoryError(f"opportunity_row_invalid:{rows[0]!r}")
            opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
            metadata = _merged_metadata(row.get("metadata"))
            current_assignee = row.get("asignado_a_usuario_id")
            assignee_uuid = (
                _coerce_uuid(current_assignee, field="asignado_a_usuario_id")
                if current_assignee
                else None
            )
            if _is_closed_opportunity(row):
                # Si ya existe una oportunidad cerrada para la MISMA conversación,
                # no creamos "restart": reutilizamos esa oportunidad.
                result_id = await _patch_metadata(opportunity_id, metadata, row=row)
                restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
                await self._set_conversation_restart_sequence(
                    conversation_id=conversation_key,
                    restart_sequence=restart_sequence,
                )
                return result_id, False, restart_sequence
            result_id = await _patch_metadata(opportunity_id, metadata, row=row)
            restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
            await self._set_conversation_restart_sequence(
                conversation_id=conversation_key,
                restart_sequence=restart_sequence,
            )
            await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                current_assignee=assignee_uuid,
                conversation_id=conversation_id,
                persona_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
                channel=canal,
            )
            return result_id, False, restart_sequence

        # Dedupe cross-contact: si existe oportunidad activa con el mismo teléfono,
        # reutilizarla en lugar de crear una nueva.
        contact_phone: str | None = None
        try:
            contact_row = await self.get_persona(
                organizacion_id=organizacion_id,
                persona_id=contacto_id,
            )
        except CRMRepositoryError:
            contact_row = None
        if isinstance(contact_row, dict):
            raw_phone = contact_row.get("telefono_e164")
            if isinstance(raw_phone, str) and raw_phone.strip():
                contact_phone = raw_phone.strip()
        if contact_phone:
            contacts_params = {
                "organizacion_id": f"eq.{organizacion_id}",
                "telefono_principal_e164": f"eq.{contact_phone}",
                "select": "metadata",
                "limit": "25",
            }
            contacts_resp = await self._request("GET", "/rest/v1/personas", params=contacts_params)
            contacts_rows = contacts_resp.json() or []
            related_contact_ids: list[str] = []
            if isinstance(contacts_rows, list):
                for row in contacts_rows:
                    if not isinstance(row, dict):
                        continue
                    candidate = row.get("id")
                    if not candidate:
                        continue
                    candidate = str(candidate)
                    if candidate == str(contacto_id):
                        continue
                    related_contact_ids.append(candidate)
            if related_contact_ids:
                in_filter = ",".join(related_contact_ids)
                by_phone_params = {
                    "organizacion_id": f"eq.{organizacion_id}",
                    "contacto_principal_id": f"in.({in_filter})",
                    "select": select_columns,
                    "order": "creado_en.desc",
                    "limit": "25",
                }
                by_phone_resp = await self._request("GET", "/rest/v1/oportunidades", params=by_phone_params)
                by_phone_rows = by_phone_resp.json() or []
                if isinstance(by_phone_rows, list):
                    for candidate in by_phone_rows:
                        if not isinstance(candidate, dict):
                            continue
                        if _is_closed_opportunity(candidate):
                            continue
                        candidate_metadata = _ensure_metadata(candidate.get("metadata"))
                        candidate_conversation = str(
                            candidate_metadata.get("conversation_id") or ""
                        ).strip()
                        if (
                            (canal or "").strip().lower() == "whatsapp"
                            and candidate_conversation
                            and candidate_conversation != conversation_key
                            and await _conversation_is_closed(candidate_conversation)
                        ):
                            continue
                        opportunity_id = _coerce_uuid(candidate.get("id"), field="opportunity_id")
                        metadata = _merged_metadata(candidate_metadata)
                        current_assignee = candidate.get("asignado_a_usuario_id")
                        assignee_uuid = (
                            _coerce_uuid(current_assignee, field="asignado_a_usuario_id")
                            if current_assignee
                            else None
                        )
                        payload: dict[str, Any] = {"metadata": metadata}
                        existing_contact_raw = candidate.get("contacto_principal_id")
                        if str(existing_contact_raw or "") != str(contacto_id):
                            payload["contacto_principal_id"] = str(contacto_id)
                        for key in ("canal", "contacto_nombre", "restart_sequence", "titulo"):
                            value = candidate.get(key)
                            if value not in (None, ""):
                                payload[key] = value
                        params = {
                            "id": f"eq.{opportunity_id}",
                            "organizacion_id": f"eq.{organizacion_id}",
                            "limit": "1",
                        }
                        await self._request(
                            "PATCH",
                            "/rest/v1/oportunidades",
                            params=params,
                            json=_normalize_opportunity_payload(
                                payload,
                                include_metadata=True,
                                allow_title_fallback=True,
                            ),
                            prefer="return=representation",
                        )
                        restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
                        await self._set_conversation_restart_sequence(
                            conversation_id=conversation_key,
                            restart_sequence=restart_sequence,
                        )
                        await self._assign_sales_rep_if_needed(
                            oportunidad_id=opportunity_id,
                            organizacion_id=organizacion_id,
                            current_assignee=assignee_uuid,
                            conversation_id=conversation_id,
                            persona_id=str(contacto_id),
                            contact_ready=contact_ready,
                            require_contact_ready=require_contact_ready,
                            channel=canal,
                        )
                        return opportunity_id, False, restart_sequence

        # Buscar por contacto principal
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_principal_id": f"eq.{contacto_id}",
            "select": select_columns,
            "order": "creado_en.desc",
            "limit": "25",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        rows = resp.json() or []
        if isinstance(rows, list) and rows:
            active_row: dict[str, Any] | None = None
            for candidate in rows:
                if isinstance(candidate, dict) and not _is_closed_opportunity(candidate):
                    active_row = candidate
                    break

            row = active_row or rows[0]
            if not isinstance(row, dict):
                raise CRMRepositoryError(f"opportunity_row_invalid:{row!r}")
            opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
            metadata = _merged_metadata(row.get("metadata"))
            current_assignee = row.get("asignado_a_usuario_id")
            assignee_uuid = (
                _coerce_uuid(current_assignee, field="asignado_a_usuario_id")
                if current_assignee
                else None
            )
            existing_conversation = ""
            metadata_conversation = metadata.get("conversation_id")
            if isinstance(metadata_conversation, str):
                existing_conversation = metadata_conversation.strip()
            if _is_closed_opportunity(row):
                return await self._create_opportunity_from_contact(
                    organizacion_id=organizacion_id,
                    contacto_id=contacto_id,
                    conversation_id=conversation_key,
                    canal=canal,
                    contacto_nombre=contacto_nombre,
                    contacto_empresa=contacto_empresa,
                    base_metadata=base_metadata,
                    parent_row=row,
                    parent_metadata=metadata,
                    parent_assignee=assignee_uuid,
                    is_restart=True,
                    contact_ready=contact_ready,
                    require_contact_ready=require_contact_ready,
                )
            if (
                (canal or "").strip().lower() == "whatsapp"
                and existing_conversation
                and existing_conversation != conversation_key
                and await _conversation_is_closed(existing_conversation)
            ):
                return await self._create_opportunity_from_contact(
                    organizacion_id=organizacion_id,
                    contacto_id=contacto_id,
                    conversation_id=conversation_key,
                    canal=canal,
                    contacto_nombre=contacto_nombre,
                    contacto_empresa=contacto_empresa,
                    base_metadata=base_metadata,
                    parent_row=row,
                    parent_metadata=metadata,
                    parent_assignee=assignee_uuid,
                    is_restart=True,
                    contact_ready=contact_ready,
                    require_contact_ready=require_contact_ready,
                )
            should_restart = (
                force_new_opportunity_on_restart
                and existing_conversation
                and existing_conversation != conversation_key
            )
            if should_restart:
                return await self._create_opportunity_from_contact(
                organizacion_id=organizacion_id,
                contacto_id=contacto_id,
                conversation_id=conversation_key,
                canal=canal,
                contacto_nombre=contacto_nombre,
                contacto_empresa=contacto_empresa,
                base_metadata=base_metadata,
                parent_row=row,
                parent_metadata=metadata,
                parent_assignee=assignee_uuid,
                is_restart=True,
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
            )

            result_id = await _patch_metadata(opportunity_id, metadata, row=row)
            restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
            await self._set_conversation_restart_sequence(
                conversation_id=conversation_key,
                restart_sequence=restart_sequence,
            )
            await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                current_assignee=assignee_uuid,
                conversation_id=conversation_id,
                persona_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
                channel=canal,
            )
            return result_id, False, restart_sequence

        # Crear oportunidad mínima (no había registros previos)
        return await self._create_opportunity_from_contact(
            organizacion_id=organizacion_id,
            contacto_id=contacto_id,
            conversation_id=conversation_key,
            canal=canal,
            contacto_nombre=contacto_nombre,
            contacto_empresa=contacto_empresa,
            base_metadata=base_metadata,
            is_restart=False,
            contact_ready=contact_ready,
            require_contact_ready=require_contact_ready,
        )

    async def _create_opportunity_from_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        conversation_id: str,
        canal: str | None,
        contacto_nombre: str | None,
        contacto_empresa: str | None,
        base_metadata: dict[str, Any],
        parent_row: dict[str, Any] | None = None,
        parent_metadata: dict[str, Any] | None = None,
        parent_assignee: UUID | None = None,
        is_restart: bool = False,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> tuple[UUID, bool, int]:
        stage_id_value = parent_row.get("etapa_id") if parent_row else None
        stage_id: UUID | None = None

        parent_is_closed = False
        if parent_row:
            parent_state = str(parent_row.get("estado") or "").strip().lower()
            if parent_state in {
                "cerrada",
                "ganada",
                "perdida",
                "closed",
                "won",
                "lost",
                "cerrado_ganado",
                "cerrado_perdido",
            }:
                parent_is_closed = True
            parent_stage = parent_row.get("etapa")
            parent_stage_category = ""
            parent_stage_code = ""
            if isinstance(parent_stage, dict):
                parent_stage_category = str(parent_stage.get("categoria") or "").strip().lower()
                parent_stage_code = str(parent_stage.get("codigo") or "").strip().lower()
            elif isinstance(parent_stage, list) and parent_stage and isinstance(parent_stage[0], dict):
                parent_stage_category = str(parent_stage[0].get("categoria") or "").strip().lower()
                parent_stage_code = str(parent_stage[0].get("codigo") or "").strip().lower()
            if parent_stage_category in {"ganada", "perdida", "cerrada"} or parent_stage_code in {
                "cerrado_ganado",
                "cerrado_perdido",
                "ganada",
                "perdida",
            }:
                parent_is_closed = True

        if stage_id_value and not parent_is_closed:
            try:
                stage_id = UUID(str(stage_id_value))
            except (TypeError, ValueError):
                stage_id = None
        if stage_id is None:
            stage_id = await self._get_default_stage_id(organizacion_id=organizacion_id)

        base_title = (contacto_empresa or "").strip()
        if parent_row and isinstance(parent_row.get("titulo"), str):
            parent_title = parent_row["titulo"].strip()
        else:
            parent_title = ""
        titulo = parent_title or base_title or f"Conversación {conversation_id[:8]}"

        metadata = {k: v for k, v in base_metadata.items() if v is not None}
        conversation_history = [conversation_id]
        restart_sequence = 1
        parent_id: UUID | None = None
        if parent_row:
            parent_id = _coerce_uuid(parent_row.get("id"), field="parent_opportunity_id")
            metadata["parent_opportunity_id"] = str(parent_id)
            parent_meta = parent_metadata or {}
            restart_sequence = _coerce_positive_int(parent_meta.get("restart_sequence"), default=1) + 1
            conversation_history = _build_conversation_history(parent_meta, conversation_id)
        metadata["restart_sequence"] = restart_sequence
        metadata["conversation_history"] = conversation_history

        moneda_value = parent_row.get("moneda") if parent_row else None

        create_body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "contacto_principal_id": str(contacto_id),
            "etapa_id": str(stage_id),
            "titulo": titulo,
            "moneda": moneda_value or "MXN",
            "canal": canal,
            "contacto_nombre": contacto_nombre,
            "restart_sequence": restart_sequence,
            "metadata": metadata,
        }
        create_body = _normalize_opportunity_payload(
            create_body,
            include_metadata=True,
            allow_title_fallback=True,
        )
        if parent_row:
            for field in ("monto_estimado", "descripcion", "probabilidad"):
                value = parent_row.get(field)
                if value not in (None, ""):
                    create_body[field] = value

        resp = await self._request(
            "POST",
            "/rest/v1/oportunidades",
            json=create_body,
            prefer="return=representation",
        )
        data = resp.json() or []
        row: dict[str, Any]
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict) and data:
            row = data
        else:
            raise CRMRepositoryError("Respuesta inesperada al crear oportunidad")

        opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
        assigned_user_id = parent_assignee

        if parent_assignee:
            await self._set_opportunity_assignee(
                organizacion_id=organizacion_id,
                oportunidad_id=opportunity_id,
                usuario_id=parent_assignee,
            )
        else:
            assigned_user_id = await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                conversation_id=conversation_id,
                persona_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
                channel=canal,
            )

        if parent_row and assigned_user_id:
            audit_metadata: dict[str, Any] = {"source": "restart"}
            if parent_id:
                audit_metadata["parent_opportunity_id"] = str(parent_id)
            assignment_channel = (canal or "").strip().lower() or "assistant"
            await self._insert_assignment_audit(
                organizacion_id=organizacion_id,
                oportunidad_id=opportunity_id,
                vendedor_id=assigned_user_id,
                conversation_id=conversation_id,
                persona_id=str(contacto_id),
                trigger="restart_conversation",
                metadata=audit_metadata,
                canal=assignment_channel,
            )

        await self._set_conversation_restart_sequence(
            conversation_id=conversation_id,
            restart_sequence=restart_sequence,
        )

        return opportunity_id, bool(parent_row) or is_restart, restart_sequence

    async def _set_opportunity_assignee(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json={"asignado_a_usuario_id": str(usuario_id)},
            prefer="return=minimal",
        )

    async def get_pipeline_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener oportunidad del pipeline: {row!r}"
            )
        return row

    async def get_pipeline_opportunity_by_id(
        self,
        *,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene una oportunidad del pipeline usando únicamente su ID."""
        params = {
            "id": f"eq.{oportunidad_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener oportunidad por id: {row!r}")
        raw_org_id = row.get("organizacion_id")
        try:
            organizacion_id = _coerce_uuid(raw_org_id, field="organizacion_id")
        except Exception:
            organizacion_id = None
        if organizacion_id is not None:
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=[row],
                source_fields=("contacto_principal_id",),
            )
        return row

    async def assign_next_sales_rep(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        """Invoca la RPC que selecciona al siguiente vendedor disponible."""
        payload = {"p_organizacion_id": str(organizacion_id)}
        data = await self._rpc("asignar_vendedor_round_robin", payload)
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict) and data:
            row = data
        else:
            return None
        usuario_value = row.get("usuario_id")
        if not usuario_value:
            return None
        usuario_id = _coerce_uuid(usuario_value, field="usuario_id")
        return {
            "usuario_id": usuario_id,
            "nombre": row.get("nombre"),
            "correo": row.get("correo"),
            "telefono_e164": row.get("telefono_e164"),
        }

    async def _assign_sales_rep_if_needed(
        self,
        *,
        oportunidad_id: UUID,
        organizacion_id: UUID,
        current_assignee: UUID | None = None,
        conversation_id: str | None = None,
        persona_id: str | None = None,
        contact_id: str | None = None,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
        channel: str | None = None,
    ) -> UUID | None:
        """Asigna un vendedor round-robin cuando la oportunidad aún no tiene dueño."""
        resolved_persona_id = persona_id or contact_id
        if current_assignee:
            await self._set_persona_owner_if_missing(
                organizacion_id=organizacion_id,
                persona_id=resolved_persona_id,
                owner_id=current_assignee,
            )
            if conversation_id:
                await self.assign_conversation_if_unassigned(
                    organizacion_id=organizacion_id,
                    conversation_id=conversation_id,
                    usuario_id=current_assignee,
                )
            return current_assignee
        if require_contact_ready and not bool(contact_ready):
            logger.info(
                "crm.sales_assignment.skipped_contact_not_ready",
                extra={
                    "oportunidad_id": str(oportunidad_id),
                    "organizacion_id": str(organizacion_id),
                    "persona_id": resolved_persona_id,
                },
            )
            return None
        if resolved_persona_id:
            try:
                contact_uuid = _coerce_uuid(resolved_persona_id, field="persona_id")
            except ValueError:
                contact_uuid = None
            if contact_uuid:
                params = {
                    "id": f"eq.{contact_uuid}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "select": "propietario_usuario_id",
                    "limit": "1",
                }
                resp = await self._request("GET", "/rest/v1/personas", params=params)
                rows = resp.json() or []
                if isinstance(rows, list) and rows:
                    owner_value = rows[0].get("propietario_usuario_id")
                    if owner_value:
                        owner_uuid = _coerce_uuid(
                            owner_value, field="propietario_usuario_id"
                        )
                        await self._request(
                            "PATCH",
                            "/rest/v1/oportunidades",
                            params={
                                "id": f"eq.{oportunidad_id}",
                                "organizacion_id": f"eq.{organizacion_id}",
                                "limit": "1",
                            },
                            json={"asignado_a_usuario_id": str(owner_uuid)},
                            prefer="return=minimal",
                        )
                        await self._set_contact_owner_if_missing(
                            organizacion_id=organizacion_id,
                            persona_id=resolved_persona_id,
                            owner_id=owner_uuid,
                        )
                        if conversation_id:
                            await self.assign_conversation_if_unassigned(
                                organizacion_id=organizacion_id,
                                conversation_id=conversation_id,
                                usuario_id=owner_uuid,
                            )
                        logger.info(
                            "crm.sales_assignment.completed_contact_owner",
                            extra={
                                "oportunidad_id": str(oportunidad_id),
                                "organizacion_id": str(organizacion_id),
                                "usuario_id": str(owner_uuid),
                            },
                        )
                        assignment_channel = (channel or "").strip() or "assistant"
                        await self._insert_assignment_audit(
                            organizacion_id=organizacion_id,
                            oportunidad_id=oportunidad_id,
                            vendedor_id=owner_uuid,
                            conversation_id=conversation_id,
                            persona_id=resolved_persona_id,
                            trigger="auto_assign",
                            metadata={"source": "contact_owner"},
                            canal=assignment_channel,
                        )
                        return owner_uuid
        candidate = await self.assign_next_sales_rep(organizacion_id=organizacion_id)
        if not candidate:
            logger.info(
                "crm.sales_assignment.skipped",
                extra={
                    "oportunidad_id": str(oportunidad_id),
                    "organizacion_id": str(organizacion_id),
                },
            )
            return None
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json={"asignado_a_usuario_id": str(candidate["usuario_id"])},
            prefer="return=minimal",
        )
        await self._set_persona_owner_if_missing(
            organizacion_id=organizacion_id,
            persona_id=resolved_persona_id,
            owner_id=candidate["usuario_id"],
        )
        if conversation_id:
            await self.assign_conversation_if_unassigned(
                organizacion_id=organizacion_id,
                conversation_id=conversation_id,
                usuario_id=candidate["usuario_id"],
            )
        logger.info(
            "crm.sales_assignment.completed",
            extra={
                "oportunidad_id": str(oportunidad_id),
                "organizacion_id": str(organizacion_id),
                "usuario_id": str(candidate["usuario_id"]),
            },
        )
        assignment_channel = (channel or "").strip() or "assistant"
        await self._insert_assignment_audit(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            vendedor_id=candidate["usuario_id"],
            conversation_id=conversation_id,
            persona_id=resolved_persona_id,
            trigger="auto_assign",
            metadata={"source": "round_robin"},
            canal=assignment_channel,
        )
        return candidate["usuario_id"]

    async def _set_persona_owner_if_missing(
        self,
        *,
        organizacion_id: UUID,
        persona_id: str | None,
        owner_id: UUID,
    ) -> None:
        if not persona_id:
            return
        try:
            contact_uuid = _coerce_uuid(persona_id, field="persona_id")
        except ValueError:
            return
        await self._request(
            "PATCH",
            "/rest/v1/personas",
            params={
                "id": f"eq.{contact_uuid}",
                "organizacion_id": f"eq.{organizacion_id}",
                "propietario_usuario_id": "is.null",
                "limit": "1",
            },
            json={"propietario_usuario_id": str(owner_id)},
            prefer="return=minimal",
        )

    async def _set_contact_owner_if_missing(
        self,
        *,
        organizacion_id: UUID,
        contact_id: str | None = None,
        persona_id: str | None = None,
        owner_id: UUID,
    ) -> None:
        await self._set_persona_owner_if_missing(
            organizacion_id=organizacion_id,
            persona_id=persona_id or contact_id,
            owner_id=owner_id,
        )

    async def _set_conversation_restart_sequence(
        self,
        *,
        conversation_id: str,
        restart_sequence: int,
    ) -> None:
        conversation_key = (conversation_id or "").strip()
        if not conversation_key:
            return
        params = {
            "id": f"eq.{conversation_key}",
            "limit": "1",
        }
        payload = {"restart_sequence": max(1, restart_sequence)}
        try:
            await self._request(
                "PATCH",
                "/rest/v1/conversaciones",
                params=params,
                json=payload,
                prefer="return=minimal",
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "crm.conversation.restart_sequence_update_failed",
                extra={"conversation_id": conversation_key, "error": str(exc)},
            )

    async def insert_sales_assignment_audit(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None,
        vendedor_id: UUID,
        conversation_id: str | None,
        persona_id: str | None = None,
        contact_id: str | None,
        trigger: str,
        metadata: dict[str, Any] | None = None,
        notification_sid: str | None = None,
        canal: str | None = None,
    ) -> None:
        await self._insert_assignment_audit(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            vendedor_id=vendedor_id,
            conversation_id=conversation_id,
            persona_id=persona_id,
            contact_id=contact_id,
            trigger=trigger,
            metadata=metadata,
            notification_sid=notification_sid,
            canal=canal,
        )

    async def _insert_assignment_audit(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None,
        vendedor_id: UUID,
        conversation_id: str | None,
        persona_id: str | None,
        trigger: str,
        metadata: dict[str, Any] | None,
        notification_sid: str | None = None,
        canal: str | None = None,
        contact_id: str | None = None,
    ) -> None:
        channel_value = (canal or "").strip().lower() or "assistant"
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "vendedor_usuario_id": str(vendedor_id),
            "trigger_event": trigger,
            "metadata": metadata or {},
            "canal": channel_value,
        }
        if oportunidad_id:
            payload["oportunidad_id"] = str(oportunidad_id)
        if conversation_id:
            payload["conversacion_id"] = str(conversation_id)
        if persona_id:
            payload["persona_id"] = str(persona_id)
        elif contact_id:
            payload["contacto_id"] = str(contact_id)
        if notification_sid:
            payload["notificacion_message_sid"] = notification_sid
        await self._request(
            "POST",
            "/rest/v1/asignaciones_vendedores",
            json=payload,
            prefer="return=minimal",
        )

    async def find_sales_rep_by_phone(self, *, phone_e164: str) -> dict[str, Any] | None:
        """Localiza a un usuario/empleado tolerando +52 y +521 de Mexico."""
        normalized = (phone_e164 or "").strip()
        if not normalized:
            return None
        candidates = [normalized]
        canonical = normalize_phone(normalized)
        if canonical and canonical not in candidates:
            candidates.append(canonical)
        if canonical.startswith("+521"):
            candidates.append("+52" + canonical[4:])
        elif canonical.startswith("+52"):
            candidates.append("+521" + canonical[3:])
        candidates = list(dict.fromkeys(candidates))
        params = {
            "or": "(" + ",".join(f"telefono_e164.eq.{value}" for value in candidates) + ")",
            "select": "id,nombre_completo,correo",
            "limit": "20",
        }
        resp = await self._request("GET", "/rest/v1/usuarios", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return None
        for row in data:
            try:
                usuario_id = UUID(str(row.get("id")))
            except (TypeError, ValueError):
                continue
            empleados_params = {
                "usuario_id": f"eq.{usuario_id}",
                "es_vendedor": "is.true",
                "select": "organizacion_id",
            }
            employee_resp = await self._request("GET", "/rest/v1/empleados", params=empleados_params)
            empleados = employee_resp.json() or []
            organizacion_ids: list[UUID] = []
            if isinstance(empleados, list):
                for item in empleados:
                    try:
                        org_id = UUID(str(item.get("organizacion_id")))
                    except (TypeError, ValueError):
                        continue
                    organizacion_ids.append(org_id)
            if organizacion_ids:
                return {
                    "usuario_id": usuario_id,
                    "nombre": row.get("nombre_completo") or row.get("correo"),
                    "correo": row.get("correo"),
                    "organizacion_ids": organizacion_ids,
                }
        return None

    async def find_pending_sales_assignment(
        self,
        *,
        vendedor_id: UUID,
        organizacion_ids: Sequence[UUID] | None = None,
        notification_sid: str | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene la notificación pendiente, priorizando su SID exacto."""
        params: dict[str, Any] = {
            "vendedor_usuario_id": f"eq.{vendedor_id}",
            "aceptado_en": "is.null",
            "trigger_event": "like.notify_%",
            "order": "creado_en.desc",
            "limit": "1",
            "select": "id,organizacion_id,oportunidad_id,contacto_id,conversacion_id,metadata,notificacion_message_sid",
        }
        if organizacion_ids:
            org_values = ",".join(f'"{org_id}"' for org_id in organizacion_ids)
            params["organizacion_id"] = f"in.({org_values})"
        if notification_sid:
            params["notificacion_message_sid"] = f"eq.{notification_sid.strip()}"
        resp = await self._request(
            "GET",
            "/rest/v1/asignaciones_vendedores",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def update_sales_assignment_ack(
        self,
        *,
        assignment_id: UUID,
        ack_user_id: UUID,
        ack_time: datetime,
        ack_via: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Marca el registro de auditoría como aceptado por el vendedor."""
        params = {
            "id": f"eq.{assignment_id}",
            "limit": "1",
        }
        payload: dict[str, Any] = {
            "aceptado_en": ack_time.isoformat(),
            "aceptado_por_usuario_id": str(ack_user_id),
            "aceptado_via": ack_via,
        }
        if metadata is not None:
            payload["metadata"] = metadata
        await self._request(
            "PATCH",
            "/rest/v1/asignaciones_vendedores",
            params=params,
            json=payload,
            prefer="return=minimal",
        )

    async def get_sales_assignment_by_notification_sid(
        self,
        *,
        notification_sid: str,
    ) -> dict[str, Any] | None:
        sid = str(notification_sid or "").strip()
        if not sid:
            return None
        params = {
            "notificacion_message_sid": f"eq.{sid}",
            "order": "creado_en.desc",
            "limit": "1",
            "select": (
                "id,organizacion_id,oportunidad_id,contacto_id,conversacion_id,trigger_event,"
                "metadata,canal,notificacion_message_sid"
            ),
        }
        resp = await self._request("GET", "/rest/v1/asignaciones_vendedores", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
            return row if isinstance(row, dict) else None
        return None

    async def update_sales_assignment_notification(
        self,
        *,
        assignment_id: UUID,
        metadata: dict[str, Any] | None = None,
        notification_sid: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {}
        if isinstance(metadata, dict):
            payload["metadata"] = metadata
        if notification_sid:
            payload["notificacion_message_sid"] = notification_sid
        if not payload:
            return
        params = {"id": f"eq.{assignment_id}", "limit": "1"}
        await self._request(
            "PATCH",
            "/rest/v1/asignaciones_vendedores",
            params=params,
            json=payload,
            prefer="return=minimal",
        )

    async def get_contact_opportunity(
        self,
        *,
        contact_id: UUID,
        conversation_id: str | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "select": self._PIPELINE_SELECT,
            "order": "creado_en.desc",
            "limit": "1",
        }
        if conversation_id:
            params["metadata->>conversation_id"] = f"eq.{conversation_id}"
        else:
            params["contacto_principal_id"] = f"eq.{contact_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        if row.get("contacto_principal_id"):
            try:
                org_uuid = _coerce_uuid(str(row.get("organizacion_id")), field="organizacion_id")
            except Exception:
                org_uuid = None
            if org_uuid:
                await self._attach_contact_rows(
                    organizacion_id=org_uuid,
                    rows=[row],
                    source_fields=("contacto_principal_id",),
                )
        return row

    async def update_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = _normalize_opportunity_payload(
            payload,
            include_metadata="metadata" in payload,
            allow_title_fallback=False,
        )
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la oportunidad actualizada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar oportunidad: {row!r}")
        return row

    async def delete_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/oportunidades",
            params=params,
            prefer="return=representation",
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al eliminar oportunidad: {resp.text}"
            )

    async def register_webchat_message(
        self,
        *,
        session_id: str,
        author: str,
        content: str,
        response_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        inactivity_minutes: int | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, str | None]:
        payload: dict[str, Any] = {
            "p_session_id": session_id,
            "p_author": author,
            "p_content": content,
        }
        if response_id:
            payload["p_response_id"] = response_id
        effective_inactivity_hours = inactivity_hours
        if effective_inactivity_hours is None and inactivity_minutes is not None:
            effective_inactivity_hours = max(1, int((max(1, inactivity_minutes) + 59) // 60))
        metadata_payload = dict(metadata or {})
        if inactivity_minutes is not None:
            metadata_payload["__inactivity_minutes"] = max(1, int(inactivity_minutes))
        if metadata_payload:
            payload["p_metadata"] = metadata_payload
        if effective_inactivity_hours is not None:
            payload["p_inactivity_hours"] = effective_inactivity_hours
        if attachments:
            payload["p_attachments"] = attachments
        # IMPORTANTE:
        # En la BD existen 2 overloads de `registrar_mensaje_webchat`:
        # - uno sin `p_organizacion_id`
        # - otro con `p_organizacion_id uuid`
        # PostgREST falla con PGRST203 si enviamos el payload sin ese campo (no puede elegir candidato).
        # Solución: siempre enviar `p_organizacion_id` y, si no hay pista, caer al tenant maestro.
        org_uuid: UUID | None = None
        if organizacion_id:
            try:
                org_uuid = UUID(str(organizacion_id))
            except (ValueError, TypeError):
                org_uuid = None
        if not org_uuid and settings.webchat_default_organizacion_id:
            try:
                org_uuid = UUID(str(settings.webchat_default_organizacion_id))
            except (ValueError, TypeError):
                org_uuid = None
        if not org_uuid:
            org_uuid = UUID("00000000-0000-0000-0000-000000000001")
        payload["p_organizacion_id"] = str(org_uuid)
        data = await self._rpc("registrar_mensaje_webchat", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_webchat: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_webchat: {row!r}")
        persona_id = row.get("persona_id") or row.get("contacto_id")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "contact_id": persona_id,
            "persona_id": persona_id,
            "organizacion_id": row.get("organizacion_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def register_whatsapp_message(
        self,
        *,
        direction: Literal["entrante", "saliente"],
        wa_id: str | None,
        phone_e164: str | None,
        body: str | None,
        message_sid: str | None,
        profile_name: str | None = None,
        conversation_id: str | None = None,
        persona_id: str | None = None,
        contact_id: str | None = None,
        response_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        inactivity_minutes: int | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        webhook_payload: dict[str, Any] | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, Any]:
        resolved_persona_id = persona_id or contact_id
        payload: dict[str, Any] = {
            "p_direction": direction,
            "p_whatsapp_id": wa_id,
            "p_phone_e164": phone_e164,
            "p_body": body,
            "p_metadata": metadata or {},
            "p_message_sid": message_sid,
            "p_profile_name": None,
            "p_conversation_id": conversation_id,
            "p_contact_id": resolved_persona_id,
            "p_response_id": response_id,
        }
        minutes = (
            inactivity_minutes
            if inactivity_minutes is not None
            else (inactivity_hours * 60 if inactivity_hours is not None else None)
        )
        if minutes is not None:
            payload["p_inactivity_minutes"] = minutes
        if attachments:
            payload["p_attachments"] = attachments
        if webhook_payload is not None:
            payload["p_webhook_payload"] = webhook_payload
        if organizacion_id:
            payload["p_organizacion_id"] = organizacion_id
        data = await self._rpc("registrar_mensaje_whatsapp", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_whatsapp: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_whatsapp: {row!r}")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "persona_id": row.get("contacto_id"),
            "contact_id": row.get("contacto_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def register_messenger_message(
        self,
        *,
        sender_id: str,
        recipient_id: str | None = None,
        message_id: str | None = None,
        content: str | None = None,
        direction: Literal["entrante", "saliente"] = "entrante",
        metadata: dict[str, Any] | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        response_id: str | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "p_sender_id": sender_id,
            "p_recipient_id": recipient_id,
            "p_message_id": message_id,
            "p_content": content,
            "p_direction": direction,
            "p_metadata": metadata or {},
            "p_inactivity_hours": inactivity_hours,
            "p_attachments": attachments or [],
            "p_response_id": response_id,
        }
        if organizacion_id:
            try:
                payload["p_organizacion_id"] = str(UUID(str(organizacion_id)))
            except (TypeError, ValueError) as exc:
                raise CRMRepositoryError(f"organizacion_id inválido: {organizacion_id}") from exc
        data = await self._rpc("registrar_mensaje_messenger", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_messenger: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_messenger: {row!r}")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "contact_id": row.get("contacto_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def get_message_by_twilio_sid(self, *, message_sid: str) -> dict[str, Any] | None:
        """Obtiene el mensaje guardado con un SID de Twilio específico."""
        sid = str(message_sid or "").strip()
        if not sid:
            return None
        params = {
            "twilio_message_sid": f"eq.{sid}",
            "select": "id,conversacion_id,organizacion_id,direccion,twilio_message_sid,creado_en",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/mensajes", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if isinstance(row, dict):
            return row
        return None

    async def list_whatsapp_conversations_for_followup(
        self,
        *,
        inactive_since: datetime,
        limit: int = 100,
        cursor_last_out: datetime | None = None,
        cursor_last_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Lista conversaciones WhatsApp que superaron el umbral de inactividad."""
        cutoff = inactive_since.astimezone(timezone.utc).isoformat()
        params = {
            "select": (
                "id,contacto_id,organizacion_id,estado,ultimo_saliente_en,ultimo_entrante_en,inbox_context,"
                "conversaciones_controles(manual_override)"
            ),
            "canal": "eq.whatsapp",
            "estado": "in.(abierta,pendiente)",
            "ultimo_saliente_en": f"lte.{cutoff}",
            "order": "ultimo_saliente_en.asc,id.asc",
            "limit": str(max(1, limit)),
        }
        cursor_out = cursor_last_out.astimezone(timezone.utc).isoformat() if cursor_last_out else ""
        cursor_id = str(cursor_last_id or "").strip()
        if cursor_out and cursor_id:
            params["or"] = (
                f"(ultimo_saliente_en.gt.{cursor_out},"
                f"and(ultimo_saliente_en.eq.{cursor_out},id.gt.{cursor_id}))"
            )
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return []
        return data  # type: ignore[return-value]

    async def list_webchat_conversations_for_followup(
        self,
        *,
        inactive_since: datetime,
        limit: int = 100,
        cursor_last_out: datetime | None = None,
        cursor_last_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Lista conversaciones Webchat candidatas para reenganche."""
        cutoff = inactive_since.astimezone(timezone.utc).isoformat()
        params = {
            "select": (
                "id,contacto_id,organizacion_id,estado,ultimo_saliente_en,ultimo_entrante_en,"
                "conversaciones_controles(manual_override)"
            ),
            "canal": "eq.webchat",
            "estado": "in.(abierta,pendiente)",
            "ultimo_saliente_en": f"lte.{cutoff}",
            "order": "ultimo_saliente_en.asc,id.asc",
            "limit": str(max(1, limit)),
        }
        cursor_out = cursor_last_out.astimezone(timezone.utc).isoformat() if cursor_last_out else ""
        cursor_id = str(cursor_last_id or "").strip()
        if cursor_out and cursor_id:
            params["or"] = (
                f"(ultimo_saliente_en.gt.{cursor_out},"
                f"and(ultimo_saliente_en.eq.{cursor_out},id.gt.{cursor_id}))"
            )
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        return data if isinstance(data, list) else []

    async def get_conversation_with_controls(self, *, conversation_id: str) -> dict[str, Any]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        params = {
            "id": f"eq.{conversation_key}",
            "select": "id,contacto_id,persona_id,organizacion_id,canal,conversacion_openai_id,last_response_id,"
            "conversaciones_controles(manual_override)",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_not_found")
        return row

    async def get_conversation_inbox_context(self, *, conversation_id: str) -> dict[str, Any]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        params = {
            "id": f"eq.{conversation_key}",
            "select": "id,organizacion_id,inbox_context,restart_sequence",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_not_found")
        return row

    async def get_latest_conversation_for_contact(
        self,
        *,
        contacto_id: UUID,
        canal: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "contacto_id": f"eq.{contacto_id}",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_latest_unlinked_email_conversation(
        self,
        *,
        organizacion_id: UUID,
        correo_remitente: str,
        canal: str = "correo",
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_id": "is.null",
            "persona_id": "is.null",
            "correo_remitente": f"eq.{correo_remitente.strip().lower()}",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_email_conversation_by_envio_id(
        self,
        *,
        organizacion_id: UUID,
        envio_id: UUID,
        canal: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "inbox_context->>envio_id": f"eq.{envio_id}",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def create_conversation(
        self,
        *,
        contacto_id: UUID | None = None,
        organizacion_id: UUID | None = None,
        correo_remitente: str | None = None,
        nombre_remitente: str | None = None,
        canal: str,
        estado: str | None = None,
        asignado_a_usuario_id: UUID | None = None,
        inbox_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"canal": canal}
        if contacto_id:
            body["contacto_id"] = str(contacto_id)
        if organizacion_id:
            body["organizacion_id"] = str(organizacion_id)
        if correo_remitente:
            body["correo_remitente"] = correo_remitente.strip().lower()
        if nombre_remitente:
            body["nombre_remitente"] = nombre_remitente.strip()
        if estado:
            body["estado"] = estado
        if asignado_a_usuario_id:
            body["asignado_a_usuario_id"] = str(asignado_a_usuario_id)
        if inbox_context:
            body["inbox_context"] = inbox_context
        resp = await self._request(
            "POST",
            "/rest/v1/conversaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_create_failed")
        return row

    async def insert_inbox_message(
        self,
        *,
        conversation_id: UUID,
        direction: Literal["entrante", "saliente"],
        text: str,
        datos: dict[str, Any] | None = None,
        tipo_contenido: Literal["texto", "medio", "sistema"] = "texto",
        estado: Literal["enviada", "entregada", "leida", "fallida"] = "entregada",
        provider_message_id: str | None = None,
        organizacion_id: UUID | None = None,
        occurred_at: str | None = None,
    ) -> dict[str, Any]:
        conversation_key = str(conversation_id)
        convo_resp = await self._request(
            "GET",
            "/rest/v1/conversaciones",
            params={
                "id": f"eq.{conversation_key}",
                "select": "id,organizacion_id,no_leidos,ultimo_mensaje_en,ultimo_entrante_en,ultimo_saliente_en",
                "limit": "1",
            },
        )
        convo_data = convo_resp.json() or []
        if not isinstance(convo_data, list) or not convo_data or not isinstance(convo_data[0], dict):
            raise CRMRepositoryError("conversation_not_found")
        convo_row = convo_data[0]
        org_value = organizacion_id or _safe_uuid(convo_row.get("organizacion_id"))
        trimmed_provider_id = provider_message_id.strip() if isinstance(provider_message_id, str) else ""
        if trimmed_provider_id:
            existing_message = await self.get_inbox_message_by_provider_message_id(
                provider_message_id=trimmed_provider_id,
                organizacion_id=org_value,
            )
            if existing_message is not None:
                return existing_message

        event_dt: datetime
        trimmed_occurred_at = occurred_at.strip() if isinstance(occurred_at, str) else ""
        if trimmed_occurred_at:
            try:
                event_dt = datetime.fromisoformat(trimmed_occurred_at.replace("Z", "+00:00"))
            except ValueError:
                event_dt = datetime.now(timezone.utc)
        else:
            event_dt = datetime.now(timezone.utc)
        if event_dt.tzinfo is None:
            event_dt = event_dt.replace(tzinfo=timezone.utc)
        else:
            event_dt = event_dt.astimezone(timezone.utc)
        event_iso = event_dt.isoformat()

        message_payload: dict[str, Any] = {
            "conversacion_id": conversation_key,
            "direccion": direction,
            "tipo_contenido": tipo_contenido,
            "texto": text or "",
            "datos": datos or {},
            "estado": estado,
            "creado_en": event_iso,
        }
        if trimmed_provider_id:
            message_payload["proveedor_mensaje_id"] = trimmed_provider_id
        if org_value:
            message_payload["organizacion_id"] = str(org_value)
        msg_resp = await self._request(
            "POST",
            "/rest/v1/mensajes",
            json=message_payload,
            prefer="return=representation",
        )
        msg_data = msg_resp.json() or []
        if not isinstance(msg_data, list) or not msg_data or not isinstance(msg_data[0], dict):
            raise CRMRepositoryError("inbox_message_insert_failed")
        message_row = msg_data[0]
        message_id = message_row.get("id")

        patch_payload: dict[str, Any] = {}
        current_last_message_raw = str(convo_row.get("ultimo_mensaje_en") or "").strip()
        current_last_message_dt: datetime | None = None
        if current_last_message_raw:
            try:
                current_last_message_dt = datetime.fromisoformat(
                    current_last_message_raw.replace("Z", "+00:00")
                )
            except ValueError:
                current_last_message_dt = None
        if current_last_message_dt is None or event_dt >= current_last_message_dt:
            patch_payload["ultimo_mensaje_en"] = event_iso
            patch_payload["ultimo_mensaje_id"] = message_id
        current_unread = int(convo_row.get("no_leidos") or 0)
        if direction == "entrante":
            current_last_inbound_raw = str(convo_row.get("ultimo_entrante_en") or "").strip()
            current_last_inbound_dt: datetime | None = None
            if current_last_inbound_raw:
                try:
                    current_last_inbound_dt = datetime.fromisoformat(
                        current_last_inbound_raw.replace("Z", "+00:00")
                    )
                except ValueError:
                    current_last_inbound_dt = None
            if current_last_inbound_dt is None or event_dt >= current_last_inbound_dt:
                patch_payload["ultimo_entrante_en"] = event_iso
            patch_payload["no_leidos"] = current_unread + 1
        else:
            current_last_outbound_raw = str(convo_row.get("ultimo_saliente_en") or "").strip()
            current_last_outbound_dt: datetime | None = None
            if current_last_outbound_raw:
                try:
                    current_last_outbound_dt = datetime.fromisoformat(
                        current_last_outbound_raw.replace("Z", "+00:00")
                    )
                except ValueError:
                    current_last_outbound_dt = None
            if current_last_outbound_dt is None or event_dt >= current_last_outbound_dt:
                patch_payload["ultimo_saliente_en"] = event_iso

        if patch_payload:
            await self._request(
                "PATCH",
                "/rest/v1/conversaciones",
                params={"id": f"eq.{conversation_key}"},
                json=patch_payload,
                prefer="return=minimal",
            )
        return message_row

    async def get_inbox_message_by_provider_message_id(
        self,
        *,
        provider_message_id: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        trimmed = provider_message_id.strip() if isinstance(provider_message_id, str) else ""
        if not trimmed:
            return None
        params: dict[str, str] = {
            "proveedor_mensaje_id": f"eq.{trimmed}",
            "select": "id,organizacion_id,conversacion_id,proveedor_mensaje_id",
            "limit": "1",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/mensajes",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"inbox_message_by_provider_id_invalid:{row!r}")
        return row

    async def get_webchat_persona_id_by_session(self, *, session_id: str) -> str | None:
        session_key = session_id.strip()
        if not session_key:
            return None
        params = {
            "select": "contacto_id",
            "canal": "eq.webchat",
            "id_externo": f"eq.{session_key}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        persona_id = row.get("contacto_id")
        if not persona_id:
            return None
        persona_key = str(persona_id).strip()
        if not persona_key:
            return None

        # Evita retornar referencias huérfanas desde identidades_canal.
        persona_resp = await self._request(
                "GET",
                "/rest/v1/personas",
                params={
                    "id": f"eq.{persona_key}",
                    "select": "id",
                    "limit": "1",
                },
            )
        persona_rows = persona_resp.json() or []
        if isinstance(persona_rows, list) and persona_rows:
            return persona_key
        if isinstance(persona_rows, dict) and persona_rows.get("id"):
            return persona_key
        return None

    async def get_webchat_contact_id_by_session(self, *, session_id: str) -> str | None:
        return await self.get_webchat_persona_id_by_session(session_id=session_id)

    async def get_webchat_session_by_persona(self, *, persona_id: str) -> str | None:
        persona_key = persona_id.strip()
        if not persona_key:
            return None
        params = {
            "select": "id_externo",
            "contacto_id": f"eq.{persona_key}",
            "canal": "eq.webchat",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        session_id = row.get("id_externo")
        return str(session_id) if session_id else None

    async def get_webchat_session_by_contact(self, *, contact_id: str) -> str | None:
        return await self.get_webchat_session_by_persona(persona_id=contact_id)

    async def get_latest_webchat_conversation(self, *, persona_id: str) -> dict[str, Any] | None:
        persona_key = persona_id.strip()
        if not persona_key:
            return None
        params = {
            "select": (
                "id,persona_id,contacto_id,canal,conversacion_openai_id,last_response_id,"
                "conversaciones_controles(manual_override)"
            ),
            "persona_id": f"eq.{persona_key}",
            "canal": "eq.webchat",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if not isinstance(row, dict):
            return None
        if not row.get("persona_id") and row.get("contacto_id"):
            row["persona_id"] = row.get("contacto_id")
        return row

    async def get_latest_whatsapp_conversation(self, *, persona_id: str) -> dict[str, Any] | None:
        persona_key = persona_id.strip()
        if not persona_key:
            return None
        params = {
            "select": "id,persona_id,contacto_id,canal,estado",
            "persona_id": f"eq.{persona_key}",
            "canal": "eq.whatsapp",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if not isinstance(row, dict):
            return None
        if not row.get("persona_id") and row.get("contacto_id"):
            row["persona_id"] = row.get("contacto_id")
        if str(row.get("estado") or "").lower() == "cerrada":
            return None
        return row

    async def upsert_conversation_insights(
        self,
        *,
        conversation_id: str,
        resumen: str | None = None,
        intencion: str | None = None,
        siguiente_accion: str | None = None,
        lead_score: int | None = None,
    ) -> None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        payload: dict[str, Any] = {"conversacion_id": conversation_key}
        if resumen is not None:
            payload["resumen"] = resumen
        if intencion is not None:
            payload["intencion"] = intencion
        if siguiente_accion is not None:
            payload["siguiente_accion"] = siguiente_accion
        if lead_score is not None:
            payload["lead_score"] = max(0, min(int(lead_score), 100))
        await self._request(
            "POST",
            "/rest/v1/conversaciones_insights",
            json=payload,
            params={"on_conflict": "conversacion_id"},
            prefer="resolution=merge-duplicates",
        )

    async def create_opportunity_scoring_event(
        self,
        *,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/oportunidad_scoring_eventos",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el evento de scoring")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear evento de scoring: {row!r}")
        return row

    async def list_opportunity_scoring_events(
        self,
        *,
        organizacion_id: UUID,
        created_from: datetime | None = None,
        limit: int = 1000,
        asignado_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        q: str | None = None,
        correo: str | None = None,
        etapa_ids: str | None = None,
        tiene_cita: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,oportunidad_id,score_total,grade,confidence,events,created_at",
            "order": "created_at.desc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if created_from:
            params["created_at"] = f"gte.{created_from.isoformat()}"
        opportunity_ids: list[str] | None = None
        should_filter_by_opportunity = any([asignado_id, canal, estado, q, correo, etapa_ids, tiene_cita])
        if should_filter_by_opportunity:
            assigned_rows, _ = await self.list_pipeline_opportunities(
                organizacion_id=organizacion_id,
                limit=5000,
                asignado_id=asignado_id,
                canal=canal,
                estado=estado,
                q=q,
                correo=correo,
                etapa_ids=etapa_ids,
                tiene_cita=tiene_cita,
                include_contact_rows=False,
                count_exact=False,
            )
            if not assigned_rows:
                logger.info(
                    "crm.scoring_events.filtered_empty",
                    extra={
                        "organizacion_id": str(organizacion_id),
                        "asignado_id": str(asignado_id) if asignado_id else None,
                        "canal": canal,
                        "estado": estado,
                        "q": q,
                        "created_from": created_from.isoformat() if created_from else None,
                    },
                )
                return []
            opportunity_ids = [str(row.get("id")) for row in assigned_rows if row.get("id")]
        if opportunity_ids:
            params["oportunidad_id"] = _postgrest_in_clause(opportunity_ids)
            logger.info(
                "crm.scoring_events.filtered",
                extra={
                    "organizacion_id": str(organizacion_id),
                "asignado_id": str(asignado_id) if asignado_id else None,
                "canal": canal,
                "estado": estado,
                "q": q,
                "correo": correo,
                "opportunities": len(opportunity_ids),
                "created_from": created_from.isoformat() if created_from else None,
            },
            )
        # Este histórico es telemetría interna del backend; se consulta con service role
        # para no depender de políticas RLS del JWT de usuario final.
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/oportunidad_scoring_eventos",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar eventos de scoring: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def list_scoring_profiles(
        self,
        *,
        organizacion_id: UUID,
        canal: Literal["whatsapp", "webchat"] | None = None,
        only_active: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "*",
            "order": "canal.asc,nombre.asc,updated_at.desc",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        if only_active:
            params["activo"] = "eq.true"
        resp = await self._request_service_role("GET", "/rest/v1/scoring_profiles", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar scoring_profiles: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def upsert_scoring_profile(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/scoring_profiles",
            json=payload,
            params={"on_conflict": "organizacion_id,canal,nombre"},
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(
                f"Respuesta inesperada al upsert scoring_profile: {data!r}"
            )
        return data[0]

    async def delete_scoring_profile(
        self,
        *,
        organizacion_id: UUID,
        profile_id: UUID,
    ) -> None:
        await self._request_service_role(
            "DELETE",
            "/rest/v1/scoring_profiles",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{profile_id}",
            },
        )

    async def get_close_lead_policy(
        self,
        *,
        organizacion_id: UUID,
        canal: str,
    ) -> dict[str, Any] | None:
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/close_lead_policies",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "canal": f"eq.{canal}",
                "select": "*",
                "limit": "1",
            },
        )
        data = resp.json()
        return data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else None

    async def upsert_close_lead_policy(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/close_lead_policies",
            json=payload,
            params={"on_conflict": "organizacion_id,canal"},
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"Respuesta inesperada al guardar close_lead_policy: {data!r}")
        return data[0]

    async def list_scoring_questions(
        self,
        *,
        organizacion_id: UUID,
        canal: Literal["whatsapp", "webchat"] | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "*",
            "order": "canal.asc,orden.asc,field_key.asc",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        if not include_inactive:
            params["activa"] = "eq.true"
        resp = await self._request_service_role("GET", "/rest/v1/scoring_questions", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar scoring_questions: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def upsert_scoring_question(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        question_id = payload.get("id")
        if question_id:
            update_payload = dict(payload)
            update_payload.pop("id", None)
            organizacion_id = str(payload.get("organizacion_id") or "").strip()
            params: dict[str, str] = {"id": f"eq.{question_id}"}
            if organizacion_id:
                params["organizacion_id"] = f"eq.{organizacion_id}"
            resp = await self._request_service_role(
                "PATCH",
                "/rest/v1/scoring_questions",
                params=params,
                json=update_payload,
                prefer="return=representation",
            )
        else:
            resp = await self._request_service_role(
                "POST",
                "/rest/v1/scoring_questions",
                json=payload,
                params={"on_conflict": "organizacion_id,canal,field_key"},
                prefer="resolution=merge-duplicates,return=representation",
            )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(
                f"Respuesta inesperada al upsert scoring_question: {data!r}"
            )
        return data[0]

    async def delete_scoring_question(
        self,
        *,
        organizacion_id: UUID,
        question_id: UUID,
    ) -> None:
        await self._request_service_role(
            "DELETE",
            "/rest/v1/scoring_questions",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{question_id}",
            },
        )

    async def list_scoring_question_reprompts(
        self,
        *,
        organizacion_id: UUID,
        canal: Literal["whatsapp", "webchat"] | None = None,
        question_id: UUID | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "*",
            "order": "question_id.asc,intento.asc",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        if question_id:
            params["question_id"] = f"eq.{question_id}"
        if not include_inactive:
            params["activa"] = "eq.true"
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/scoring_question_reprompts",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar scoring_question_reprompts: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def upsert_scoring_question_reprompt(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/scoring_question_reprompts",
            json=payload,
            params={"on_conflict": "question_id,intento"},
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(
                f"Respuesta inesperada al upsert scoring_question_reprompt: {data!r}"
            )
        return data[0]

    async def delete_scoring_question_reprompt(
        self,
        *,
        organizacion_id: UUID,
        reprompt_id: UUID,
    ) -> None:
        await self._request_service_role(
            "DELETE",
            "/rest/v1/scoring_question_reprompts",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{reprompt_id}",
            },
        )

    async def list_scoring_rules(
        self,
        *,
        organizacion_id: UUID,
        canal: Literal["whatsapp", "webchat"] | None = None,
        question_id: UUID | None = None,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "*",
            "order": "question_id.asc,priority.asc,id.asc",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        if question_id:
            params["question_id"] = f"eq.{question_id}"
        if not include_inactive:
            params["activa"] = "eq.true"
        resp = await self._request_service_role("GET", "/rest/v1/scoring_rules", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar scoring_rules: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def upsert_scoring_rule(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        rule_id = payload.get("id")
        if rule_id:
            resp = await self._request_service_role(
                "PATCH",
                "/rest/v1/scoring_rules",
                params={"id": f"eq.{rule_id}"},
                json=payload,
                prefer="return=representation",
            )
        else:
            resp = await self._request_service_role(
                "POST",
                "/rest/v1/scoring_rules",
                json=payload,
                prefer="return=representation",
            )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"Respuesta inesperada al upsert scoring_rule: {data!r}")
        return data[0]

    async def delete_scoring_rule(
        self,
        *,
        organizacion_id: UUID,
        rule_id: UUID,
    ) -> None:
        await self._request_service_role(
            "DELETE",
            "/rest/v1/scoring_rules",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{rule_id}",
            },
        )

    async def get_manual_override(self, *, conversation_id: str) -> bool:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return False
        params = {
            "select": "manual_override",
            "conversacion_id": f"eq.{conversation_key}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones_controles", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return False
        return bool(row.get("manual_override"))

    async def fetch_manual_overrides(self, *, conversation_ids: Sequence[str]) -> dict[str, bool]:
        cleaned = [cid.strip() for cid in conversation_ids if cid and cid.strip()]
        if not cleaned:
            return {}
        params = {
            "select": "conversacion_id,manual_override",
            "conversacion_id": f"in.({','.join(cleaned)})",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones_controles", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return {}
        result: dict[str, bool] = {}
        for row in data:
            if isinstance(row, dict):
                cid = row.get("conversacion_id")
                if cid:
                    result[str(cid)] = bool(row.get("manual_override"))
        return result

    async def set_manual_override(self, *, conversation_id: str, manual: bool) -> None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        update_params = {"conversacion_id": f"eq.{conversation_key}"}
        update_payload = {"manual_override": manual}
        resp = await self._request(
            "PATCH",
            "/rest/v1/conversaciones_controles",
            params=update_params,
            json=update_payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            return
        insert_payload = {"conversacion_id": conversation_key, "manual_override": manual}
        try:
            await self._request(
                "POST",
                "/rest/v1/conversaciones_controles",
                json=insert_payload,
                prefer="return=representation",
            )
        except CRMRepositoryError as exc:
            message = str(exc).lower()
            if "duplicate key" not in message and "duplic" not in message:
                raise
            await self._request(
                "PATCH",
                "/rest/v1/conversaciones_controles",
                params=update_params,
                json=update_payload,
                prefer="return=representation",
            )

    async def fetch_recent_messages(
        self, *, conversation_id: str, limit: int = 8
    ) -> list[dict[str, Any]]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return []
        params = {
            "select": "id,direccion,texto,creado_en,datos,"
            "attachments:adjuntos(id,url,mime,tamano_bytes,size_bytes,proveedor_id,nombre,path)",
            "conversacion_id": f"eq.{conversation_key}",
            # Obtener realmente los mensajes más recientes y devolverlos
            # en orden cronológico para consumo aguas arriba.
            "order": "creado_en.desc",
            "limit": str(max(1, limit)),
        }
        resp = await self._request("GET", "/rest/v1/mensajes", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return []
        rows = [row for row in data if isinstance(row, dict)]
        rows.reverse()
        return rows  # type: ignore[return-value]

    async def create_conversation_summary(
        self,
        *,
        conversacion_id: str,
        resumen: str,
        persona_id: str | None = None,
        contacto_id: str | None = None,
        organizacion_id: str | None = None,
        tipo: str | None = None,
        metadatos: dict[str, Any] | None = None,
        creado_por_usuario_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "conversacion_id": conversacion_id,
            "resumen": resumen,
            "metadatos": metadatos or {},
        }
        resolved_persona_id = persona_id or contacto_id
        if resolved_persona_id:
            payload["persona_id"] = resolved_persona_id
        if organizacion_id:
            payload["organizacion_id"] = organizacion_id
        if tipo:
            payload["tipo"] = tipo
        if creado_por_usuario_id:
            payload["creado_por_usuario_id"] = creado_por_usuario_id
        resp = await self._request(
            "POST",
            "/rest/v1/conversation_summaries",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el resumen de conversación creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear resumen: {row!r}")
        return row

    async def record_delivery_event(
        self,
        *,
        provider: str,
        message_sid: str,
        event: str,
        raw_payload: dict[str, Any] | None = None,
        error_code: str | None = None,
        provider_timestamp: str | None = None,
        organizacion_id: UUID | str | None = None,
    ) -> dict[str, Any]:
        message_id: str | None = None
        message_org_id: str | None = None
        row: dict[str, Any] | None = None
        if message_sid:
            provider_column = "proveedor_mensaje_id" if provider == "meta" else "twilio_message_sid"
            params = {
                "select": "id,organizacion_id",
                provider_column: f"eq.{message_sid}",
                "limit": "1",
            }
            resp = await self._request("GET", "/rest/v1/mensajes", params=params)
            data = resp.json() or []
            if isinstance(data, list) and data:
                row = data[0]
            elif isinstance(data, dict):
                row = data
            else:
                row = None
        if isinstance(row, dict):
            message_id = row.get("id")
            message_org_id = row.get("organizacion_id")
        payload: dict[str, Any] = {
            "proveedor": provider,
            "evento": event,
            "codigo_error": error_code,
            "payload_crudo": raw_payload or {},
            "proveedor_mensaje_id": message_sid,
        }
        effective_org_id = message_org_id or (str(organizacion_id) if organizacion_id else None)
        if effective_org_id:
            payload["organizacion_id"] = effective_org_id
        if message_id:
            payload["mensaje_id"] = message_id
        else:
            logger.info(
                "crm.delivery_event_pending_message",
                extra={"message_sid": message_sid, "event": event, "provider": provider},
            )
        normalized_timestamp = _normalize_provider_timestamp(provider_timestamp)
        if normalized_timestamp:
            payload["proveedor_ts"] = normalized_timestamp.isoformat()

        resp = await self._request(
            "POST",
            "/rest/v1/eventos_entrega",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            raise CRMRepositoryError(
                f"Respuesta inesperada al registrar evento de entrega: {data!r}"
            )
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al registrar evento: {row!r}")
        return row

    async def list_messages_by_provider_id(
        self,
        *,
        provider_message_id: str,
        organizacion_id: UUID | str,
        provider: str = "meta",
    ) -> list[dict[str, Any]]:
        provider_column = "proveedor_mensaje_id" if provider == "meta" else "twilio_message_sid"
        response = await self._request(
            "GET",
            "/rest/v1/mensajes",
            params={
                "select": "id,organizacion_id",
                provider_column: f"eq.{provider_message_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )
        data = response.json() or []
        if isinstance(data, dict):
            data = [data]
        return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []

    async def link_pending_delivery_events(
        self,
        *,
        provider: str,
        message_sid: str,
        message_id: str,
        organizacion_id: UUID | str,
    ) -> list[dict[str, Any]]:
        """Liga callbacks recibidos antes de que existiera el mensaje local."""
        params = {
            "select": "id,evento,payload_crudo,codigo_error,proveedor_ts,proveedor_mensaje_id",
            "proveedor": f"eq.{provider}",
            "proveedor_mensaje_id": f"eq.{message_sid}",
            "mensaje_id": "is.null",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        response = await self._request(
            "PATCH",
            "/rest/v1/eventos_entrega",
            params=params,
            json={"mensaje_id": message_id},
            prefer="return=representation",
        )
        data = response.json() or []
        if isinstance(data, dict):
            data = [data]
        return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []

    async def fetch_latest_conversation_summary(
        self,
        *,
        conversation_id: str,
        tipo: str | None = None,
    ) -> dict[str, Any] | None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return None
        params: dict[str, Any] = {
            "conversacion_id": f"eq.{conversation_key}",
            "order": "creado_en.desc",
            "limit": "1",
        }
        if tipo:
            params["tipo"] = f"eq.{tipo}"
        resp = await self._request("GET", "/rest/v1/conversation_summaries", params=params)
        data = resp.json() or []
        row: dict[str, Any] | None
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_latest_whatsapp_conversation_legacy(self, *, contact_id: str) -> dict[str, Any] | None:
        return await self.get_latest_whatsapp_conversation(persona_id=contact_id)

    async def upload_webchat_object(
        self,
        *,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        return await self.upload_storage_object(
            bucket="webchat",
            object_key=object_key,
            content=content,
            content_type=content_type,
        )

    async def upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        return await self._upload_storage_object(
            bucket=bucket,
            object_key=object_key,
            content=content,
            content_type=content_type,
        )

    async def record_webchat_session_closure(self, *, session_id: str) -> None:
        session_key = session_id.strip()
        if not session_key:
            raise CRMRepositoryError("session_id_required")
        await self._request(
            "POST",
            "/rest/v1/webchat_session_closures",
            json={"session_id": session_key},
            prefer="resolution=merge-duplicates",
        )

    async def get_latest_webchat_session_closure(self, *, session_id: str) -> dict[str, Any] | None:
        session_key = session_id.strip()
        if not session_key:
            return None
        params = {
            "select": "session_id,closed_at,contacto_id,organizacion_id",
            "session_id": f"eq.{session_key}",
            "order": "closed_at.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/webchat_session_closures", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        return row if isinstance(row, dict) else None

    async def register_billing_message(
        self,
        *,
        organizacion_id: str,
        mensaje_id: str,
        proveedor: str,
        canal: str,
        proveedor_mensaje_id: str,
        estado_proveedor: str = "accepted",
        categoria_meta: str = "unknown",
        categoria_meta_configurada: str | None = None,
        tipo_pricing_meta: str | None = None,
        billable_meta: bool | None = None,
        es_plantilla: bool = False,
        nombre_plantilla: str | None = None,
        idioma_plantilla: str | None = None,
        fuente_registro: str = "backend_message_registration",
        fecha_evento: datetime | None = None,
    ) -> dict[str, Any]:
        """Registra consumo mediante el RPC transaccional e idempotente."""
        payload: dict[str, Any] = {
            "p_organizacion_id": organizacion_id,
            "p_mensaje_id": mensaje_id,
            "p_proveedor": proveedor,
            "p_canal": canal,
            "p_proveedor_mensaje_id": proveedor_mensaje_id,
            "p_estado_proveedor": estado_proveedor,
            "p_categoria_meta": categoria_meta,
            "p_categoria_meta_configurada": categoria_meta_configurada,
            "p_tipo_pricing_meta": tipo_pricing_meta,
            "p_billable_meta": billable_meta,
            "p_es_plantilla": es_plantilla,
            "p_nombre_plantilla": nombre_plantilla,
            "p_idioma_plantilla": idioma_plantilla,
            "p_fuente_registro": fuente_registro,
        }
        if fecha_evento is not None:
            payload["p_fecha_evento"] = fecha_evento.isoformat()
        data = await self._rpc("registrar_cobro_mensaje", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"Respuesta inesperada registrar_cobro_mensaje: {data!r}")
        return data[0]

    async def update_billing_meta_message(
        self,
        *,
        proveedor: str,
        proveedor_mensaje_id: str,
        estado_proveedor: str | None = None,
        categoria_meta: str | None = None,
        tipo_pricing_meta: str | None = None,
        billable_meta: bool | None = None,
    ) -> dict[str, Any] | None:
        """Actualiza categoría/precio Meta cuando llega el status del proveedor."""
        data = await self._rpc(
            "actualizar_cobro_meta_mensaje",
            {
                "p_proveedor": proveedor,
                "p_proveedor_mensaje_id": proveedor_mensaje_id,
                "p_estado_proveedor": estado_proveedor,
                "p_categoria_meta": categoria_meta,
                "p_tipo_pricing_meta": tipo_pricing_meta,
                "p_billable_meta": billable_meta,
            },
        )
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        return None

    async def list_billing_periods(
        self,
        *,
        organizacion_id: UUID | None = None,
        fecha_inicio: datetime | None = None,
        fecha_fin: datetime | None = None,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "select": (
                "id,organizacion_id,fecha_inicio,fecha_fin,estado,mensajes_cantidad,"
                "mensajes_entrantes_cantidad,mensajes_salientes_cantidad,"
                "hilos_con_actividad_cantidad,conversiones_cantidad,subtotal_mensajes,"
                "costo_meta_periodo,costo_mensaje_periodo,ajustes_total,total,moneda,"
                "cerrado_en,creado_en"
            ),
            "order": "fecha_inicio.desc",
            "limit": str(max(1, min(limit, 120))),
        }
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if fecha_inicio:
            params["fecha_fin"] = f"gte.{fecha_inicio.isoformat()}"
        if fecha_fin:
            params["fecha_inicio"] = f"lt.{fecha_fin.isoformat()}"
        resp = await self._request("GET", "/rest/v1/cobro_periodos", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar periodos de cobro: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_billing_messages(
        self,
        *,
        organizacion_id: UUID | None = None,
        periodo_id: UUID | None = None,
        categoria_meta: str | None = None,
        direccion: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        safe_page = max(1, page)
        safe_size = max(1, min(page_size, 100))
        params: dict[str, Any] = {
            "select": (
                "id,organizacion_id,periodo_id,mensaje_id,conversacion_id,proveedor,canal,"
                "proveedor_mensaje_id,direccion,tipo_contenido,origen_mensaje,es_plantilla,"
                "nombre_plantilla,idioma_plantilla,categoria_meta,tipo_pricing_meta,"
                "billable_meta,estado_proveedor,aceptado_proveedor_en,facturable,"
                "motivo_no_facturable,origen_tarifa_app,cargo_app_unitario,cargo_app_importe,"
                "costo_meta_aplica,costo_meta_unitario,costo_meta_importe,costo_total_mensaje,"
                "tipo_cargo,fuente_registro,conciliacion_estado,creado_en"
            ),
            "order": "creado_en.desc",
            "limit": str(safe_size),
            "offset": str((safe_page - 1) * safe_size),
        }
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if periodo_id:
            params["periodo_id"] = f"eq.{periodo_id}"
        if categoria_meta:
            params["categoria_meta"] = f"eq.{categoria_meta}"
        if direccion:
            params["direccion"] = f"eq.{direccion}"
        resp = await self._request(
            "GET",
            "/rest/v1/cobro_mensajes",
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar mensajes de cobro: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return [row for row in data if isinstance(row, dict)], total

    async def list_billing_app_rates(
        self, *, organizacion_id: UUID | None = None, active_only: bool = False
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "select": (
                "id,alcance,organizacion_id,precio_mensaje,moneda,vigente_desde,vigente_hasta,"
                "activo,motivo,origen_registro,creado_en,actualizado_en"
            ),
            "order": "vigente_desde.desc",
        }
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if active_only:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/cobro_tarifas_app", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar tarifas de aplicación: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_billing_effective_app_rate(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        select = (
            "id,alcance,organizacion_id,precio_mensaje,moneda,vigente_desde,vigente_hasta,"
            "activo,motivo,origen_registro,creado_en,actualizado_en"
        )
        common = {
            "select": select,
            "activo": "eq.true",
            "order": "vigente_desde.desc",
            "limit": "1",
        }
        tenant_params = {**common, "alcance": "eq.tenant", "organizacion_id": f"eq.{organizacion_id}"}
        global_params = {**common, "alcance": "eq.global"}
        tenant_resp = await self._request("GET", "/rest/v1/cobro_tarifas_app", params=tenant_params)
        tenant_rows = tenant_resp.json() or []
        if isinstance(tenant_rows, list) and tenant_rows:
            return tenant_rows[0] if isinstance(tenant_rows[0], dict) else None
        global_resp = await self._request("GET", "/rest/v1/cobro_tarifas_app", params=global_params)
        global_rows = global_resp.json() or []
        if isinstance(global_rows, list) and global_rows:
            return global_rows[0] if isinstance(global_rows[0], dict) else None
        return None

    async def create_billing_app_rate(
        self,
        *,
        alcance: str,
        organizacion_id: UUID | None,
        precio_mensaje: Decimal,
        motivo: str | None = None,
        vigente_desde: datetime | None = None,
    ) -> dict[str, Any]:
        payload = {
            "p_alcance": alcance,
            "p_organizacion_id": str(organizacion_id) if organizacion_id else None,
            "p_precio_mensaje": str(precio_mensaje),
            "p_motivo": motivo,
            "p_vigente_desde": vigente_desde.isoformat() if vigente_desde else None,
        }
        data = await self._rpc("crear_cobro_tarifa_app", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"Respuesta inesperada al crear tarifa de cobro: {data!r}")
        return data[0]

    async def create_billing_provider_rate(
        self,
        *,
        proveedor: str,
        canal: str,
        pais_codigo_iso2: str,
        categoria_meta: str,
        iniciador_hilo: str,
        precio_unitario: Decimal,
        motivo: str | None = None,
        vigente_desde: datetime | None = None,
    ) -> dict[str, Any]:
        data = await self._rpc(
            "crear_cobro_tarifa_proveedor",
            {
                "p_proveedor": proveedor,
                "p_canal": canal,
                "p_pais_codigo_iso2": pais_codigo_iso2,
                "p_categoria_meta": categoria_meta,
                "p_iniciador_hilo": iniciador_hilo,
                "p_precio_unitario": str(precio_unitario),
                "p_motivo": motivo,
                "p_vigente_desde": vigente_desde.isoformat() if vigente_desde else None,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"Respuesta inesperada al crear tarifa de proveedor: {data!r}")
        return data[0]

    async def record_webchat_visit(
        self,
        *,
        session_id: str,
        payload: dict[str, Any],
    ) -> None:
        session_key = session_id.strip()
        if not session_key:
            raise CRMRepositoryError("session_id_required")
        body = {"p_session_id": session_key, **payload}
        await self._rpc("record_webchat_visitante", body)

    async def record_web_session(self, *, session_id: str, payload: dict[str, Any]) -> str | None:
        session_key = session_id.strip()
        if not session_key:
            raise CRMRepositoryError("session_id_required")
        body = {"p_session_id": session_key, **payload}
        result = await self._rpc("record_web_session", body)
        if isinstance(result, str):
            return result
        if isinstance(result, list) and result:
            first = result[0]
            if isinstance(first, str):
                return first
            if isinstance(first, dict):
                for key in ("record_web_session", "id"):
                    value = first.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
        if isinstance(result, dict):
            for key in ("record_web_session", "id"):
                value = result.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return None

    async def create_web_session_event(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/web_session_events",
            json=[payload],
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"web_session_event_create_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"web_session_event_create_invalid_row:{row!r}")
        return row

    async def list_web_session_events(
        self,
        *,
        usuario_token: str,
        event_type: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 5000,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "creado_en,event_type,cta_id,hero_variant,location_href,referrer,metadata",
            "order": "creado_en.desc",
            "limit": str(max(1, min(limit, 10000))),
        }
        if event_type:
            literal = _postgrest_eq_literal(event_type.strip())
            params["event_type"] = f"eq.{literal}"
        clauses: list[str] = []
        if date_from:
            clauses.append(f"creado_en.gte.{date_from}T00:00:00Z")
        if date_to:
            clauses.append(f"creado_en.lt.{date_to}T00:00:00Z")
        if clauses:
            params["and"] = f"({','.join(clauses)})"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/web_session_events",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"web_session_events_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def upsert_web_booking_session(
        self,
        *,
        booking_session_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        session_key = booking_session_id.strip()
        if not session_key:
            raise CRMRepositoryError("booking_session_id_required")
        body = {"booking_session_id": session_key, **payload}
        persona_id = body.get("persona_id")
        contacto_id = body.get("contacto_id")
        if persona_id and not body.get("contacto_id"):
            body["contacto_id"] = persona_id
        if contacto_id and not body.get("persona_id"):
            body["persona_id"] = contacto_id
        resp = await self._request(
            "POST",
            "/rest/v1/web_booking_sessions",
            params={"on_conflict": "organizacion_id,booking_session_id"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        return row if isinstance(row, dict) else None

    async def update_conversation(
        self, *, conversation_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        params = {"id": f"eq.{conversation_key}", "limit": "1"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/conversaciones",
            params=params,
            json=patch,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_not_found")
        return row

    async def assign_conversation_if_unassigned(
        self,
        *,
        organizacion_id: UUID,
        conversation_id: str,
        usuario_id: UUID,
    ) -> dict[str, Any] | None:
        """Asigna la conversación sin sobrescribir una asignación existente."""

        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        resp = await self._request(
            "PATCH",
            "/rest/v1/conversaciones",
            params={
                "id": f"eq.{conversation_key}",
                "organizacion_id": f"eq.{organizacion_id}",
                "asignado_a_usuario_id": "is.null",
                "limit": "1",
            },
            json={"asignado_a_usuario_id": str(usuario_id)},
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        return None

    async def get_latest_conversation_id_by_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
    ) -> str | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_id": f"eq.{contacto_id}",
            "order": "iniciada_en.desc",
            "limit": "1",
            "select": "id",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        convo_id = row.get("id")
        return str(convo_id) if convo_id else None

    async def _get_default_stage_id(self, *, organizacion_id: UUID) -> UUID:
        cache_key = str(organizacion_id)
        cached = self._stage_cache.get(cache_key)
        if cached:
            return cached
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
            "select": "id",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("No se encontraron etapas de pipeline para la organización")
        stage_id = _coerce_uuid(data[0].get("id"), field="etapa_id")
        self._stage_cache[cache_key] = stage_id
        return stage_id

    async def get_default_stage_id(self, *, organizacion_id: UUID) -> UUID:
        """Expone el ID de la primera etapa del pipeline para una organización."""

        return await self._get_default_stage_id(organizacion_id=organizacion_id)

    async def _get_first_stage_row(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
            "select": "id,codigo,nombre,orden,categoria,metadata",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def list_webchat_session_closures_since(
        self,
        *,
        closed_since: datetime,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        params = {
            "select": "session_id,closed_at,contacto_id,organizacion_id",
            "closed_at": f"gte.{closed_since.astimezone(timezone.utc).isoformat()}",
            "order": "closed_at.asc",
            "limit": str(max(1, limit)),
        }
        resp = await self._request("GET", "/rest/v1/webchat_session_closures", params=params)
        data = resp.json() or []
        return data if isinstance(data, list) else []

    async def find_open_opportunity_by_conversation(
        self,
        *,
        organizacion_id: UUID,
        conversation_id: str,
    ) -> dict[str, Any] | None:
        conversation_key = (conversation_id or "").strip()
        if not conversation_key:
            return None
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>conversation_id": f"eq.{conversation_key}",
            "estado": "eq.abierta",
            "order": "creado_en.desc",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                await self._attach_contact_rows(
                    organizacion_id=organizacion_id,
                    rows=[row],
                    source_fields=("contacto_principal_id",),
                )
                return row
            return None
        return None

    async def ensure_prospeccion_stage(self, *, organizacion_id: UUID) -> dict[str, Any]:
        """Garantiza que exista la etapa 'Prospección · Primer contacto'."""

        target_code = "prospeccion_primer_contacto"
        existing = await self.get_stage_by_code(
            organizacion_id=organizacion_id,
            codigo=target_code,
        )
        if existing:
            return existing

        base_stage = await self._get_first_stage_row(organizacion_id=organizacion_id)
        base_metadata = _ensure_metadata(base_stage.get("metadata")) if base_stage else {}
        base_metadatos = _ensure_metadata(base_metadata.get("metadatos"))

        tablero_id = (
            (base_stage.get("tablero_id") if base_stage else None)
            or base_metadata.get("tablero_id")
            or base_metadata.get("tableroId")
        )
        tablero_nombre = (
            (base_stage.get("tablero_nombre") if base_stage else None)
            or base_metadata.get("tablero_nombre")
        )
        tablero_slug = (
            (base_stage.get("tablero_slug") if base_stage else None)
            or base_metadata.get("tablero_slug")
        )

        stage_metadatos = dict(base_metadatos)
        stage_metadatos.update(
            {
                "color": stage_metadatos.get("color") or "indigo",
                "etiqueta": stage_metadatos.get("etiqueta") or "Prospección",
                "descripcion": stage_metadatos.get("descripcion")
                or "Primer contacto originado desde búsquedas y campañas de prospección.",
                "is_counter_only": False,
            }
        )

        stage_metadata: dict[str, Any] = {
            "seed": "prospeccion_stage",
            "metadatos": stage_metadatos,
        }
        if tablero_id:
            stage_metadata["tablero_id"] = tablero_id
        if tablero_nombre:
            stage_metadata["tablero_nombre"] = tablero_nombre
        if tablero_slug:
            stage_metadata["tablero_slug"] = tablero_slug

        base_order_value = base_stage.get("orden") if base_stage else None
        try:
            base_order = int(base_order_value) if base_order_value is not None else 10
        except (TypeError, ValueError):
            base_order = 10
        stage_order = max(1, base_order - 5)

        body = {
            "organizacion_id": str(organizacion_id),
            "codigo": target_code,
            "nombre": "Prospección · Primer contacto",
            "orden": stage_order,
            "probabilidad": "5.00",
            "categoria": "abierta",
            "metadata": stage_metadata,
        }
        resp = await self._request(
            "POST",
            "/rest/v1/etapas_pipeline",
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospeccion_stage_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError("prospeccion_stage_invalid_response")

        stage_payload = {
            "id": _coerce_uuid(row.get("id"), field="etapa_id"),
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "orden": row.get("orden"),
            "categoria": row.get("categoria"),
            "metadata": row.get("metadata"),
        }
        cache_key = (str(organizacion_id), target_code)
        self._stage_code_cache[cache_key] = stage_payload
        self._stage_cache.pop(str(organizacion_id), None)
        return stage_payload

    async def get_stage_by_code(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
    ) -> dict[str, Any] | None:
        normalized = (codigo or "").strip().lower()
        if not normalized:
            return None
        cache_key = (str(organizacion_id), normalized)
        cached = self._stage_code_cache.get(cache_key)
        if cached:
            return cached
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,codigo,nombre,orden,categoria,metadata",
            "order": "orden.asc",
            "limit": "1",
            "codigo": f"eq.{normalized}",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        stage_id = _coerce_uuid(row.get("id"), field="etapa_id")
        stage_payload = {
            "id": stage_id,
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "orden": row.get("orden"),
            "categoria": row.get("categoria"),
            "metadata": row.get("metadata"),
        }
        self._stage_code_cache[cache_key] = stage_payload
        return stage_payload

    async def get_active_stage_by_legacy_code(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
    ) -> dict[str, Any] | None:
        """Resolve a legacy stage code to the stage attached to an active board."""

        normalized = (codigo or "").strip().lower()
        if not normalized:
            return None
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,codigo,nombre,orden,categoria,metadata",
            "metadata->>legacy_codigo": f"eq.{normalized}",
            "metadata->>tablero_id": "not.is.null",
            "order": "orden.asc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return {
            "id": _coerce_uuid(row.get("id"), field="etapa_id"),
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "orden": row.get("orden"),
            "categoria": row.get("categoria"),
            "metadata": row.get("metadata"),
        }

    async def create_lead_event(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/lead_eventos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el evento del lead")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear evento de lead: {row!r}")
        return row

    async def list_notes(
        self,
        *,
        organizacion_id: UUID,
        relacion_tipo: str | None = None,
        relacion_id: UUID | None = None,
        actividad_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if relacion_tipo:
            params["relacion_tipo"] = f"eq.{relacion_tipo}"
        if relacion_id:
            params["relacion_id"] = f"eq.{relacion_id}"
        if actividad_id:
            params["actividad_id"] = f"eq.{actividad_id}"
        params["select"] = (
            "*,"
            "creado_por_usuario:usuarios!notas_creado_por_usuario_org_fkey("
            "id,nombre_completo,correo,telefono_e164"
            ")"
        )
        resp = await self._request("GET", "/rest/v1/notas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar notas: {data!r}")
        return data

    async def list_notes_for_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> list[dict[str, Any]]:
        opportunity = await self.get_opportunity(
            organizacion_id=organizacion_id,
            opportunity_id=oportunidad_id,
        )
        if not opportunity:
            return []
        relation_filters = [("oportunidad", oportunidad_id)]
        persona_id = opportunity.get("persona_id") or opportunity.get("contacto_id")
        if persona_id:
            relation_filters.append(("persona", UUID(str(persona_id))))

        rows_by_id: dict[str, dict[str, Any]] = {}
        for relacion_tipo, relacion_id in relation_filters:
            rows = await self.list_notes(
                organizacion_id=organizacion_id,
                relacion_tipo=relacion_tipo,
                relacion_id=relacion_id,
            )
            for row in rows:
                row_id = str(row.get("id") or "")
                if row_id:
                    rows_by_id[row_id] = row
        return sorted(
            rows_by_id.values(),
            key=lambda row: str(row.get("creado_en") or ""),
            reverse=True,
        )

    async def get_note(
        self,
        *,
        organizacion_id: UUID,
        note_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{note_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/notas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener nota: {row!r}")
        return row

    async def list_note_attachments(
        self,
        *,
        organizacion_id: UUID,
        nota_id: UUID,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "nota_id": f"eq.{nota_id}",
            "order": "subido_en.desc",
            "limit": str(max(1, min(limit, 50))),
        }
        resp = await self._request("GET", "/rest/v1/nota_adjuntos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar adjuntos de nota: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_note_attachment(
        self,
        *,
        organizacion_id: UUID,
        nota_id: UUID,
        attachment_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "nota_id": f"eq.{nota_id}",
            "id": f"eq.{attachment_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/nota_adjuntos", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener adjunto de nota: {row!r}")
        return row

    async def create_note_attachment(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/nota_adjuntos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el adjunto de nota creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear adjunto de nota: {row!r}")
        return row

    async def delete_note_attachment(
        self,
        *,
        organizacion_id: UUID,
        nota_id: UUID,
        attachment_id: UUID,
    ) -> None:
        await self._request_service_role(
            "DELETE",
            "/rest/v1/nota_adjuntos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "nota_id": f"eq.{nota_id}",
                "id": f"eq.{attachment_id}",
            },
        )

    async def create_note(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/notas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la nota creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear nota: {row!r}")
        return row

    async def list_audit_logs(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": "200",
        }
        resp = await self._request("GET", "/rest/v1/audit_logs", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar audit logs: {data!r}")
        return data

    async def list_audit_logs_by_tabla(
        self,
        *,
        organizacion_id: UUID,
        tabla: str,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(limit, 500))
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "tabla": f"eq.{tabla}",
            "order": "creado_en.desc",
            "limit": str(safe_limit),
        }
        resp = await self._request("GET", "/rest/v1/audit_logs", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar audit logs por tabla: {data!r}")
        return data

    async def create_audit_log(
        self,
        *,
        organizacion_id: UUID,
        accion: str,
        tabla: str,
        cambios: dict[str, Any],
        usuario_id: UUID | None = None,
        registro_id: UUID | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "accion": accion,
            "tabla": tabla,
            "cambios": cambios or {},
        }
        if usuario_id:
            body["usuario_id"] = str(usuario_id)
        if registro_id:
            body["registro_id"] = str(registro_id)
        if ip:
            body["ip"] = ip
        if user_agent:
            body["user_agent"] = user_agent
        resp = await self._request(
            "POST",
            "/rest/v1/audit_logs",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el audit_log creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear audit_log: {row!r}")
        return row

    async def append_stage_history(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/oportunidad_etapas_historial",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el historial de etapa")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al registrar historial: {row!r}")
        return row

    async def get_account(
        self,
        *,
        organizacion_id: UUID,
        account_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{account_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener cuenta: {row!r}")
        return row

    async def list_pipeline_opportunities(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 500,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        tablero_id: UUID | None = None,
        asignado_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        q: str | None = None,
        correo: str | None = None,
        etapa_ids: str | None = None,
        tiene_cita: str | None = None,
        include_contact_rows: bool = True,
        count_exact: bool = True,
    ) -> tuple[list[dict[str, Any]], int]:
        """Listar oportunidades de pipeline con filtros opcionales y conteo total."""

        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "select": self._PIPELINE_SELECT,
        }
        and_filters: list[str] = []
        if created_from:
            and_filters.append(f"creado_en.gte.{created_from.isoformat()}")
        if created_to:
            and_filters.append(f"creado_en.lte.{created_to.isoformat()}")
        if tablero_id:
            tablero_filter = str(tablero_id)
            and_filters.append(
                "or("
                f"metadata->>tablero_id.eq.{tablero_filter},"
                f"etapa.metadata->>tablero_id.eq.{tablero_filter}"
                ")"
            )
            params["order"] = "etapa.orden.asc,creado_en.desc"
        if asignado_id:
            params["asignado_a_usuario_id"] = f"eq.{asignado_id}"
        if etapa_ids:
            raw_values = [value.strip() for value in str(etapa_ids).split(",") if value.strip()]
            if raw_values:
                params["etapa_id"] = _postgrest_in_clause(raw_values)
        if estado:
            params["estado"] = f"eq.{_postgrest_eq_literal(estado)}"
        if canal:
            params["canal"] = f"eq.{_postgrest_eq_literal(canal.strip().lower())}"
        if and_filters:
            params["and"] = "(" + ",".join(and_filters) + ")"
        prefer = "count=exact" if count_exact else None
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
            prefer=prefer,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar pipeline de oportunidades: {data!r}"
            )
        results = [row for row in data if isinstance(row, dict)]
        if q and q.strip():
            results = [row for row in results if _matches_search_query(row, q)]
        if correo and correo.strip():
            results = [row for row in results if _matches_email_filter(row, correo)]
        if results and include_contact_rows:
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=results,
                source_fields=("contacto_principal_id",),
            )
        if tiene_cita:
            target = str(tiene_cita).strip().lower()
            if target in ("con_cita", "sin_cita"):
                def _has_booking(metadata: dict[str, Any]) -> bool:
                    if not metadata:
                        return False

                    direct_keys = (
                        "booking_id",
                        "calendar_booking_id",
                        "demo_booking_id",
                        "demo_scheduled_at",
                        "appointment_scheduled",
                        "appointment_confirmed",
                        "appointment_attended",
                    )
                    for key in direct_keys:
                        value = metadata.get(key)
                        if isinstance(value, bool) and value:
                            return True
                        if isinstance(value, str) and value.strip():
                            return True

                    def _has_stage_prep_booking(value: Any) -> bool:
                        if isinstance(value, dict):
                            for inner_key, inner_value in value.items():
                                normalized_key = str(inner_key).strip().lower()
                                if normalized_key in {
                                    "booking_id",
                                    "calendar_booking_id",
                                    "demo_booking_id",
                                    "demo_scheduled_at",
                                    "appointment_scheduled",
                                    "appointment_confirmed",
                                    "appointment_attended",
                                }:
                                    if isinstance(inner_value, bool) and inner_value:
                                        return True
                                    if isinstance(inner_value, str) and inner_value.strip():
                                        return True
                                    if isinstance(inner_value, (int, float)) and inner_value:
                                        return True
                                if _has_stage_prep_booking(inner_value):
                                    return True
                        elif isinstance(value, list):
                            return any(_has_stage_prep_booking(inner) for inner in value)
                        return False

                    stage_prep = metadata.get("stage_prep")
                    if isinstance(stage_prep, dict):
                        return _has_stage_prep_booking(stage_prep)
                    return False

                filtered: list[dict[str, Any]] = []
                for row in results:
                    meta = _ensure_metadata(row.get("metadata"))
                    booking = _has_booking(meta)
                    if target == "con_cita" and booking:
                        filtered.append(row)
                    elif target == "sin_cita" and not booking:
                        filtered.append(row)
                results = filtered
        total = len(results)
        return results, total

    async def list_supervised_sales_reps(
        self,
        *,
        organizacion_id: UUID,
        supervisor_id: UUID,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "supervisor_id": f"eq.{supervisor_id}",
            "select": "empleado_id",
            "limit": str(limit),
        }
        resp = await self._request("GET", "/rest/v1/empleados_supervisores", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar supervisados: {data!r}"
            )
        empleado_ids: list[str] = []
        for row in data:
            if isinstance(row, dict):
                empleado_id = row.get("empleado_id")
                if isinstance(empleado_id, str) and empleado_id.strip():
                    empleado_ids.append(empleado_id.strip())
        if not empleado_ids:
            return []
        id_list = ",".join(empleado_ids)
        empleados_params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "usuario_id": f"in.({id_list})",
            "es_vendedor": "is.true",
            "select": "usuario:usuarios!empleados_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "limit": str(limit),
        }
        empleados_resp = await self._request("GET", "/rest/v1/empleados", params=empleados_params)
        empleados_data = empleados_resp.json() or []
        if not isinstance(empleados_data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar empleados supervisados: {empleados_data!r}"
            )
        results: list[dict[str, Any]] = []
        for item in empleados_data:
            if not isinstance(item, dict):
                continue
            usuario = item.get("usuario")
            if isinstance(usuario, dict):
                user_id = usuario.get("id")
                if not isinstance(user_id, str):
                    continue
                entry: dict[str, Any] = {
                    "id": user_id,
                    "nombre_completo": usuario.get("nombre_completo"),
                    "correo": usuario.get("correo"),
                    "telefono_e164": usuario.get("telefono_e164"),
                }
                results.append(entry)
        return results

    async def list_supervisor_user_ids_for_sales_rep(
        self,
        *,
        organizacion_id: UUID,
        empleado_usuario_id: UUID,
        limit: int = 50,
    ) -> list[UUID]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "empleado_id": f"eq.{empleado_usuario_id}",
            "select": "supervisor_id",
            "limit": str(limit),
        }
        resp = await self._request("GET", "/rest/v1/empleados_supervisores", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return []

        supervisors: list[UUID] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            raw_id = row.get("supervisor_id")
            try:
                supervisors.append(UUID(str(raw_id)))
            except (TypeError, ValueError):
                continue

        unique: list[UUID] = []
        seen: set[UUID] = set()
        for supervisor_id in supervisors:
            if supervisor_id in seen:
                continue
            seen.add(supervisor_id)
            unique.append(supervisor_id)
        return unique

    async def list_sales_reps(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "es_vendedor": "is.true",
            "select": "usuario:usuarios!empleados_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "limit": str(limit),
        }
        resp = await self._request("GET", "/rest/v1/empleados", params=params)
        empleados_data = resp.json() or []
        if not isinstance(empleados_data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar vendedores: {empleados_data!r}"
            )
        results: list[dict[str, Any]] = []
        for item in empleados_data:
            if not isinstance(item, dict):
                continue
            usuario = item.get("usuario")
            if isinstance(usuario, dict):
                user_id = usuario.get("id")
                if not isinstance(user_id, str):
                    continue
                entry: dict[str, Any] = {
                    "id": user_id,
                    "nombre_completo": usuario.get("nombre_completo"),
                    "correo": usuario.get("correo"),
                    "telefono_e164": usuario.get("telefono_e164"),
                }
                results.append(entry)
        return results

    async def get_employee_vendor(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "usuario_id": f"eq.{usuario_id}",
            "select": "usuario_id,es_vendedor",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/empleados", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def is_in_current_user_scope(self, *, usuario_id: UUID) -> bool:
        payload = {"p_uid": str(usuario_id)}
        data = await self._rpc("is_in_current_user_scope", payload)
        if isinstance(data, bool):
            return data
        if isinstance(data, dict):
            value = data.get("is_in_current_user_scope")
            if isinstance(value, bool):
                return value
        return False

    async def search_contacts(
        self,
        *,
        organizacion_id: UUID,
        query: str,
        limit: int = 8,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if not query or not query.strip():
            return []

        permission_context = await self.get_permission_context()
        current_user_id = _safe_uuid(permission_context.get("usuario_id"))
        if current_user_id is None:
            return []

        is_admin = _coerce_bool(permission_context.get("es_admin")) is True
        is_owner = _coerce_bool(permission_context.get("es_owner")) is True
        can_view_unowned_contacts = is_admin or is_owner
        can_view_unowned_accounts = is_admin or is_owner
        if not can_view_unowned_contacts:
            can_view_unowned_contacts = await self.current_user_has_perm(codigo="contacts.view_sensitive_unowned")
        if not can_view_unowned_accounts:
            can_view_unowned_accounts = await self.current_user_has_perm(codigo="accounts.view_sensitive_unowned")

        def _is_visible_result(row: Mapping[str, Any]) -> bool:
            owner_user_id = _safe_uuid(row.get("propietario_usuario_id"))
            account_owner_user_id = _safe_uuid(row.get("cuenta_propietario_usuario_id"))
            if owner_user_id is not None and owner_user_id == current_user_id:
                return True
            if account_owner_user_id is not None and account_owner_user_id == current_user_id:
                return True
            return can_view_unowned_contacts or can_view_unowned_accounts

        rows: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        search_clause = _build_search_clause(
            [
                "codigo_contacto",
                "nombre",
                "nombre_completo",
                "apellido_paterno",
                "apellido_materno",
                "correo_principal",
                "correo_institucional",
                "correo_personal_3",
                "telefono_principal_e164",
                "telefono_movil_1_e164",
                "telefono_movil_2_e164",
                "telefono_secundario_e164",
                "telefono_empresa_1_e164",
                "telefono_empresa_2_e164",
                "notas",
                "area",
                "puesto",
                "rol_decision",
                "company_name",
            ],
            query,
        )

        fetch_limit = str(min(max(limit * 5, 25), 100))
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": PERSONA_SELECT_FIELDS,
            "limit": fetch_limit,
            "offset": str(offset),
        }
        if search_clause:
            if search_clause.startswith("and("):
                params["and"] = f"({search_clause[4:-1]})"
            else:
                params["or"] = f"({search_clause[3:-1]})"
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar contactos: {data!r}")
        for row in data:
            if not isinstance(row, dict):
                continue
            try:
                contact_row = await self._persona_to_contact_row(
                    persona=row,
                    organizacion_id=organizacion_id,
                )
            except CRMRepositoryError:
                continue
            contact_id = str(contact_row.get("id") or "")
            if not contact_id or contact_id in seen_ids:
                continue
            if not _is_visible_result(contact_row):
                continue
            seen_ids.add(contact_id)
            rows.append(contact_row)

        account_search_clause = _build_search_clause(
            [
                "nombre",
                "alias",
                "razon_social",
                "rfc",
                "codigo_cuenta",
                "necesidad_proposito",
                "correo_principal",
                "correo_secundario",
                "telefono_principal_e164",
                "telefono_secundario_e164",
            ],
            query,
        )
        account_params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id",
            "limit": "100",
        }
        if account_search_clause:
            if account_search_clause.startswith("and("):
                account_params["and"] = f"({account_search_clause[4:-1]})"
            else:
                account_params["or"] = f"({account_search_clause[3:-1]})"
        account_resp = await self._request("GET", "/rest/v1/cuentas", params=account_params)
        account_data = account_resp.json()
        account_ids = [
            str(row.get("id"))
            for row in account_data
            if isinstance(row, dict) and row.get("id")
        ] if isinstance(account_data, list) else []
        if account_ids:
            relations_resp = await self._request(
                "GET",
                "/rest/v1/cuenta_personas",
                params={
                    "organizacion_id": f"eq.{organizacion_id}",
                    "cuenta_id": f"in.({','.join(account_ids)})",
                    "select": "persona_id",
                    "limit": "1000",
                },
            )
            relations_data = relations_resp.json()
            persona_ids: list[str] = []
            if isinstance(relations_data, list):
                for relation in relations_data:
                    if not isinstance(relation, dict):
                        continue
                    persona_id = relation.get("persona_id")
                    if persona_id:
                        persona_ids.append(str(persona_id))
            unique_persona_ids = [pid for pid in dict.fromkeys(persona_ids) if pid and pid not in seen_ids]
            if unique_persona_ids:
                extra_rows = await self.get_contacts_by_ids(
                    organizacion_id=organizacion_id,
                    contacto_ids=[UUID(pid) for pid in unique_persona_ids],
                )
                for contact_row in extra_rows:
                    contact_id = str(contact_row.get("id") or "")
                    if not contact_id or contact_id in seen_ids:
                        continue
                    if not _is_visible_result(contact_row):
                        continue
                    seen_ids.add(contact_id)
                    rows.append(contact_row)
        return rows[:limit]

    async def search_personas(
        self,
        *,
        organizacion_id: UUID,
        query: str,
        limit: int = 8,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self.search_contacts(
            organizacion_id=organizacion_id,
            query=query,
            limit=limit,
            offset=offset,
        )

    async def list_geo_countries(self) -> list[dict[str, Any]]:
        params = {
            "select": "codigo_iso2,nombre,nombre_largo",
            "activo": "eq.true",
            "order": "nombre.asc",
            "limit": "300",
        }
        resp = await self._request("GET", "/rest/v1/geo_paises", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar países: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_geo_mex_states(self) -> list[dict[str, Any]]:
        params = {
            "select": "clave_entidad,nombre",
            "activo": "eq.true",
            "pais_codigo": "eq.MX",
            "order": "nombre.asc",
            "limit": "64",
        }
        resp = await self._request("GET", "/rest/v1/geo_estados_mexico", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar estados MX: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_geo_mex_municipalities(self, *, state_code: str) -> list[dict[str, Any]]:
        normalized_state = "".join(ch for ch in str(state_code or "") if ch.isdigit()).zfill(2)
        if len(normalized_state) != 2:
            return []
        params = {
            "select": "clave_entidad,clave_municipio,cvegeo,nombre",
            "activo": "eq.true",
            "clave_entidad": f"eq.{normalized_state}",
            "order": "nombre.asc",
            "limit": "3000",
        }
        resp = await self._request("GET", "/rest/v1/geo_municipios_mexico", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar municipios MX: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def _get_primary_account_for_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
    ) -> dict[str, Any] | None:
        relation_params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "persona_id": f"eq.{persona_id}",
            "order": "es_contacto_principal.desc,es_representante_legal.desc,activo.desc,creado_en.asc",
            "limit": "1",
            "select": "cuenta_id,rol_en_cuenta,es_contacto_principal,es_contacto_facturacion,es_representante_legal,activo,metadata",
        }
        relation_resp = await self._request("GET", "/rest/v1/cuenta_personas", params=relation_params)
        relation_data = relation_resp.json()
        if not isinstance(relation_data, list) or not relation_data:
            return None
        relation = relation_data[0]
        if not isinstance(relation, dict):
            return None
        account_id = relation.get("cuenta_id")
        try:
            account_uuid = _coerce_uuid(str(account_id), field="cuenta_id")
        except Exception:
            return None
        account_resp = await self._request(
            "GET",
            "/rest/v1/cuentas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{account_uuid}",
                "limit": "1",
                "select": (
                "id,nombre,alias,tipo,codigo_cuenta,razon_social,rfc,regimen_capital,uso_cfdi,metodo_pago,forma_pago,"
                "email_facturacion,tipo_industria,tamano,sitio_web,website,telefono,correo,"
                    "tipo_vialidad,nombre_vialidad,numero_exterior,letra_exterior,edificio,edificio_piso,"
                    "numero_interior,letra_interior,tipo_asentamiento,tipo_centro_comercial,"
                    "corredor_industrial,numero_local,tipo_establecimiento,latitud,longitud,pais,clave_entidad,"
                    "entidad,clave_municipio,municipio,clave_localidad,localidad,codigo_postal,notas,necesidad_proposito,"
                    "fecha_incorporacion,propietario_usuario_id"
                ),
            },
        )
        account_data = account_resp.json()
        if not isinstance(account_data, list) or not account_data:
            return None
        account = account_data[0]
        if not isinstance(account, dict):
            return None
        return {**relation, **{"account": account}}

    async def _attach_contact_rows(
        self,
        *,
        organizacion_id: UUID,
        rows: list[dict[str, Any]],
        source_fields: tuple[str, ...],
        target_field: str = "contacto",
    ) -> list[dict[str, Any]]:
        contact_ids: list[UUID] = []
        seen: set[str] = set()
        for row in rows:
            for source_field in source_fields:
                raw_contact_id = row.get(source_field)
                if raw_contact_id is None:
                    continue
                try:
                    contact_uuid = _coerce_uuid(str(raw_contact_id), field=source_field)
                except Exception:
                    continue
                contact_key = str(contact_uuid)
                if contact_key in seen:
                    continue
                seen.add(contact_key)
                contact_ids.append(contact_uuid)
                break
        if not contact_ids:
            return rows
        contact_rows = await self.get_contacts_by_ids(
            organizacion_id=organizacion_id,
            contacto_ids=contact_ids,
        )
        contact_map = {
            str(row.get("id")): row
            for row in contact_rows
            if isinstance(row, dict) and row.get("id")
        }
        for row in rows:
            for source_field in source_fields:
                raw_contact_id = row.get(source_field)
                if raw_contact_id is None:
                    continue
                contact = contact_map.get(str(raw_contact_id))
                if contact:
                    row[target_field] = contact
                    break
        return rows

    async def _attach_cliente_vendor_rows(
        self,
        *,
        organizacion_id: UUID,
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        def _maybe_uuid(value: Any) -> UUID | None:
            if value is None:
                return None
            text = str(value).strip()
            if not text:
                return None
            try:
                return _coerce_uuid(text, field="cliente_vendor_id")
            except Exception:
                return None

        contact_ids: list[UUID] = []
        account_ids: list[UUID] = []
        opportunity_ids: list[UUID] = []
        seen_contacts: set[str] = set()
        seen_accounts: set[str] = set()
        seen_opportunities: set[str] = set()
        for row in rows:
            contact_id = _maybe_uuid(row.get("contacto_id"))
            if contact_id is not None:
                contact_key = str(contact_id)
                if contact_key not in seen_contacts:
                    seen_contacts.add(contact_key)
                    contact_ids.append(contact_id)
            account_id = _maybe_uuid(row.get("cuenta_id"))
            if account_id is not None:
                account_key = str(account_id)
                if account_key not in seen_accounts:
                    seen_accounts.add(account_key)
                    account_ids.append(account_id)
            opportunity_id = _maybe_uuid(row.get("oportunidad_id"))
            if opportunity_id is not None:
                opportunity_key = str(opportunity_id)
                if opportunity_key not in seen_opportunities:
                    seen_opportunities.add(opportunity_key)
                    opportunity_ids.append(opportunity_id)

        if not contact_ids and not account_ids and not opportunity_ids:
            return rows

        contact_rows: list[dict[str, Any]] = []
        account_rows: list[dict[str, Any]] = []
        opportunity_rows: list[dict[str, Any]] = []

        if contact_ids:
            contact_rows = await self.get_contacts_by_ids(
                organizacion_id=organizacion_id,
                contacto_ids=contact_ids,
            )
        if account_ids:
            account_params = {
                "organizacion_id": f"eq.{organizacion_id}",
                "id": _postgrest_in_clause([str(account_id) for account_id in account_ids]),
                "select": "id,propietario_usuario_id",
                "limit": str(min(len(account_ids), 500)),
            }
            account_resp = await self._request("GET", "/rest/v1/cuentas", params=account_params)
            account_data = account_resp.json()
            if isinstance(account_data, list):
                account_rows = [row for row in account_data if isinstance(row, dict)]
        if opportunity_ids:
            opportunity_params = {
                "organizacion_id": f"eq.{organizacion_id}",
                "id": _postgrest_in_clause([str(opportunity_id) for opportunity_id in opportunity_ids]),
                "select": "id,asignado_a_usuario_id,propietario_usuario_id",
                "limit": str(min(len(opportunity_ids), 500)),
            }
            opportunity_resp = await self._request("GET", "/rest/v1/oportunidades", params=opportunity_params)
            opportunity_data = opportunity_resp.json()
            if isinstance(opportunity_data, list):
                opportunity_rows = [row for row in opportunity_data if isinstance(row, dict)]

        contact_owner_by_contact_id = {
            str(row.get("id")): _maybe_uuid(row.get("propietario_usuario_id"))
            for row in contact_rows
            if row.get("id")
        }
        account_owner_by_account_id = {
            str(row.get("id")): _maybe_uuid(row.get("propietario_usuario_id"))
            for row in account_rows
            if row.get("id")
        }
        opportunity_owner_by_id: dict[str, tuple[UUID | None, str | None]] = {}
        for row in opportunity_rows:
            opportunity_id = str(row.get("id") or "").strip()
            if not opportunity_id:
                continue
            assigned_id = _maybe_uuid(row.get("asignado_a_usuario_id"))
            owner_id = assigned_id or _maybe_uuid(row.get("propietario_usuario_id"))
            owner_source = "oportunidad_asignado" if assigned_id else "oportunidad_propietario"
            opportunity_owner_by_id[opportunity_id] = (owner_id, owner_source if owner_id else None)

        owner_ids: list[UUID] = []
        seen_owner_ids: set[str] = set()
        vendor_source_by_row_id: dict[str, str | None] = {}
        vendor_id_by_row_id: dict[str, UUID | None] = {}

        for row in rows:
            row_id = str(row.get("id") or "").strip()
            if not row_id:
                continue
            contact_id = str(row.get("contacto_id") or "").strip()
            account_id = str(row.get("cuenta_id") or "").strip()
            opportunity_id = str(row.get("oportunidad_id") or "").strip()

            vendor_id: UUID | None = None
            vendor_source: str | None = None

            contact_owner_id = contact_owner_by_contact_id.get(contact_id) if contact_id else None
            if contact_owner_id is not None:
                vendor_id = contact_owner_id
                vendor_source = "contacto"
            else:
                account_owner_id = account_owner_by_account_id.get(account_id) if account_id else None
                if account_owner_id is not None:
                    vendor_id = account_owner_id
                    vendor_source = "cuenta"
                else:
                    opportunity_vendor = opportunity_owner_by_id.get(opportunity_id) if opportunity_id else None
                    if opportunity_vendor is not None:
                        vendor_id, vendor_source = opportunity_vendor

            vendor_id_by_row_id[row_id] = vendor_id
            vendor_source_by_row_id[row_id] = vendor_source
            if vendor_id is not None:
                vendor_key = str(vendor_id)
                if vendor_key not in seen_owner_ids:
                    seen_owner_ids.add(vendor_key)
                    owner_ids.append(vendor_id)

        vendor_name_by_id: dict[str, str] = {}
        vendor_email_by_id: dict[str, str | None] = {}
        vendor_phone_by_id: dict[str, str | None] = {}
        if owner_ids:
            try:
                user_rows = await self.list_users_by_ids(
                    organizacion_id=organizacion_id,
                    user_ids=owner_ids,
                )
            except CRMRepositoryError:
                user_rows = []
            for user_row in user_rows:
                if not isinstance(user_row, dict):
                    continue
                user_id = str(user_row.get("id") or "").strip()
                if not user_id:
                    continue
                vendor_name_by_id[user_id] = str(user_row.get("nombre_completo") or user_row.get("correo") or "").strip()
                vendor_email_by_id[user_id] = str(user_row.get("correo") or "").strip() or None
                vendor_phone_by_id[user_id] = str(user_row.get("telefono_e164") or "").strip() or None

        for row in rows:
            row_id = str(row.get("id") or "").strip()
            vendor_id = vendor_id_by_row_id.get(row_id)
            vendor_source = vendor_source_by_row_id.get(row_id)
            row["vendedor_usuario_id"] = vendor_id
            row["vendedor_nombre"] = vendor_name_by_id.get(str(vendor_id)) if vendor_id is not None else None
            row["vendedor_correo"] = vendor_email_by_id.get(str(vendor_id)) if vendor_id is not None else None
            row["vendedor_telefono_e164"] = vendor_phone_by_id.get(str(vendor_id)) if vendor_id is not None else None
            row["vendedor_fuente"] = vendor_source
        return rows

    async def _persona_to_contact_row(
        self,
        *,
        persona: dict[str, Any],
        organizacion_id: UUID,
    ) -> dict[str, Any]:
        relation_bundle = await self._get_primary_account_for_persona(
            organizacion_id=organizacion_id,
            persona_id=_coerce_uuid(str(persona.get("id")), field="persona_id"),
        )
        account = relation_bundle.get("account") if isinstance(relation_bundle, dict) else None
        relation = relation_bundle if isinstance(relation_bundle, dict) else None

        metadata = persona.get("metadata") if isinstance(persona.get("metadata"), dict) else {}
        relation_metadata = _ensure_metadata(relation.get("metadata")) if isinstance(relation, dict) else {}
        persona_datos = _ensure_metadata(persona.get("persona_datos"))
        contacto_datos = _ensure_metadata(persona.get("contacto_datos"))
        if persona_datos:
            metadata = _deep_merge_metadata(metadata, persona_datos)
        if contacto_datos:
            metadata = _deep_merge_metadata(metadata, contacto_datos)

        account_name = None
        if isinstance(account, dict):
            account_name = (
                account.get("nombre")
                or account.get("razon_social")
                or account.get("alias")
                or account.get("codigo_cuenta")
            )
        persona_company_name = _clean_text(persona.get("company_name"))
        persona_need = (
            _clean_text(persona.get("necesidad_proposito"))
            or _clean_text(persona_datos.get("necesidad_proposito"))
            or _clean_text(metadata.get("necesidad_proposito"))
        )

        contact_name_parts = [
            _clean_text(persona.get("nombre")),
            _clean_text(persona.get("apellido_paterno")),
            _clean_text(persona.get("apellido_materno")),
        ]
        contact_name_parts = [part for part in contact_name_parts if part]
        contact_name_from_parts = " ".join(contact_name_parts).strip() if contact_name_parts else None
        raw_full_name = _clean_text(persona.get("nombre_completo")) or None
        preferred_name = raw_full_name or contact_name_from_parts or _clean_text(persona.get("nombre")) or None
        account_type = _clean_text(account.get("tipo")) if isinstance(account, dict) else None
        persona_fisica_moral = (
            "fisica"
            if account_type == "persona_fisica_actividad_empresarial"
            else ("moral" if account_type else None)
        )

        return {
            "id": persona.get("id"),
            "organizacion_id": persona.get("organizacion_id"),
            "cuenta_id": account.get("id") if isinstance(account, dict) else persona.get("cuenta_id"),
            "nombre_completo": preferred_name or raw_full_name,
            "nombre": preferred_name or raw_full_name,
            "correo_principal": persona.get("correo_principal"),
            "correo_secundario": persona.get("correo_secundario"),
            "correo_institucional": persona.get("correo_institucional"),
            "correo_personal_3": persona.get("correo_personal_3"),
            "codigo_contacto": persona.get("codigo_contacto") or _ensure_metadata(persona.get("metadata")).get("legacy_contacto_codigo"),
            "correo": persona.get("correo_principal") or persona.get("correo_secundario") or persona.get("correo_institucional") or persona.get("correo"),
            "email": persona.get("correo_principal") or persona.get("correo_secundario") or persona.get("correo_institucional") or persona.get("correo"),
            "telefono_principal_e164": persona.get("telefono_principal_e164"),
            "telefono_principal_tipo_linea": persona.get("telefono_principal_tipo_linea"),
            "telefono_principal_extension": persona.get("telefono_principal_extension"),
            "telefono_movil_1_e164": persona.get("telefono_movil_1_e164") or persona.get("telefono_principal_e164"),
            "telefono_movil_1_tipo_linea": persona.get("telefono_movil_1_tipo_linea") or persona.get("telefono_principal_tipo_linea"),
            "telefono_movil_2_e164": persona.get("telefono_movil_2_e164"),
            "telefono_movil_2_tipo_linea": persona.get("telefono_movil_2_tipo_linea"),
            "telefono_movil_2_extension": persona.get("telefono_movil_2_extension"),
            "telefono_secundario_e164": persona.get("telefono_secundario_e164") or persona.get("telefono_movil_2_e164"),
            "telefono_secundario_tipo_linea": persona.get("telefono_secundario_tipo_linea") or persona.get("telefono_movil_2_tipo_linea"),
            "telefono_secundario_extension": persona.get("telefono_secundario_extension") or persona.get("telefono_movil_2_extension"),
            "telefono_empresa_1_e164": persona.get("telefono_empresa_1_e164"),
            "telefono_empresa_1_extension": persona.get("telefono_empresa_1_extension"),
            "telefono_empresa_2_e164": persona.get("telefono_empresa_2_e164"),
            "telefono_empresa_2_extension": persona.get("telefono_empresa_2_extension"),
            "telefono_e164": persona.get("telefono_movil_1_e164") or persona.get("telefono_principal_e164"),
            "telefono": persona.get("telefono_movil_1_e164") or persona.get("telefono_principal_e164"),
            "phone_e164": persona.get("telefono_movil_1_e164") or persona.get("telefono_principal_e164"),
            "codigo_postal": persona.get("codigo_postal"),
            "clave_entidad": persona.get("clave_entidad"),
            "entidad": persona.get("entidad"),
            "clave_municipio": persona.get("clave_municipio"),
            "municipio": persona.get("municipio"),
            "clave_localidad": persona.get("clave_localidad"),
            "localidad": persona.get("localidad"),
            "pais": persona.get("pais"),
            "latitud": persona.get("latitud"),
            "longitud": persona.get("longitud"),
            "company_name": persona_company_name or account_name,
            "notes": persona.get("notas"),
            "necesidad_proposito": persona_need
            or (account.get("necesidad_proposito") if isinstance(account, dict) else None),
            "contacto_datos": {},
            "persona_datos": metadata,
            "contacto_datos": dict(metadata),
            "codigo_cuenta": account.get("codigo_cuenta") if isinstance(account, dict) else None,
            "cuenta_propietario_usuario_id": account.get("propietario_usuario_id") if isinstance(account, dict) else None,
            "persona_fisica_moral": persona_fisica_moral,
            "nombre_nombres": persona.get("nombre"),
            "apellido_paterno": persona.get("apellido_paterno"),
            "apellido_materno": persona.get("apellido_materno"),
            "cuenta_correo_principal": account.get("correo_principal") if isinstance(account, dict) else None,
            "cuenta_correo_secundario": account.get("correo_secundario") if isinstance(account, dict) else None,
            "cuenta_telefono_principal_e164": account.get("telefono_principal_e164") if isinstance(account, dict) else None,
            "cuenta_telefono_principal_tipo_linea": account.get("telefono_principal_tipo_linea") if isinstance(account, dict) else None,
            "cuenta_telefono_principal_extension": account.get("telefono_principal_extension") if isinstance(account, dict) else None,
            "cuenta_telefono_secundario_e164": account.get("telefono_secundario_e164") if isinstance(account, dict) else None,
            "cuenta_telefono_secundario_tipo_linea": account.get("telefono_secundario_tipo_linea") if isinstance(account, dict) else None,
            "cuenta_telefono_secundario_extension": account.get("telefono_secundario_extension") if isinstance(account, dict) else None,
            "razon_social": account.get("razon_social") if isinstance(account, dict) else None,
            "rfc": account.get("rfc") if isinstance(account, dict) else None,
            "regimen_capital": account.get("regimen_capital") if isinstance(account, dict) else None,
            "uso_cfdi": account.get("uso_cfdi") if isinstance(account, dict) else None,
            "metodo_pago": account.get("metodo_pago") if isinstance(account, dict) else None,
            "forma_pago": account.get("forma_pago") if isinstance(account, dict) else None,
            "email_facturacion": account.get("email_facturacion") if isinstance(account, dict) else None,
            "tipo_industria": account.get("tipo_industria") if isinstance(account, dict) else None,
            "tamano": account.get("tamano") if isinstance(account, dict) else None,
            "cuenta_tipo": account_type,
            "contexto_modo": relation_metadata.get("contexto_modo") if isinstance(relation_metadata, dict) else None,
            "puesto": persona.get("puesto"),
            "rol_en_cuenta": relation.get("rol_en_cuenta") if isinstance(relation, dict) else None,
            "es_contacto_principal": relation.get("es_contacto_principal") if isinstance(relation, dict) else None,
            "es_contacto_facturacion": relation.get("es_contacto_facturacion") if isinstance(relation, dict) else None,
            "es_representante_legal": relation.get("es_representante_legal") if isinstance(relation, dict) else None,
            "relacion_activa": relation.get("activo") if isinstance(relation, dict) else None,
            "area": persona.get("area"),
            "rol_decision": persona.get("rol_decision"),
            "codigo_postal": (
                account.get("codigo_postal")
                if isinstance(account, dict) and account.get("codigo_postal")
                else persona.get("codigo_postal")
            ),
            "entidad": (
                account.get("entidad")
                if isinstance(account, dict) and account.get("entidad")
                else persona.get("entidad")
            ),
            "municipio": (
                account.get("municipio")
                if isinstance(account, dict) and account.get("municipio")
                else persona.get("municipio")
            ),
            "pais": (
                account.get("pais")
                if isinstance(account, dict) and account.get("pais")
                else persona.get("pais")
            ),
            "website": (account.get("website") if isinstance(account, dict) else None) or (account.get("sitio_web") if isinstance(account, dict) else None),
            "tipo_establecimiento": account.get("tipo_establecimiento") if isinstance(account, dict) else None,
            "tipo_vialidad": account.get("tipo_vialidad") if isinstance(account, dict) else None,
            "nombre_vialidad": account.get("nombre_vialidad") if isinstance(account, dict) else None,
            "numero_exterior": account.get("numero_exterior") if isinstance(account, dict) else None,
            "letra_exterior": account.get("letra_exterior") if isinstance(account, dict) else None,
            "edificio": account.get("edificio") if isinstance(account, dict) else None,
            "edificio_piso": account.get("edificio_piso") if isinstance(account, dict) else None,
            "numero_interior": account.get("numero_interior") if isinstance(account, dict) else None,
            "letra_interior": account.get("letra_interior") if isinstance(account, dict) else None,
            "tipo_asentamiento": account.get("tipo_asentamiento") if isinstance(account, dict) else None,
            "colonia": account.get("colonia") if isinstance(account, dict) else None,
            "tipo_centro_comercial": account.get("tipo_centro_comercial") if isinstance(account, dict) else None,
            "corredor_industrial": account.get("corredor_industrial") if isinstance(account, dict) else None,
            "numero_local": account.get("numero_local") if isinstance(account, dict) else None,
            "estado": persona.get("estado"),
            "origen": persona.get("origen"),
            "propietario_usuario_id": persona.get("propietario_usuario_id"),
            "archived_at": persona.get("archived_at"),
            "merged_into_persona_id": persona.get("merged_into_persona_id"),
            "merge_metadata": persona.get("merge_metadata") if isinstance(persona.get("merge_metadata"), dict) else _ensure_metadata(persona.get("merge_metadata")),
            "metadata": metadata,
            "creado_en": persona.get("creado_en"),
            "actualizado_en": persona.get("actualizado_en"),
        }

    @staticmethod
    def _text_value(value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None

    @classmethod
    def _pick_text(cls, payload: dict[str, Any], *keys: str) -> str | None:
        for key in keys:
            if key not in payload:
                continue
            value = cls._text_value(payload.get(key))
            if value:
                return value
        return None

    @staticmethod
    def _split_full_name(value: Any) -> tuple[str | None, str | None, str | None]:
        text = CRMRepository._text_value(value)
        if not text:
            return None, None, None
        text = " ".join(text.replace(",", " ").split())
        if not text:
            return None, None, None
        parts = text.split()
        if len(parts) == 1:
            return parts[0], None, None
        if len(parts) == 2:
            return parts[0], parts[1], None
        if len(parts) == 3:
            return parts[0], parts[1], parts[2]
        return " ".join(parts[:-2]).strip() or parts[0], parts[-2], parts[-1]

    def _build_contact_write_parts(
        self,
        *,
        organizacion_id: UUID,
        contact_id: UUID,
        payload: dict[str, Any],
        existing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        if isinstance(existing, dict):
            merged.update(existing)
        merged.update(payload)

        full_name = self._pick_text(merged, "nombre_completo")
        if not full_name:
            full_name = " ".join(
                part
                for part in (
                    self._pick_text(merged, "nombre_nombres"),
                    self._pick_text(merged, "apellido_paterno"),
                    self._pick_text(merged, "apellido_materno"),
                )
                if part
            ).strip()

        apellido_paterno = self._pick_text(merged, "apellido_paterno")
        apellido_materno = self._pick_text(merged, "apellido_materno")
        given_name = self._pick_text(merged, "nombre", "nombre_nombres")
        if not given_name and full_name:
            split_name, split_apellido_paterno, split_apellido_materno = self._split_full_name(full_name)
            if split_name:
                given_name = split_name
            if not apellido_paterno:
                apellido_paterno = split_apellido_paterno
            if not apellido_materno:
                apellido_materno = split_apellido_materno
        full_name_was_explicitly_updated = (
            isinstance(payload, dict)
            and "nombre_completo" in payload
            and "nombre" not in payload
            and "nombre_nombres" not in payload
        )
        if full_name_was_explicitly_updated and full_name:
            split_name, split_apellido_paterno, split_apellido_materno = self._split_full_name(full_name)
            if split_name:
                given_name = split_name
            apellido_paterno = split_apellido_paterno
            apellido_materno = split_apellido_materno
        if given_name:
            suffix_candidates = []
            if apellido_paterno and apellido_materno:
                suffix_candidates.append(f" {apellido_paterno} {apellido_materno}")
            if apellido_paterno:
                suffix_candidates.append(f" {apellido_paterno}")
            for suffix in suffix_candidates:
                if suffix and given_name.casefold().endswith(suffix.casefold()):
                    given_name = given_name[: -len(suffix)].strip()
                    break
        if not given_name:
            given_name = full_name
        if not apellido_paterno and not apellido_materno and full_name and given_name:
            split_name, split_apellido_paterno, split_apellido_materno = self._split_full_name(full_name)
            if split_name and split_name.casefold() == given_name.casefold():
                apellido_paterno = split_apellido_paterno
                apellido_materno = split_apellido_materno

        explicit_full_name_update = (
            isinstance(payload, dict)
            and "nombre_completo" in payload
            and self._pick_text(payload, "nombre_completo")
            and not self._pick_text(payload, "apellido_paterno", "apellido_materno")
            and (
                "nombre" not in payload
                or self._pick_text(payload, "nombre") == self._pick_text(payload, "nombre_completo")
                or self._pick_text(payload, "nombre_nombres") == self._pick_text(payload, "nombre_completo")
            )
        )
        if explicit_full_name_update:
            given_name = full_name
            apellido_paterno = None
            apellido_materno = None

        account_type_raw = self._pick_text(merged, "tipo") or self._pick_text(merged, "tipo_cuenta")
        account_type = account_type_raw.casefold() if account_type_raw else ""
        contact_is_physical = account_type == "persona_fisica_actividad_empresarial"
        contact_is_moral = account_type == "empresa"

        company_name = self._pick_text(merged, "company_name")
        reason_name = self._pick_text(merged, "razon_social")
        account_name = company_name or reason_name or (full_name if contact_is_physical or contact_is_moral else None)
        necesidad_proposito = self._pick_text(merged, "necesidad_proposito")
        persona_datos = _ensure_metadata(merged.get("persona_datos"))
        metadata = _ensure_metadata(merged.get("metadata"))
        contacto_datos = _ensure_metadata(merged.get("contacto_datos"))
        if persona_datos:
            metadata = _deep_merge_metadata(metadata, persona_datos)
        if contacto_datos:
            metadata = _deep_merge_metadata(metadata, contacto_datos)

        persona_data_payload = dict(persona_datos)
        if company_name:
            persona_data_payload.setdefault("company_name", company_name)
            persona_data_payload.setdefault("empresa", company_name)
        if necesidad_proposito:
            persona_data_payload.setdefault("necesidad_proposito", necesidad_proposito)
        if company_name or necesidad_proposito:
            metadata = _deep_merge_metadata(metadata, persona_data_payload)

        has_account_fields = any(
            self._pick_text(merged, key)
            for key in (
                "company_name",
                "razon_social",
                "rfc",
                "regimen_capital",
                "cuenta_correo_principal",
                "cuenta_correo_secundario",
                "cuenta_telefono_principal_e164",
                "cuenta_telefono_principal_tipo_linea",
                "cuenta_telefono_principal_extension",
                "cuenta_telefono_secundario_e164",
                "cuenta_telefono_secundario_tipo_linea",
                "cuenta_telefono_secundario_extension",
                "uso_cfdi",
                "metodo_pago",
                "forma_pago",
                "email_facturacion",
                "tipo_industria",
                "tamano",
                "website",
                "sitio_web",
                "tipo_establecimiento",
            )
        )
        should_create_account = bool(
            contact_is_physical
            or contact_is_moral
            or account_name
            or has_account_fields
            or merged.get("cuenta_id")
        )

        now_value = datetime.now(timezone.utc)

        persona_body: dict[str, Any] = {
            "id": str(contact_id),
            "organizacion_id": str(organizacion_id),
            "codigo_contacto": self._pick_text(merged, "codigo_contacto"),
            "request_id": self._pick_text(merged, "request_id"),
            "nombre": given_name,
            "apellido_paterno": apellido_paterno,
            "apellido_materno": apellido_materno,
            "nombre_completo": full_name,
            "correo_principal": self._pick_text(merged, "correo_principal", "correo", "email"),
            "correo_secundario": self._pick_text(merged, "correo_secundario", "correo_institucional"),
            "correo_institucional": self._pick_text(merged, "correo_institucional"),
            "correo_personal_3": self._pick_text(merged, "correo_personal_3"),
            "telefono_principal_e164": self._pick_text(
                merged,
                "telefono_principal_e164",
                "telefono_movil_1_e164",
                "telefono_e164",
                "telefono",
            ),
            "telefono_principal_tipo_linea": self._pick_text(
                merged,
                "telefono_principal_tipo_linea",
                "telefono_movil_1_tipo_linea",
            ),
            "telefono_principal_extension": self._pick_text(merged, "telefono_principal_extension"),
            "telefono_movil_1_e164": self._pick_text(
                merged,
                "telefono_movil_1_e164",
                "telefono_principal_e164",
                "telefono_e164",
                "telefono",
            ),
            "telefono_movil_1_tipo_linea": self._pick_text(
                merged,
                "telefono_movil_1_tipo_linea",
                "telefono_principal_tipo_linea",
            ),
            "telefono_movil_2_e164": self._pick_text(merged, "telefono_movil_2_e164", "telefono_secundario_e164"),
            "telefono_movil_2_tipo_linea": self._pick_text(
                merged,
                "telefono_movil_2_tipo_linea",
                "telefono_secundario_tipo_linea",
            ),
            "telefono_movil_2_extension": self._pick_text(
                merged,
                "telefono_movil_2_extension",
                "telefono_secundario_extension",
            ),
            "telefono_secundario_e164": self._pick_text(merged, "telefono_secundario_e164", "telefono_movil_2_e164"),
            "telefono_secundario_tipo_linea": self._pick_text(
                merged,
                "telefono_secundario_tipo_linea",
                "telefono_movil_2_tipo_linea",
            ),
            "telefono_secundario_extension": self._pick_text(
                merged,
                "telefono_secundario_extension",
                "telefono_movil_2_extension",
            ),
            "correo": self._pick_text(merged, "correo_principal", "correo", "email"),
            "puesto": self._pick_text(merged, "puesto"),
            "area": self._pick_text(merged, "area"),
            "rol_decision": self._pick_text(merged, "rol_decision"),
            "estado": _normalize_persona_estado(self._pick_text(merged, "estado")),
            "origen": self._pick_text(merged, "origen"),
            "notas": self._pick_text(merged, "notas", "notes"),
            "company_name": company_name,
            "persona_datos": persona_data_payload or None,
            "metadata": metadata,
            "propietario_usuario_id": merged.get("propietario_usuario_id"),
            "creado_en": merged.get("creado_en") or merged.get("fecha_incorporacion") or now_value.isoformat(),
            "actualizado_en": merged.get("actualizado_en") or now_value.isoformat(),
        }

        address_payload: dict[str, Any] = {
            key: merged.get(key)
            for key in (
                "tipo_vialidad",
                "nombre_vialidad",
                "numero_exterior",
                "letra_exterior",
                "edificio",
                "edificio_piso",
                "numero_interior",
                "letra_interior",
                "tipo_asentamiento",
                "tipo_centro_comercial",
                "corredor_industrial",
                "numero_local",
                "codigo_postal",
                "clave_entidad",
                "entidad",
                "clave_municipio",
                "municipio",
                "clave_localidad",
                "localidad",
                "pais",
                "latitud",
                "longitud",
                "tipo_establecimiento",
            )
            if merged.get(key) not in (None, "")
        }

        account_body: dict[str, Any] | None = None
        if should_create_account:
            account_metadata = dict(metadata)
            segmento_value = self._pick_text(merged, "segmento")
            if segmento_value:
                account_metadata["segmento"] = segmento_value
            account_body = {
                "nombre": account_name or full_name or "Cuenta sin nombre",
                "alias": company_name or reason_name,
                "tipo": account_type if account_type in {"persona_fisica_actividad_empresarial", "empresa"} else "empresa",
                "industria": self._pick_text(merged, "tipo_industria"),
                "tamano": self._pick_text(merged, "tamano"),
                "sitio_web": self._pick_text(merged, "sitio_web", "website"),
                "correo_principal": self._pick_text(
                    merged,
                    "cuenta_correo_principal",
                    "correo_principal",
                    "correo",
                    "email",
                ),
                "correo_secundario": self._pick_text(merged, "cuenta_correo_secundario", "correo_secundario"),
                "telefono_principal_e164": self._pick_text(
                    merged,
                    "cuenta_telefono_principal_e164",
                    "telefono_principal_e164",
                    "telefono_principal",
                    "telefono_e164",
                    "telefono",
                ),
                "telefono_principal_tipo_linea": self._pick_text(
                    merged,
                    "cuenta_telefono_principal_tipo_linea",
                    "telefono_principal_tipo_linea",
                ),
                "telefono_principal_extension": self._pick_text(
                    merged,
                    "cuenta_telefono_principal_extension",
                    "telefono_principal_extension",
                ),
                "telefono_secundario_e164": self._pick_text(
                    merged,
                    "cuenta_telefono_secundario_e164",
                    "telefono_secundario_e164",
                ),
                "telefono_secundario_tipo_linea": self._pick_text(
                    merged,
                    "cuenta_telefono_secundario_tipo_linea",
                    "telefono_secundario_tipo_linea",
                ),
                "telefono_secundario_extension": self._pick_text(
                    merged,
                    "cuenta_telefono_secundario_extension",
                    "telefono_secundario_extension",
                ),
                "telefono": self._pick_text(
                    merged,
                    "cuenta_telefono_principal_e164",
                    "telefono_principal_e164",
                    "telefono_principal",
                    "telefono_e164",
                    "telefono",
                ),
                "correo": self._pick_text(
                    merged,
                    "cuenta_correo_principal",
                    "correo_principal",
                    "correo",
                    "email",
                ),
                "email": self._pick_text(
                    merged,
                    "cuenta_correo_principal",
                    "correo_principal",
                    "email",
                    "correo",
                ),
                "codigo_cuenta": self._pick_text(merged, "codigo_cuenta"),
                "razon_social": reason_name,
                "rfc": self._pick_text(merged, "rfc"),
                "regimen_capital": self._pick_text(merged, "regimen_capital"),
                "uso_cfdi": self._pick_text(merged, "uso_cfdi"),
                "metodo_pago": self._pick_text(merged, "metodo_pago"),
                "forma_pago": self._pick_text(merged, "forma_pago"),
                "email_facturacion": self._pick_text(merged, "email_facturacion"),
                "tipo_industria": self._pick_text(merged, "tipo_industria"),
                "notas": self._pick_text(merged, "notas", "notes"),
                "necesidad_proposito": self._pick_text(merged, "necesidad_proposito"),
                "direccion": address_payload or {},
                "tipo_vialidad": self._pick_text(merged, "tipo_vialidad"),
                "nombre_vialidad": self._pick_text(merged, "nombre_vialidad"),
                "numero_exterior": self._pick_text(merged, "numero_exterior"),
                "letra_exterior": self._pick_text(merged, "letra_exterior"),
                "edificio": self._pick_text(merged, "edificio"),
                "edificio_piso": self._pick_text(merged, "edificio_piso"),
                "numero_interior": self._pick_text(merged, "numero_interior"),
                "letra_interior": self._pick_text(merged, "letra_interior"),
                "tipo_asentamiento": self._pick_text(merged, "tipo_asentamiento"),
                "colonia": self._pick_text(merged, "colonia"),
                "tipo_centro_comercial": self._pick_text(merged, "tipo_centro_comercial"),
                "corredor_industrial": self._pick_text(merged, "corredor_industrial"),
                "numero_local": self._pick_text(merged, "numero_local"),
                "codigo_postal": self._pick_text(merged, "codigo_postal"),
                "clave_entidad": self._pick_text(merged, "clave_entidad"),
                "entidad": self._pick_text(merged, "entidad"),
                "clave_municipio": self._pick_text(merged, "clave_municipio"),
                "municipio": self._pick_text(merged, "municipio"),
                "clave_localidad": self._pick_text(merged, "clave_localidad"),
                "localidad": self._pick_text(merged, "localidad"),
                "pais": self._pick_text(merged, "pais"),
                "website": self._pick_text(merged, "website"),
                "tipo_establecimiento": self._pick_text(merged, "tipo_establecimiento"),
                "latitud": merged.get("latitud"),
                "longitud": merged.get("longitud"),
                "fecha_incorporacion": merged.get("fecha_incorporacion"),
                "propietario_usuario_id": merged.get("propietario_usuario_id"),
                "metadata": account_metadata,
            }
            account_body = {key: value for key, value in account_body.items() if value not in (None, "", {}, [])}

        return {
            "persona_body": persona_body,
            "account_body": account_body,
            "contact_is_physical": contact_is_physical,
            "should_create_account": should_create_account,
        }

    async def _get_persona_by_contact_id(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{contacto_id}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def get_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        use_service_role: bool = False,
    ) -> dict[str, Any] | None:
        request = self._request_service_role if use_service_role else self._request
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{persona_id}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        resp = await request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener persona: {row!r}")
        return await self._persona_to_contact_row(persona=row, organizacion_id=organizacion_id)

    async def get_contact(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID | None = None,
        contacto_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        resolved_persona_id = persona_id or contacto_id
        if not resolved_persona_id:
            return None
        return await self.get_persona(organizacion_id=organizacion_id, persona_id=resolved_persona_id)

    async def get_personas_by_ids(
        self,
        *,
        organizacion_id: UUID,
        persona_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        if not persona_ids:
            return []
        unique_ids: list[str] = []
        seen: set[str] = set()
        for persona_id in persona_ids:
            key = str(persona_id).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            unique_ids.append(key)
        if not unique_ids:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"in.({','.join(unique_ids)})",
            "select": PERSONA_SELECT_FIELDS,
            "limit": str(min(1000, len(unique_ids))),
        }
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al consultar contactos por ids: {data!r}")
        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            try:
                rows.append(await self._persona_to_contact_row(persona=row, organizacion_id=organizacion_id))
            except CRMRepositoryError:
                continue
        return rows

    async def get_personas_by_ids_light(
        self,
        *,
        organizacion_id: UUID,
        persona_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        if not persona_ids:
            return []
        unique_ids: list[str] = []
        seen: set[str] = set()
        for persona_id in persona_ids:
            key = str(persona_id).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            unique_ids.append(key)
        if not unique_ids:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"in.({','.join(unique_ids)})",
            "select": PERSONA_WHATSAPP_SELECT_FIELDS,
            "limit": str(min(1000, len(unique_ids))),
        }
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al consultar contactos ligeros por ids: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_contacts_by_ids(
        self,
        *,
        organizacion_id: UUID,
        contacto_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        return await self.get_personas_by_ids(
            organizacion_id=organizacion_id,
            persona_ids=contacto_ids,
        )

    async def update_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not payload:
            existing = await self.get_persona(
                organizacion_id=organizacion_id,
                persona_id=persona_id,
            )
            if existing is None:
                raise CRMRepositoryError("persona_no_encontrada")
            return existing
        normalized_payload = dict(payload)
        if "correo_principal" not in normalized_payload and (
            "correo" in normalized_payload or "email" in normalized_payload
        ):
            normalized_payload["correo_principal"] = normalized_payload.get("correo")
            if normalized_payload.get("correo_principal") is None and "email" in normalized_payload:
                normalized_payload["correo_principal"] = normalized_payload.get("email")
        existing_contact = await self.get_persona(
            organizacion_id=organizacion_id,
            persona_id=persona_id,
        )
        if existing_contact is None:
            raise CRMRepositoryError("persona_no_encontrada")
        merged_contact = dict(existing_contact)
        merged_contact.update(normalized_payload)
        parts = self._build_contact_write_parts(
            organizacion_id=organizacion_id,
            contact_id=persona_id,
            payload=normalized_payload,
            existing=existing_contact,
        )
        persona_body = dict(parts["persona_body"])
        account_body = parts["account_body"]
        persona_body.pop("id", None)
        persona_body.pop("organizacion_id", None)
        persona_body.pop("creado_en", None)
        persona_id_value = str(persona_id)
        persona_params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{persona_id_value}",
        }
        if persona_body.get("propietario_usuario_id") is None:
            persona_body.pop("propietario_usuario_id", None)
        persona_resp = await self._request(
            "PATCH",
            "/rest/v1/personas",
            params=persona_params,
            json=persona_body,
            prefer="return=representation",
        )
        persona_data = persona_resp.json()
        if not isinstance(persona_data, list) or not persona_data:
            raise CRMRepositoryError("persona_update_failed")
        persona_row = persona_data[0]
        if not isinstance(persona_row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar persona: {persona_row!r}")

        current_account_id = merged_contact.get("cuenta_id")
        if isinstance(current_account_id, str):
            current_account_id = current_account_id.strip() or None
        created_account_row: dict[str, Any] | None = None
        if account_body:
            if current_account_id:
                try:
                    current_account_uuid = _coerce_uuid(str(current_account_id), field="cuenta_id")
                except Exception:
                    current_account_uuid = None
                if current_account_uuid:
                    account_patch = dict(account_body)
                    account_patch.pop("colonia", None)
                    try:
                        account_resp = await self._request(
                            "PATCH",
                            "/rest/v1/cuentas",
                            params={
                                "organizacion_id": f"eq.{organizacion_id}",
                                "id": f"eq.{current_account_uuid}",
                            },
                            json=account_patch,
                            prefer="return=representation",
                        )
                    except CRMRepositoryError as exc:
                        if "propietario_usuario_id" in str(exc).lower() or "violates foreign key" in str(exc).lower():
                            fallback_account = dict(account_patch)
                            fallback_account.pop("propietario_usuario_id", None)
                            account_resp = await self._request(
                                "PATCH",
                                "/rest/v1/cuentas",
                                params={
                                    "organizacion_id": f"eq.{organizacion_id}",
                                    "id": f"eq.{current_account_uuid}",
                                },
                                json=fallback_account,
                                prefer="return=representation",
                            )
                        else:
                            raise
                    account_data = account_resp.json()
                    if isinstance(account_data, list) and account_data and isinstance(account_data[0], dict):
                        created_account_row = account_data[0]
                else:
                    current_account_id = None

            if not current_account_id:
                try:
                    created_account_row = await self.create_account(
                        organizacion_id=organizacion_id,
                        payload=account_body,
                    )
                except CRMRepositoryError as exc:
                    if "propietario_usuario_id" in str(exc).lower() or "violates foreign key" in str(exc).lower():
                        fallback_account = dict(account_body)
                        fallback_account.pop("propietario_usuario_id", None)
                        created_account_row = await self.create_account(
                            organizacion_id=organizacion_id,
                            payload=fallback_account,
                        )
                    else:
                        raise
                account_id_value = created_account_row.get("id") if isinstance(created_account_row, dict) else None
                if account_id_value:
                    current_account_id = str(account_id_value)

        if current_account_id:
            try:
                account_uuid = _coerce_uuid(str(current_account_id), field="cuenta_id")
            except Exception:
                account_uuid = None
            if account_uuid:
                await self._request(
                    "DELETE",
                    "/rest/v1/cuenta_personas",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "persona_id": f"eq.{persona_row.get('id')}",
                    },
                    prefer="return=representation",
                )
                relation_role = "dueno" if parts["contact_is_physical"] else "contacto_principal"
                relation_payload = {
                    "organizacion_id": str(organizacion_id),
                    "cuenta_id": str(account_uuid),
                    "persona_id": str(persona_row.get("id")),
                    "rol_en_cuenta": relation_role,
                    "es_contacto_principal": True,
                    "es_contacto_facturacion": False,
                    "es_representante_legal": bool(parts["contact_is_physical"]),
                    "activo": True,
                    "fecha_inicio": persona_row.get("creado_en") or datetime.now(timezone.utc).date().isoformat(),
                    "notas": persona_row.get("notas"),
                    "metadata": {
                        "source": "contact_update",
                    },
                }
                await self._request(
                    "POST",
                    "/rest/v1/cuenta_personas",
                    json=relation_payload,
                    prefer="return=representation,resolution=merge-duplicates",
                )
        else:
            await self._request(
                "DELETE",
                "/rest/v1/cuenta_personas",
                params={
                    "organizacion_id": f"eq.{organizacion_id}",
                    "persona_id": f"eq.{persona_row.get('id')}",
                },
                prefer="return=representation",
            )

        updated_persona_id = UUID(str(persona_row.get("id")))
        return await self.get_persona(
            organizacion_id=organizacion_id,
            persona_id=updated_persona_id,
        ) or persona_row

    async def update_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.update_persona(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            payload=payload,
        )

    async def mark_persona_merged(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        merged_into_persona_id: UUID,
        merge_metadata: dict[str, Any] | None = None,
        archived_at: datetime | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "estado": "fusionado",
            "merged_into_persona_id": str(merged_into_persona_id),
            "merge_metadata": merge_metadata or {},
            "archived_at": (archived_at or datetime.now(timezone.utc)).isoformat(),
        }
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{persona_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/personas",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("persona_merge_mark_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al marcar merge de persona: {row!r}")
        return row

    async def mark_cuenta_merged(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        merged_into_cuenta_id: UUID,
        merge_metadata: dict[str, Any] | None = None,
        archived_at: datetime | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "merged_into_cuenta_id": str(merged_into_cuenta_id),
            "merge_metadata": merge_metadata or {},
            "archived_at": (archived_at or datetime.now(timezone.utc)).isoformat(),
        }
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{cuenta_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/cuentas",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("cuenta_merge_mark_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al marcar merge de cuenta: {row!r}")
        return row

    async def count_account_person_relations(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        activo: bool | None = None,
    ) -> int:
        total = 0
        offset = 0
        page_size = 200
        while True:
            batch = await self.list_account_person_relations(
                organizacion_id=organizacion_id,
                cuenta_id=cuenta_id,
                activo=activo,
                limit=page_size,
                offset=offset,
            )
            if not batch:
                break
            total += len(batch)
            if len(batch) < page_size:
                break
            offset += page_size
            if offset >= 2000:
                break
        return total

    async def list_account_person_relations(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        activo: bool | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "cuenta_id": f"eq.{cuenta_id}",
            "order": "es_contacto_principal.desc,es_representante_legal.desc,activo.desc,creado_en.asc",
            "limit": str(limit),
            "offset": str(offset),
            "select": (
                "id,organizacion_id,cuenta_id,persona_id,rol_en_cuenta,puesto,es_contacto_principal,"
                "es_contacto_facturacion,es_representante_legal,activo,fecha_inicio,fecha_fin,notas,"
            "metadata,creado_en,actualizado_en,"
            "persona:personas(id,codigo_contacto,nombre_completo,correo_principal,correo_secundario,correo_institucional,telefono_principal_e164,telefono_principal_extension,telefono_movil_1_e164,company_name,propietario_usuario_id,"
            "propietario:usuarios!personas_propietario_usuario_org_fkey(id,nombre_completo,correo))"
        ),
        }
        if activo is not None:
            params["activo"] = "eq.true" if activo else "eq.false"
        resp = await self._request("GET", "/rest/v1/cuenta_personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("cuenta_personas_list_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_account_person_relations_by_cuenta_ids(
        self,
        *,
        organizacion_id: UUID,
        cuenta_ids: Sequence[UUID],
        activo: bool | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        unique_ids = sorted({str(cuenta_id) for cuenta_id in cuenta_ids if cuenta_id})
        if not unique_ids:
            return []
        select_fields = (
            "id,organizacion_id,cuenta_id,persona_id,rol_en_cuenta,puesto,es_contacto_principal,"
            "es_contacto_facturacion,es_representante_legal,activo,fecha_inicio,fecha_fin,notas,"
            "metadata,creado_en,actualizado_en,"
            "persona:personas(id,codigo_contacto,nombre_completo,correo_principal,correo_secundario,correo_institucional,telefono_principal_e164,telefono_principal_extension,telefono_movil_1_e164,company_name,propietario_usuario_id,"
            "propietario:usuarios!personas_propietario_usuario_org_fkey(id,nombre_completo,correo))"
        )
        rows: list[dict[str, Any]] = []
        page_size = max(1, min(limit, 500))
        current_offset = max(0, offset)
        while True:
            params: dict[str, str] = {
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"in.({','.join(unique_ids)})",
                "order": "cuenta_id.asc,es_contacto_principal.desc,es_representante_legal.desc,activo.desc,creado_en.asc",
                "limit": str(page_size),
                "offset": str(current_offset),
                "select": select_fields,
            }
            if activo is not None:
                params["activo"] = "eq.true" if activo else "eq.false"
            resp = await self._request("GET", "/rest/v1/cuenta_personas", params=params)
            data = resp.json()
            if not isinstance(data, list):
                raise CRMRepositoryError("cuenta_personas_list_invalid_response")
            batch = [row for row in data if isinstance(row, dict)]
            rows.extend(batch)
            if len(batch) < page_size:
                break
            current_offset += page_size
            if current_offset >= 100000:
                break
        return rows

    async def count_account_opportunities(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
    ) -> int:
        total = 0
        offset = 0
        page_size = 200
        while True:
            batch, _ = await self.list_opportunities(
                organizacion_id=organizacion_id,
                cuenta_id=cuenta_id,
                limit=page_size,
                offset=offset,
                include_contact_rows=False,
            )
            if not batch:
                break
            total += len(batch)
            if len(batch) < page_size:
                break
            offset += page_size
            if offset >= 2000:
                break
        return total

    async def create_account_person_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        persona_id = payload.get("persona_id")
        if not persona_id:
            raise CRMRepositoryError("persona_id_required")
        persona_uuid = _coerce_uuid(str(persona_id), field="persona_id")
        persona_row = await self.get_persona_by_id(persona_id=str(persona_uuid))
        if not isinstance(persona_row, dict) or not persona_row.get("id"):
            raise CRMRepositoryError("persona_no_encontrada_para_relacion")
        cuenta_row = await self.get_account(organizacion_id=organizacion_id, account_id=cuenta_id)
        if not cuenta_row:
            raise CRMRepositoryError("cuenta_no_encontrada_para_relacion")

        relation_body = {
            "organizacion_id": str(organizacion_id),
            "cuenta_id": str(cuenta_id),
            "persona_id": str(persona_uuid),
            "rol_en_cuenta": str(payload.get("rol_en_cuenta") or "").strip() or "contacto_principal",
            "es_contacto_principal": bool(payload.get("es_contacto_principal", True)),
            "es_contacto_facturacion": bool(payload.get("es_contacto_facturacion", False)),
            "es_representante_legal": bool(payload.get("es_representante_legal", False)),
            "activo": bool(payload.get("activo", True)),
            "fecha_inicio": payload.get("fecha_inicio") or datetime.now(timezone.utc).date().isoformat(),
            "fecha_fin": payload.get("fecha_fin"),
            "notas": payload.get("notas") or persona_row.get("notas"),
            "metadata": _ensure_metadata(payload.get("metadata")),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/cuenta_personas",
            json=relation_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_persona_create_failed")
        return data[0]

    async def update_account_person_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        relacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        update_body = dict(payload)
        if "rol_en_cuenta" in update_body:
            update_body["rol_en_cuenta"] = str(update_body.get("rol_en_cuenta") or "").strip() or "contacto_principal"
        if "metadata" in update_body:
            update_body["metadata"] = _ensure_metadata(update_body.get("metadata"))
        resp = await self._request(
            "PATCH",
            "/rest/v1/cuenta_personas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"eq.{cuenta_id}",
                "id": f"eq.{relacion_id}",
            },
            json=update_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_persona_no_encontrada")
        return data[0]

    async def delete_account_person_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        relacion_id: UUID,
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/cuenta_personas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"eq.{cuenta_id}",
                "id": f"eq.{relacion_id}",
            },
            prefer="return=representation",
        )

    async def create_account_address_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        cuenta_row = await self.get_account(organizacion_id=organizacion_id, account_id=cuenta_id)
        if not cuenta_row:
            raise CRMRepositoryError("cuenta_no_encontrada_para_relacion")
        direccion_id = payload.get("direccion_id")
        direccion_payload = payload.get("direccion")
        if not direccion_id and not isinstance(direccion_payload, dict):
            raise CRMRepositoryError("direccion_id_required")
        if not direccion_id and isinstance(direccion_payload, dict):
            direccion_body = {
                "organizacion_id": str(organizacion_id),
                "tipo": _account_direction_relation_type_for_storage(
                    direccion_payload.get("tipo") or payload.get("tipo_relacion") or "fiscal"
                ),
                "pais": direccion_payload.get("pais"),
                "clave_entidad": direccion_payload.get("clave_entidad"),
                "entidad": direccion_payload.get("entidad"),
                "clave_municipio": direccion_payload.get("clave_municipio"),
                "municipio": direccion_payload.get("municipio"),
                "clave_localidad": direccion_payload.get("clave_localidad"),
                "localidad": direccion_payload.get("localidad"),
                "tipo_vialidad": direccion_payload.get("tipo_vialidad"),
                "nombre_vialidad": direccion_payload.get("nombre_vialidad"),
                "numero_exterior": direccion_payload.get("numero_exterior"),
                "letra_exterior": direccion_payload.get("letra_exterior"),
                "edificio": direccion_payload.get("edificio"),
                "edificio_piso": direccion_payload.get("edificio_piso"),
                "numero_interior": direccion_payload.get("numero_interior"),
                "letra_interior": direccion_payload.get("letra_interior"),
                "tipo_asentamiento": direccion_payload.get("tipo_asentamiento"),
                "colonia": direccion_payload.get("colonia"),
                "tipo_centro_comercial": direccion_payload.get("tipo_centro_comercial"),
                "corredor_industrial": direccion_payload.get("corredor_industrial"),
                "numero_local": direccion_payload.get("numero_local"),
                "codigo_postal": direccion_payload.get("codigo_postal"),
                "latitud": direccion_payload.get("latitud"),
                "longitud": direccion_payload.get("longitud"),
                "metadata": _ensure_metadata(direccion_payload.get("metadata")),
            }
            direccion_resp = await self._request(
                "POST",
                "/rest/v1/direcciones",
                params={"select": "id"},
                json=direccion_body,
                prefer="return=representation",
            )
            direccion_data = direccion_resp.json()
            if not isinstance(direccion_data, list) or not direccion_data or not isinstance(direccion_data[0], dict):
                raise CRMRepositoryError("direccion_create_failed")
            direccion_row = direccion_data[0]
            direccion_id = direccion_row.get("id")
        if not direccion_id:
            raise CRMRepositoryError("direccion_id_required")
        relation_body = {
            "organizacion_id": str(organizacion_id),
            "cuenta_id": str(cuenta_id),
            "direccion_id": str(_coerce_uuid(str(direccion_id), field="direccion_id")),
            "tipo_relacion": _account_direction_relation_type_for_storage(payload.get("tipo_relacion")),
            "es_principal": bool(payload.get("es_principal", False)),
            "activo": bool(payload.get("activo", True)),
            "notas": payload.get("notas"),
            "metadata": _ensure_metadata(payload.get("metadata")),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/cuenta_direcciones",
            params={"select": self._ACCOUNT_DIRECTION_SELECT},
            json=relation_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_direccion_create_failed")
        return data[0]

    async def update_account_address_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        relacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        update_body = dict(payload)
        if "tipo_relacion" in update_body:
            update_body["tipo_relacion"] = _account_direction_relation_type_for_storage(update_body.get("tipo_relacion"))
        direccion_update = update_body.pop("direccion", None)
        if "metadata" in update_body:
            update_body["metadata"] = _ensure_metadata(update_body.get("metadata"))
        resp = await self._request(
            "PATCH",
            "/rest/v1/cuenta_direcciones",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"eq.{cuenta_id}",
                "id": f"eq.{relacion_id}",
                "select": self._ACCOUNT_DIRECTION_SELECT,
            },
            json=update_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_direccion_no_encontrada")
        row = data[0]
        if isinstance(direccion_update, dict):
            direccion_id = row.get("direccion_id")
            if direccion_id:
                direccion_body = {
                    "organizacion_id": str(organizacion_id),
                    "tipo": _account_direction_relation_type_for_storage(
                        direccion_update.get("tipo") or row.get("tipo_relacion") or "otro"
                    ),
                    "pais": direccion_update.get("pais"),
                    "clave_entidad": direccion_update.get("clave_entidad"),
                    "entidad": direccion_update.get("entidad"),
                    "clave_municipio": direccion_update.get("clave_municipio"),
                    "municipio": direccion_update.get("municipio"),
                    "clave_localidad": direccion_update.get("clave_localidad"),
                    "localidad": direccion_update.get("localidad"),
                    "tipo_vialidad": direccion_update.get("tipo_vialidad"),
                    "nombre_vialidad": direccion_update.get("nombre_vialidad"),
                    "numero_exterior": direccion_update.get("numero_exterior"),
                    "letra_exterior": direccion_update.get("letra_exterior"),
                    "edificio": direccion_update.get("edificio"),
                    "edificio_piso": direccion_update.get("edificio_piso"),
                    "numero_interior": direccion_update.get("numero_interior"),
                    "letra_interior": direccion_update.get("letra_interior"),
                    "tipo_asentamiento": direccion_update.get("tipo_asentamiento"),
                    "colonia": direccion_update.get("colonia"),
                    "tipo_centro_comercial": direccion_update.get("tipo_centro_comercial"),
                    "corredor_industrial": direccion_update.get("corredor_industrial"),
                    "numero_local": direccion_update.get("numero_local"),
                    "codigo_postal": direccion_update.get("codigo_postal"),
                    "latitud": direccion_update.get("latitud"),
                    "longitud": direccion_update.get("longitud"),
                    "metadata": _ensure_metadata(direccion_update.get("metadata")),
                }
                direccion_resp = await self._request(
                    "PATCH",
                    "/rest/v1/direcciones",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "id": f"eq.{direccion_id}",
                    },
                    json=direccion_body,
                    prefer="return=representation",
                )
                direccion_data = direccion_resp.json()
                if isinstance(direccion_data, list) and direccion_data and isinstance(direccion_data[0], dict):
                    row["direccion"] = direccion_data[0]
        if "tipo_relacion" in row:
            row["tipo_relacion"] = _normalize_account_direction_relation_type(row.get("tipo_relacion"))
        return row

    async def delete_account_address_relation(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        relacion_id: UUID,
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/cuenta_direcciones",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"eq.{cuenta_id}",
                "id": f"eq.{relacion_id}",
            },
            prefer="return=representation",
        )

    async def list_account_address_relations(
        self,
        *,
        organizacion_id: UUID,
        cuenta_id: UUID,
        activo: bool | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "cuenta_id": f"eq.{cuenta_id}",
            "order": "es_principal.desc,activo.desc,creado_en.asc",
            "select": self._ACCOUNT_DIRECTION_SELECT,
        }
        if activo is not None:
            params["activo"] = "eq.true" if activo else "eq.false"
        resp = await self._request("GET", "/rest/v1/cuenta_direcciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("cuenta_direcciones_list_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_account_address_relations_by_cuenta_ids(
        self,
        *,
        organizacion_id: UUID,
        cuenta_ids: Sequence[UUID],
        activo: bool | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        unique_ids = sorted({str(cuenta_id) for cuenta_id in cuenta_ids if cuenta_id})
        if not unique_ids:
            return []
        rows: list[dict[str, Any]] = []
        page_size = max(1, min(limit, 500))
        current_offset = max(0, offset)
        while True:
            params: dict[str, str] = {
                "organizacion_id": f"eq.{organizacion_id}",
                "cuenta_id": f"in.({','.join(unique_ids)})",
                "order": "cuenta_id.asc,es_principal.desc,activo.desc,creado_en.asc",
                "limit": str(page_size),
                "offset": str(current_offset),
                "select": self._ACCOUNT_DIRECTION_SELECT,
            }
            if activo is not None:
                params["activo"] = "eq.true" if activo else "eq.false"
            resp = await self._request("GET", "/rest/v1/cuenta_direcciones", params=params)
            data = resp.json()
            if not isinstance(data, list):
                raise CRMRepositoryError("cuenta_direcciones_list_invalid_response")
            batch = [row for row in data if isinstance(row, dict)]
            rows.extend(batch)
            if len(batch) < page_size:
                break
            current_offset += page_size
            if current_offset >= 100000:
                break
        return rows

    async def merge_account(
        self,
        *,
        organizacion_id: UUID,
        source_account_id: UUID,
        target_account_id: UUID,
        merge_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if source_account_id == target_account_id:
            raise CRMRepositoryError("cuenta_merge_same_record")

        source = await self.get_account(organizacion_id=organizacion_id, account_id=source_account_id)
        if not source:
            raise CRMRepositoryError("cuenta_source_not_found")
        target = await self.get_account(organizacion_id=organizacion_id, account_id=target_account_id)
        if not target:
            raise CRMRepositoryError("cuenta_target_not_found")

        def _pick_missing(target_value: Any, source_value: Any) -> Any:
            if target_value not in (None, "", [], {}):
                return target_value
            return source_value

        account_patch: dict[str, Any] = {}
        for key in (
            "nombre",
            "alias",
            "tipo",
            "industria",
            "tamano",
            "sitio_web",
            "telefono",
            "correo",
            "razon_social",
            "rfc",
            "uso_cfdi",
            "metodo_pago",
            "forma_pago",
            "email_facturacion",
            "tipo_industria",
            "notas",
            "necesidad_proposito",
            "direccion",
            "tipo_vialidad",
            "nombre_vialidad",
            "numero_exterior",
            "letra_exterior",
            "edificio",
            "edificio_piso",
            "numero_interior",
            "letra_interior",
            "tipo_asentamiento",
            "colonia",
            "tipo_centro_comercial",
            "corredor_industrial",
            "numero_local",
            "codigo_postal",
            "clave_entidad",
            "entidad",
            "clave_municipio",
            "municipio",
            "clave_localidad",
            "localidad",
            "pais",
            "latitud",
            "longitud",
            "propietario_usuario_id",
        ):
            picked = _pick_missing(target.get(key), source.get(key))
            if picked not in (None, "", [], {}):
                account_patch[key] = picked

        source_meta = _ensure_metadata(source.get("metadata"))
        target_meta = _ensure_metadata(target.get("metadata"))
        merged_meta = dict(source_meta)
        merged_meta.update(target_meta)
        merged_meta.update(_ensure_metadata(merge_metadata))
        merged_meta["merged_from_cuenta_id"] = str(source_account_id)
        merged_meta["merged_into_cuenta_id"] = str(target_account_id)
        merged_meta["merge_reason"] = merged_meta.get("merge_reason") or "manual_merge"
        account_patch["metadata"] = merged_meta

        await self.update_account(
            organizacion_id=organizacion_id,
            account_id=target_account_id,
            payload=account_patch,
        )

        source_relations = await self.list_account_person_relations(
            organizacion_id=organizacion_id,
            cuenta_id=source_account_id,
            activo=None,
        )
        target_relations = await self.list_account_person_relations(
            organizacion_id=organizacion_id,
            cuenta_id=target_account_id,
            activo=None,
        )
        target_relations_by_person = {
            str(row.get("persona_id") or ""): row
            for row in target_relations
            if str(row.get("persona_id") or "").strip()
        }
        relations_moved = 0
        relations_updated = 0
        for relation in source_relations:
            relation_id = relation.get("id")
            person_key = str(relation.get("persona_id") or "").strip()
            if not relation_id or not person_key:
                continue
            target_relation = target_relations_by_person.get(person_key)
            relation_metadata = _ensure_metadata(relation.get("metadata"))
            relation_metadata["merged_from_cuenta_id"] = str(source_account_id)
            relation_metadata["merged_into_cuenta_id"] = str(target_account_id)
            if target_relation and target_relation.get("id"):
                merged_relation_payload = {
                    "rol_en_cuenta": target_relation.get("rol_en_cuenta") or relation.get("rol_en_cuenta"),
                    "es_contacto_principal": bool(target_relation.get("es_contacto_principal")) or bool(relation.get("es_contacto_principal")),
                    "es_contacto_facturacion": bool(target_relation.get("es_contacto_facturacion")) or bool(relation.get("es_contacto_facturacion")),
                    "es_representante_legal": bool(target_relation.get("es_representante_legal")) or bool(relation.get("es_representante_legal")),
                    "activo": bool(target_relation.get("activo", True)) or bool(relation.get("activo", True)),
                    "fecha_inicio": target_relation.get("fecha_inicio") or relation.get("fecha_inicio"),
                    "fecha_fin": target_relation.get("fecha_fin") or relation.get("fecha_fin"),
                    "notas": target_relation.get("notas") or relation.get("notas"),
                    "metadata": {
                        **relation_metadata,
                        **_ensure_metadata(target_relation.get("metadata")),
                    },
                }
                await self._request(
                    "PATCH",
                    "/rest/v1/cuenta_personas",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "id": f"eq.{target_relation['id']}",
                    },
                    json=merged_relation_payload,
                    prefer="return=representation",
                )
                relations_updated += 1
            else:
                await self._request(
                    "PATCH",
                    "/rest/v1/cuenta_personas",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "id": f"eq.{relation_id}",
                    },
                    json={
                        "cuenta_id": str(target_account_id),
                        "metadata": relation_metadata,
                    },
                    prefer="return=representation",
                )
                relations_moved += 1

        source_addresses = await self.list_account_address_relations(
            organizacion_id=organizacion_id,
            cuenta_id=source_account_id,
            activo=None,
        )
        target_addresses = await self.list_account_address_relations(
            organizacion_id=organizacion_id,
            cuenta_id=target_account_id,
            activo=None,
        )
        target_addresses_by_key = {
            f"{str(row.get('direccion_id') or '')}:{_normalize_account_direction_relation_type(row.get('tipo_relacion'))}": row
            for row in target_addresses
            if str(row.get("direccion_id") or "").strip()
        }
        addresses_moved = 0
        addresses_updated = 0
        for link in source_addresses:
            link_id = link.get("id")
            direccion_key = str(link.get("direccion_id") or "").strip()
            tipo_relacion = _normalize_account_direction_relation_type(link.get("tipo_relacion"))
            if not link_id or not direccion_key:
                continue
            target_link = target_addresses_by_key.get(f"{direccion_key}:{tipo_relacion}")
            link_metadata = _ensure_metadata(link.get("metadata"))
            link_metadata["merged_from_cuenta_id"] = str(source_account_id)
            link_metadata["merged_into_cuenta_id"] = str(target_account_id)
            if target_link and target_link.get("id"):
                merged_link_payload = {
                    "tipo_relacion": target_link.get("tipo_relacion") or link.get("tipo_relacion"),
                    "es_principal": bool(target_link.get("es_principal")) or bool(link.get("es_principal")),
                    "activo": bool(target_link.get("activo", True)) or bool(link.get("activo", True)),
                    "notas": target_link.get("notas") or link.get("notas"),
                    "metadata": {
                        **link_metadata,
                        **_ensure_metadata(target_link.get("metadata")),
                    },
                }
                await self._request(
                    "PATCH",
                    "/rest/v1/cuenta_direcciones",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "id": f"eq.{target_link['id']}",
                    },
                    json=merged_link_payload,
                    prefer="return=representation",
                )
                addresses_updated += 1
            else:
                await self._request(
                    "PATCH",
                    "/rest/v1/cuenta_direcciones",
                    params={
                        "organizacion_id": f"eq.{organizacion_id}",
                        "id": f"eq.{link_id}",
                    },
                    json={
                        "cuenta_id": str(target_account_id),
                        "metadata": link_metadata,
                    },
                    prefer="return=representation",
                )
                addresses_moved += 1

        opportunities_moved = 0
        offset = 0
        limit = 200
        while True:
            rows, _ = await self.list_opportunities(
                organizacion_id=organizacion_id,
                limit=limit,
                offset=offset,
                cuenta_id=source_account_id,
                include_contact_rows=False,
            )
            if not rows:
                break
            for opportunity in rows:
                opportunity_id = _coerce_uuid(str(opportunity.get("id")), field="oportunidad_id")
                metadata = _ensure_metadata(opportunity.get("metadata"))
                metadata["merged_from_cuenta_id"] = str(source_account_id)
                metadata["merged_into_cuenta_id"] = str(target_account_id)
                await self.update_opportunity(
                    organizacion_id=organizacion_id,
                    oportunidad_id=opportunity_id,
                    payload={
                        "cuenta_id": str(target_account_id),
                        "metadata": metadata,
                    },
                )
                opportunities_moved += 1
            if len(rows) < limit:
                break
            offset += limit

        await self.mark_cuenta_merged(
            organizacion_id=organizacion_id,
            cuenta_id=source_account_id,
            merged_into_cuenta_id=target_account_id,
            merge_metadata={
                "merge_reason": "manual_merge",
                "source_cuenta_id": str(source_account_id),
                "target_cuenta_id": str(target_account_id),
            },
        )

        merged_target = await self.get_account(organizacion_id=organizacion_id, account_id=target_account_id)
        if not merged_target:
            raise CRMRepositoryError("cuenta_merge_reload_failed")
        merged_target["merge_summary"] = {
            "opportunities_moved": opportunities_moved,
            "relations_moved": relations_moved,
            "relations_updated": relations_updated,
            "addresses_moved": addresses_moved,
            "addresses_updated": addresses_updated,
        }
        return merged_target

    async def get_persona_by_id(
        self,
        *,
        persona_id: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        persona_key = persona_id.strip()
        if not persona_key:
            return None
        params = {
            "id": f"eq.{persona_key}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        org_value = row.get("organizacion_id")
        if not org_value:
            return row
        try:
            org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
        except ValueError:
            return row
        return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)

    async def get_contact_by_id(
        self,
        *,
        persona_id: str | None = None,
        contact_id: str | None = None,
    ) -> dict[str, Any] | None:
        resolved_persona_id = persona_id or contact_id
        if not resolved_persona_id:
            return None
        return await self.get_persona_by_id(persona_id=resolved_persona_id)

    async def ensure_contact_record_for_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        use_service_role: bool = False,
    ) -> dict[str, Any]:
        request = self._request_service_role if use_service_role else self._request
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{persona_id}",
            "limit": "1",
            "select": "id,organizacion_id,codigo_contacto,nombre_completo,correo,telefono_e164,origen,propietario_usuario_id,estado,contacto_datos,company_name,notes,necesidad_proposito,captura_estado,cuenta_id,persona_datos,nombre_nombres,apellido_paterno,apellido_materno,persona_fisica_moral,razon_social,rfc,uso_cfdi,metodo_pago,forma_pago,email_facturacion,tipo_industria,tamano,puesto,area,rol_decision,tipo_vialidad,nombre_vialidad,numero_exterior,letra_exterior,edificio,edificio_piso,numero_interior,letra_interior,tipo_asentamiento,nombre_asentamiento,tipo_centro_comercial,corredor_industrial,numero_local,codigo_postal,clave_entidad,entidad,clave_municipio,municipio,clave_localidad,localidad,pais,website,tipo_establecimiento,latitud,longitud,fecha_incorporacion",
        }
        existing_resp = await request("GET", "/rest/v1/contactos", params=params)
        existing_data = existing_resp.json() or []
        existing_row = self._first_row(existing_data)
        if isinstance(existing_row, dict):
            return existing_row

        persona_row = await self.get_persona(
            organizacion_id=organizacion_id,
            persona_id=persona_id,
            use_service_role=use_service_role,
        )
        if not isinstance(persona_row, dict):
            raise CRMRepositoryError("persona_not_found_for_contact_sync")

        contact_projection = await self._persona_to_contact_row(
            persona=persona_row,
            organizacion_id=organizacion_id,
        )
        created_at = contact_projection.get("creado_en") or datetime.now(timezone.utc).isoformat()
        contact_body: dict[str, Any] = {
            "id": str(persona_id),
            "organizacion_id": str(organizacion_id),
            "nombre_completo": contact_projection.get("nombre_completo") or persona_row.get("nombre_completo"),
            "correo": contact_projection.get("correo"),
            "telefono_e164": contact_projection.get("telefono_e164"),
            "origen": contact_projection.get("origen") or persona_row.get("origen") or "crm",
            "propietario_usuario_id": str(contact_projection.get("propietario_usuario_id"))
            if contact_projection.get("propietario_usuario_id")
            else None,
            "estado": "activo",
            "contacto_datos": contact_projection.get("contacto_datos") or {},
            "company_name": contact_projection.get("company_name"),
            "notes": contact_projection.get("notes"),
            "necesidad_proposito": contact_projection.get("necesidad_proposito"),
            "captura_estado": "completo",
            "cuenta_id": str(contact_projection.get("cuenta_id")) if contact_projection.get("cuenta_id") else None,
            "nombre_nombres": contact_projection.get("nombre_nombres"),
            "apellido_paterno": contact_projection.get("apellido_paterno"),
            "apellido_materno": contact_projection.get("apellido_materno"),
            "persona_fisica_moral": contact_projection.get("persona_fisica_moral"),
            "razon_social": contact_projection.get("razon_social"),
            "rfc": contact_projection.get("rfc"),
            "uso_cfdi": contact_projection.get("uso_cfdi"),
            "metodo_pago": contact_projection.get("metodo_pago"),
            "forma_pago": contact_projection.get("forma_pago"),
            "email_facturacion": contact_projection.get("email_facturacion"),
            "tipo_industria": contact_projection.get("tipo_industria"),
            "tamano": contact_projection.get("tamano"),
            "puesto": contact_projection.get("puesto"),
            "area": contact_projection.get("area"),
            "rol_decision": contact_projection.get("rol_decision"),
            "tipo_vialidad": contact_projection.get("tipo_vialidad"),
            "nombre_vialidad": contact_projection.get("nombre_vialidad"),
            "numero_exterior": contact_projection.get("numero_exterior"),
            "letra_exterior": contact_projection.get("letra_exterior"),
            "edificio": contact_projection.get("edificio"),
            "edificio_piso": contact_projection.get("edificio_piso"),
            "numero_interior": contact_projection.get("numero_interior"),
            "letra_interior": contact_projection.get("letra_interior"),
            "tipo_asentamiento": contact_projection.get("tipo_asentamiento"),
            "nombre_asentamiento": contact_projection.get("nombre_asentamiento"),
            "tipo_centro_comercial": contact_projection.get("tipo_centro_comercial"),
            "corredor_industrial": contact_projection.get("corredor_industrial"),
            "numero_local": contact_projection.get("numero_local"),
            "codigo_postal": contact_projection.get("codigo_postal"),
            "clave_entidad": contact_projection.get("clave_entidad"),
            "entidad": contact_projection.get("entidad"),
            "clave_municipio": contact_projection.get("clave_municipio"),
            "municipio": contact_projection.get("municipio"),
            "clave_localidad": contact_projection.get("clave_localidad"),
            "localidad": contact_projection.get("localidad"),
            "pais": contact_projection.get("pais"),
            "website": contact_projection.get("website"),
            "tipo_establecimiento": contact_projection.get("tipo_establecimiento"),
            "latitud": contact_projection.get("latitud"),
            "longitud": contact_projection.get("longitud"),
            "fecha_incorporacion": created_at,
        }
        contact_body = {key: value for key, value in contact_body.items() if value is not None}
        resp = await request(
            "POST",
            "/rest/v1/contactos",
            json=contact_body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("contacto_legacy_not_created")
        return data[0]

    async def get_persona_by_codigo_contacto(
        self,
        *,
        organizacion_id: UUID,
        codigo_contacto: str,
    ) -> dict[str, Any] | None:
        code = codigo_contacto.strip()
        if not code:
            return None
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "codigo_contacto": f"eq.{code}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar persona por código: {row!r}")
        org_value = row.get("organizacion_id")
        if not org_value:
            return row
        try:
            org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
        except ValueError:
            return row
        return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)

    async def get_persona_by_phone_e164(
        self,
        *,
        phone_e164: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        phone_candidates = _phone_lookup_variants(phone_e164)
        if not phone_candidates:
            return None
        select_fields = PERSONA_SELECT_FIELDS
        for phone_key in phone_candidates:
            for field_name in (
                "telefono_movil_1_e164",
                "telefono_principal_e164",
                "telefono_movil_2_e164",
                "telefono_secundario_e164",
                "telefono_empresa_1_e164",
                "telefono_empresa_2_e164",
            ):
                params: dict[str, str] = {
                    field_name: f"eq.{phone_key}",
                    "limit": "1",
                    "select": select_fields,
                }
                if organizacion_id:
                    params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request("GET", "/rest/v1/personas", params=params)
                data = resp.json() or []
                if isinstance(data, list) and data:
                    row = data[0]
                elif isinstance(data, dict):
                    row = data
                else:
                    row = None
                if isinstance(row, dict) and _is_active_crm_row(row):
                    org_value = row.get("organizacion_id")
                    if not org_value:
                        return row
                    try:
                        org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
                    except ValueError:
                        return row
                    return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)
        return None

    async def get_contact_by_phone_e164(
        self,
        *,
        phone_e164: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        return await self.get_persona_by_phone_e164(
            phone_e164=phone_e164,
            organizacion_id=organizacion_id,
        )

    async def get_persona_by_email(
        self,
        *,
        email: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        email_key = str(email or "").strip().lower()
        if not email_key:
            return None
        for field_name in ("correo_principal", "correo_secundario", "correo_institucional", "correo_personal_3"):
            params: dict[str, str] = {
                field_name: f"eq.{email_key}",
                "limit": "1",
                "select": PERSONA_SELECT_FIELDS,
            }
            if organizacion_id:
                params["organizacion_id"] = f"eq.{organizacion_id}"
            resp = await self._request("GET", "/rest/v1/personas", params=params)
            data = resp.json() or []
            if isinstance(data, list) and data:
                row = data[0]
            elif isinstance(data, dict):
                row = data
            else:
                row = None
            if not isinstance(row, dict) or not _is_active_crm_row(row):
                continue
            org_value = row.get("organizacion_id")
            if not org_value:
                return row
            try:
                org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
            except ValueError:
                return row
            return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)
        return None

    async def get_contact_by_email(
        self,
        *,
        email: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        return await self.get_persona_by_email(email=email, organizacion_id=organizacion_id)
        

    async def get_persona_by_whatsapp_id(
        self,
        *,
        wa_id: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        wa_key = str(wa_id or "").strip()
        if not wa_key:
            return None
        params: dict[str, str] = {
            "metadata->>wa_id": f"eq.{wa_key}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        resp = await self._request("GET", "/rest/v1/personas", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        org_value = row.get("organizacion_id")
        if not org_value:
            return row
        try:
            org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
        except ValueError:
            return row
        return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)

    async def get_contact_by_whatsapp_id(
        self,
        *,
        wa_id: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        return await self.get_persona_by_whatsapp_id(wa_id=wa_id, organizacion_id=organizacion_id)

    async def list_persona_identities(self, *, persona_id: str) -> list[dict[str, Any]]:
        persona_key = persona_id.strip()
        if not persona_key:
            return []
        params = {
            "select": "canal,id_externo,metadatos",
            "contacto_id": f"eq.{persona_key}",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        return data if isinstance(data, list) else []

    async def list_contact_identities(
        self,
        *,
        persona_id: str | None = None,
        contact_id: str | None = None,
    ) -> list[dict[str, Any]]:
        resolved_persona_id = persona_id or contact_id
        if not resolved_persona_id:
            return []
        return await self.list_persona_identities(persona_id=resolved_persona_id)

    async def update_persona_by_id(self, *, persona_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        if not patch:
            raise CRMRepositoryError("contact_patch_empty")
        record = await self.get_persona_by_id(persona_id=persona_id)
        if not record:
            raise CRMRepositoryError("contact_not_found")
        org_value = record.get("organizacion_id")
        if not org_value:
            raise CRMRepositoryError("contact_missing_org")
        try:
            org_uuid = UUID(str(org_value))
            persona_uuid = UUID(str(record.get("id") or persona_id))
        except (TypeError, ValueError) as exc:
            raise CRMRepositoryError("contact_invalid_uuid") from exc
        return await self.update_persona(
            organizacion_id=org_uuid,
            persona_id=persona_uuid,
            payload=patch,
        )

    async def update_contact_by_id(
        self,
        *,
        persona_id: str | None = None,
        contact_id: str | None = None,
        patch: dict[str, Any],
    ) -> dict[str, Any]:
        resolved_persona_id = persona_id or contact_id
        if not resolved_persona_id:
            raise CRMRepositoryError("contact_not_found")
        return await self.update_persona_by_id(persona_id=resolved_persona_id, patch=patch)

    async def create_persona(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        persona_id = uuid4()
        parts = self._build_contact_write_parts(
            organizacion_id=organizacion_id,
            contact_id=persona_id,
            payload=payload,
        )
        persona_body = dict(parts["persona_body"])
        account_body = parts["account_body"]
        request_id = str(persona_body.get("request_id") or "").strip()
        if not request_id:
            request_id = str(uuid4())
            persona_body["request_id"] = request_id
        account_row: dict[str, Any] | None = None
        if account_body and not payload.get("cuenta_id"):
            try:
                account_row = await self.create_account(
                    organizacion_id=organizacion_id,
                    payload=account_body,
                )
            except CRMRepositoryError as exc:
                if "propietario_usuario_id" in str(exc).lower() or "violates foreign key" in str(exc).lower():
                    fallback_account = dict(account_body)
                    fallback_account.pop("propietario_usuario_id", None)
                    account_row = await self.create_account(
                        organizacion_id=organizacion_id,
                        payload=fallback_account,
                    )
                else:
                    raise
            account_id_value = account_row.get("id") if isinstance(account_row, dict) else None
            if account_id_value:
                payload["cuenta_id"] = str(account_id_value)
        elif payload.get("cuenta_id"):
            payload["cuenta_id"] = str(payload.get("cuenta_id"))

        request_id_disabled = False
        try:
            persona_resp = await self._request(
                "POST",
                "/rest/v1/personas",
                json=persona_body,
                prefer="return=representation",
            )
        except CRMRepositoryError as exc:
            if _is_persona_request_id_duplicate_error(exc):
                existing_persona = await self.get_persona_by_request_id(
                    organizacion_id=organizacion_id,
                    request_id=request_id,
                )
                if existing_persona:
                    return existing_persona
            if not request_id_disabled and _is_request_id_schema_cache_error(exc):
                request_id_disabled = True
                persona_body.pop("request_id", None)
                persona_resp = await self._request(
                    "POST",
                    "/rest/v1/personas",
                    json=persona_body,
                    prefer="return=representation",
                )
            elif "propietario_usuario_id" in str(exc).lower() or "violates foreign key" in str(exc).lower():
                persona_body.pop("propietario_usuario_id", None)
                persona_resp = await self._request(
                    "POST",
                    "/rest/v1/personas",
                    json=persona_body,
                    prefer="return=representation",
                )
            else:
                raise
        persona_data = persona_resp.json()
        if not isinstance(persona_data, list) or not persona_data:
            raise CRMRepositoryError("Supabase no devolvió el contacto creado")
        persona_row = persona_data[0]
        if not isinstance(persona_row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear persona: {persona_row!r}")

        current_account_id = payload.get("cuenta_id")
        if current_account_id:
            try:
                account_uuid = _coerce_uuid(str(current_account_id), field="cuenta_id")
            except Exception:
                account_uuid = None
            if account_uuid:
                relation_role = "dueno" if parts["contact_is_physical"] else "contacto_principal"
                relation_payload = {
                    "organizacion_id": str(organizacion_id),
                    "cuenta_id": str(account_uuid),
                    "persona_id": str(persona_row.get("id")),
                    "rol_en_cuenta": relation_role,
                    "es_contacto_principal": True,
                    "es_contacto_facturacion": False,
                    "es_representante_legal": bool(parts["contact_is_physical"]),
                    "activo": True,
                    "fecha_inicio": persona_row.get("creado_en") or datetime.now(timezone.utc).date().isoformat(),
                    "notas": persona_row.get("notas"),
                    "metadata": {
                        "source": "contact_create",
                    },
                }
                await self._request(
                    "POST",
                    "/rest/v1/cuenta_personas",
                    json=relation_payload,
                    prefer="return=representation,resolution=merge-duplicates",
                )

        contact_row = await self.get_persona(
            organizacion_id=organizacion_id,
            persona_id=persona_id,
        )
        if not contact_row:
            raise CRMRepositoryError("Supabase no devolvió el contacto creado")
        return contact_row

    async def create_contact(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.create_persona(organizacion_id=organizacion_id, payload=payload)

    async def get_persona_by_request_id(
        self,
        *,
        organizacion_id: UUID,
        request_id: str,
    ) -> dict[str, Any] | None:
        request_key = request_id.strip()
        if not request_key:
            return None
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "request_id": f"eq.{request_key}",
            "limit": "1",
            "select": PERSONA_SELECT_FIELDS,
        }
        try:
            resp = await self._request("GET", "/rest/v1/personas", params=params)
        except CRMRepositoryError as exc:
            if _is_request_id_schema_cache_error(exc):
                return None
            raise
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        org_value = row.get("organizacion_id")
        if not org_value:
            return row
        try:
            org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
        except ValueError:
            return row
        return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)

    async def upsert_persona_account_relation(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        cuenta_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        persona_row = await self.get_persona(
            organizacion_id=organizacion_id,
            persona_id=persona_id,
        )
        if not isinstance(persona_row, dict) or not persona_row.get("id"):
            raise CRMRepositoryError("persona_no_encontrada_para_relacion")

        persona_id = str(persona_row["id"])
        role = str(payload.get("rol_en_cuenta") or "").strip() or "contacto_principal"
        relation_body = {
            "organizacion_id": str(organizacion_id),
            "cuenta_id": str(cuenta_id),
            "persona_id": persona_id,
            "rol_en_cuenta": role,
            "es_contacto_principal": bool(payload.get("es_contacto_principal", True)),
            "es_contacto_facturacion": bool(payload.get("es_contacto_facturacion", False)),
            "es_representante_legal": bool(payload.get("es_representante_legal", False)),
            "activo": bool(payload.get("activo", True)),
            "fecha_inicio": payload.get("fecha_inicio") or datetime.now(timezone.utc).date().isoformat(),
            "notas": payload.get("notas") or persona_row.get("notas"),
            "metadata": _ensure_metadata(payload.get("metadata")),
        }

        relation_params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "persona_id": f"eq.{persona_id}",
            "cuenta_id": f"eq.{cuenta_id}",
            "limit": "1",
        }
        existing_resp = await self._request("GET", "/rest/v1/cuenta_personas", params=relation_params)
        existing_data = existing_resp.json()
        existing_row = existing_data[0] if isinstance(existing_data, list) and existing_data else None

        if isinstance(existing_row, dict):
            resp = await self._request(
                "PATCH",
                "/rest/v1/cuenta_personas",
                params={
                    "organizacion_id": f"eq.{organizacion_id}",
                    "persona_id": f"eq.{persona_id}",
                    "cuenta_id": f"eq.{cuenta_id}",
                },
                json=relation_body,
                prefer="return=representation",
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/cuenta_personas",
                json=relation_body,
                prefer="return=representation",
            )

        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_persona_upsert_failed")
        return data[0]

    async def upsert_contact_account_relation(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        cuenta_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.upsert_persona_account_relation(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            cuenta_id=cuenta_id,
            payload=payload,
        )

    async def list_persona_account_relations(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        activo: bool | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "persona_id": f"eq.{persona_id}",
            "order": "es_contacto_principal.desc,es_representante_legal.desc,activo.desc,creado_en.asc",
            "select": (
                "id,organizacion_id,cuenta_id,persona_id,rol_en_cuenta,es_contacto_principal,"
                "es_contacto_facturacion,es_representante_legal,activo,fecha_inicio,fecha_fin,notas,"
                "metadata,creado_en,actualizado_en"
            ),
        }
        if activo is not None:
            params["activo"] = "eq.true" if activo else "eq.false"
        resp = await self._request("GET", "/rest/v1/cuenta_personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("cuenta_personas_list_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_persona_account_relations_by_persona_ids(
        self,
        *,
        organizacion_id: UUID,
        persona_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        unique_ids = sorted({str(persona_id) for persona_id in persona_ids if persona_id})
        if not unique_ids:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "persona_id": f"in.({','.join(unique_ids)})",
            "activo": "eq.true",
            "order": "es_contacto_principal.desc,es_representante_legal.desc,creado_en.asc",
            "select": "id,organizacion_id,cuenta_id,persona_id,es_contacto_principal,es_representante_legal,activo",
        }
        resp = await self._request("GET", "/rest/v1/cuenta_personas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError("cuenta_personas_batch_list_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def create_persona_account_relation(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        cuenta_id = payload.get("cuenta_id")
        if not cuenta_id:
            raise CRMRepositoryError("cuenta_id_required")
        cuenta_uuid = _coerce_uuid(str(cuenta_id), field="cuenta_id")
        relation_body = {
            "organizacion_id": str(organizacion_id),
            "persona_id": str(persona_id),
            "cuenta_id": str(cuenta_uuid),
            "rol_en_cuenta": str(payload.get("rol_en_cuenta") or "").strip() or "contacto_principal",
            "es_contacto_principal": bool(payload.get("es_contacto_principal", False)),
            "es_contacto_facturacion": bool(payload.get("es_contacto_facturacion", False)),
            "es_representante_legal": bool(payload.get("es_representante_legal", False)),
            "activo": bool(payload.get("activo", True)),
            "fecha_inicio": payload.get("fecha_inicio") or datetime.now(timezone.utc).date().isoformat(),
            "fecha_fin": payload.get("fecha_fin"),
            "notas": payload.get("notas"),
            "metadata": _ensure_metadata(payload.get("metadata")),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/cuenta_personas",
            json=relation_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_persona_create_failed")
        return data[0]

    async def update_persona_account_relation(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        relacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        update_body = dict(payload)
        if "rol_en_cuenta" in update_body:
            update_body["rol_en_cuenta"] = str(update_body.get("rol_en_cuenta") or "").strip() or "contacto_principal"
        if "metadata" in update_body:
            update_body["metadata"] = _ensure_metadata(update_body.get("metadata"))

        resp = await self._request(
            "PATCH",
            "/rest/v1/cuenta_personas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "persona_id": f"eq.{persona_id}",
                "id": f"eq.{relacion_id}",
            },
            json=update_body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("cuenta_persona_no_encontrada")
        return data[0]

    async def delete_persona_account_relation(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        relacion_id: UUID,
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/cuenta_personas",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "persona_id": f"eq.{persona_id}",
                "id": f"eq.{relacion_id}",
            },
            prefer="return=representation",
        )

    async def list_contact_account_relations(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        activo: bool | None = None,
    ) -> list[dict[str, Any]]:
        return await self.list_persona_account_relations(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            activo=activo,
        )

    async def create_contact_account_relation(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.create_persona_account_relation(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            payload=payload,
        )

    async def update_contact_account_relation(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        relacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.update_persona_account_relation(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            relacion_id=relacion_id,
            payload=payload,
        )

    async def delete_contact_account_relation(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        relacion_id: UUID,
    ) -> None:
        await self.delete_persona_account_relation(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            relacion_id=relacion_id,
        )

    async def fetch_user_profile(self, usuario_id: UUID) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{usuario_id}",
            "select": "id,nombre_completo,correo,timezone",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/usuarios", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        return None

    async def delete_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
    ) -> None:
        persona_row = await self.get_persona(organizacion_id=organizacion_id, persona_id=persona_id)
        if not persona_row or not persona_row.get("id"):
            return

        persona_uuid = str(persona_row.get("id"))
        await self._rpc(
            "crm_delete_persona_physical",
            {
                "p_persona_id": persona_uuid,
                "p_organizacion_id": str(organizacion_id),
            },
        )

    async def delete_contact(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID | None = None,
        contacto_id: UUID | None = None,
    ) -> None:
        resolved_persona_id = persona_id or contacto_id
        if resolved_persona_id is None:
            return
        await self.delete_persona(organizacion_id=organizacion_id, persona_id=resolved_persona_id)

    async def list_opportunity_stage_history(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "order": "cambiado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
            "select": self._HISTORY_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidad_etapas_historial", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar historial de oportunidad: {data!r}"
            )
        return data

    async def get_opportunity_history_entry(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        history_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "id": f"eq.{history_id}",
            "limit": "1",
            "select": self._HISTORY_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidad_etapas_historial", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener historial: {row!r}")
        return row

    async def list_opportunity_stage_history_by_range(
        self,
        *,
        organizacion_id: UUID,
        cambiado_desde: str | None = None,
        cambiado_hasta: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "cambiado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
            "select": self._HISTORY_SELECT,
        }
        and_filters: list[str] = []
        if cambiado_desde:
            and_filters.append(f"cambiado_en.gte.{cambiado_desde}")
        if cambiado_hasta:
            and_filters.append(f"cambiado_en.lte.{cambiado_hasta}")
        if and_filters:
            params["and"] = "(" + ",".join(and_filters) + ")"
        resp = await self._request("GET", "/rest/v1/oportunidad_etapas_historial", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar historial de oportunidades por rango: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def append_note_history(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        etapa_id: UUID,
        usuario_id: UUID | None,
        texto: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "oportunidad_id": str(oportunidad_id),
            "etapa_origen_id": str(etapa_id),
            "etapa_destino_id": str(etapa_id),
            "cambiado_por_usuario_id": str(usuario_id) if usuario_id else None,
            "motivo": None,
            "fuente": "humano",
            "metadata": {
                "tipo": "nota",
                "nota": texto,
                **(metadata or {}),
            },
        }
        return await self.append_stage_history(
            organizacion_id=organizacion_id,
            payload={k: v for k, v in payload.items() if v is not None},
        )

    async def list_catalog_items(
        self,
        *,
        organizacion_id: UUID | None = None,
        include_inactive: bool = False,
        tipo: str | None = None,
        linea_id: UUID | None = None,
        familia_id: UUID | None = None,
        modelo_id: UUID | None = None,
        search: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        params[
            "select"
        ] = (
            "*,"
            "linea:lineas_de_negocio(id,nombre,activo,descripcion,metadata,creado_en,actualizado_en),"
            "familia:familias_productos(id,linea_id,nombre,descripcion,activo,metadata,creado_en,actualizado_en),"
            "modelo:modelos_productos(id,nombre,descripcion,activo,metadata,creado_en,actualizado_en)"
        )
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if not include_inactive:
            params["activo"] = "eq.true"
        if tipo:
            params["tipo"] = f"eq.{tipo}"
        if linea_id:
            params["linea_id"] = f"eq.{linea_id}"
        if familia_id:
            params["familia_id"] = f"eq.{familia_id}"
        if modelo_id:
            params["modelo_id"] = f"eq.{modelo_id}"
        if search:
            pattern = search.strip()
            if pattern:
                sanitized = pattern.replace("%", "").replace("*", "")
                params["or"] = (
                    f"(nombre.ilike.*{sanitized}*,slug.ilike.*{sanitized}*,"
                    f"descripcion.ilike.*{sanitized}*,descripcion_corta.ilike.*{sanitized}*,descripcion_larga.ilike.*{sanitized}*)"
                )
        resp = await self._request("GET", "/rest/v1/catalog_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar catálogo: {data!r}")
        return data

    async def get_catalog_item_by_slug(
        self,
        *,
        organizacion_id: UUID,
        slug: str,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "slug": f"eq.{slug}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/catalog_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar catálogo: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar catálogo: {row!r}")
        return row

    async def get_catalog_item(
        self,
        *,
        organizacion_id: UUID,
        item_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{item_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/catalog_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar catálogo: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar catálogo: {row!r}")
        return row

    async def get_linea_de_negocio(
        self,
        *,
        organizacion_id: UUID,
        linea_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{linea_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/lineas_de_negocio", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar línea: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar línea: {row!r}")
        return row

    async def get_familia_producto(
        self,
        *,
        organizacion_id: UUID,
        familia_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{familia_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/familias_productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar familia: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar familia: {row!r}")
        return row

    async def get_modelo_producto(
        self,
        *,
        organizacion_id: UUID,
        modelo_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{modelo_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/modelos_productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar modelo: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar modelo: {row!r}")
        return row

    async def get_product(
        self,
        *,
        organizacion_id: UUID,
        product_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{product_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar producto: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar producto: {row!r}")
        return row

    async def list_lineas_de_negocio(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        search: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        if search:
            sanitized = _sanitize_search_pattern(search)
            if sanitized:
                params["or"] = f"(nombre.ilike.*{sanitized}*,descripcion.ilike.*{sanitized}*)"
        resp = await self._request("GET", "/rest/v1/lineas_de_negocio", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar líneas: {data!r}")
        return data

    async def list_familias_productos(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        linea_id: UUID | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        if linea_id:
            params["linea_id"] = f"eq.{linea_id}"
        if search:
            sanitized = _sanitize_search_pattern(search)
            if sanitized:
                params["or"] = f"(nombre.ilike.*{sanitized}*,descripcion.ilike.*{sanitized}*)"
        resp = await self._request("GET", "/rest/v1/familias_productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar familias: {data!r}")
        return data

    async def list_modelos_productos(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        if search:
            sanitized = _sanitize_search_pattern(search)
            if sanitized:
                params["or"] = f"(nombre.ilike.*{sanitized}*,descripcion.ilike.*{sanitized}*)"
        resp = await self._request("GET", "/rest/v1/modelos_productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar modelos: {data!r}")
        return data

    async def list_unidades_medida(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        search: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        if search:
            sanitized = _sanitize_search_pattern(search)
            if sanitized:
                params["or"] = f"(nombre.ilike.*{sanitized}*,codigo.ilike.*{sanitized}*,simbolo.ilike.*{sanitized}*)"
        resp = await self._request("GET", "/rest/v1/unidades_medida", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar unidades: {data!r}")
        return data

    async def create_unidad_medida(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/unidades_medida",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("unidad_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear unidad: {row!r}")
        return row

    async def update_unidad_medida(
        self,
        *,
        organizacion_id: UUID,
        unidad_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{unidad_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/unidades_medida",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("unidad_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar unidad: {row!r}")
        return row

    async def delete_unidad_medida(
        self,
        *,
        organizacion_id: UUID,
        unidad_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{unidad_id}",
        }
        try:
            resp = await self._request(
                "DELETE",
                "/rest/v1/unidades_medida",
                params=params,
                prefer="return=representation",
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raise _map_fk_delete_error(exc, "unidad_has_children") from exc
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("unidad_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar unidad: {row!r}")
        return row

    async def list_product_metadata_schemes(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "name.asc",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/producto_metadata_schemes",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar esquemas: {data!r}")
        return data

    async def get_product_metadata_scheme(
        self,
        *,
        organizacion_id: UUID,
        scheme_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{scheme_id}",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/producto_metadata_schemes",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("scheme_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"respuesta inválida al buscar esquema: {row!r}")
        return row

    async def create_product_metadata_scheme(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/producto_metadata_schemes",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("scheme_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear esquema: {row!r}")
        return row

    async def update_product_metadata_scheme(
        self,
        *,
        organizacion_id: UUID,
        scheme_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{scheme_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/producto_metadata_schemes",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("scheme_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar esquema: {row!r}")
        return row

    async def delete_product_metadata_scheme(
        self,
        *,
        organizacion_id: UUID,
        scheme_id: UUID,
    ) -> None:
        params = {"id": f"eq.{scheme_id}"}
        resp = await self._request(
            "DELETE",
            "/rest/v1/producto_metadata_schemes",
            params=params,
            prefer="return=minimal",
            organizacion_id=organizacion_id,
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(f"scheme_delete_failed:{resp.status_code}")

    async def list_recursos_media(
        self,
        *,
        organizacion_id: UUID,
        objeto_type: str | None = None,
        objeto_ids: Sequence[UUID] | None = None,
        activo_only: bool = False,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
            "limit": str(max(1, min(limit, 1000))),
        }
        if objeto_type:
            params["objeto_type"] = f"eq.{objeto_type}"
        if objeto_ids:
            values = ",".join(str(obj_id) for obj_id in objeto_ids)
            params["objeto_id"] = f"in.({values})"
        if activo_only:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/recursos_media", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar recursos: {data!r}")
        return data

    async def upsert_catalog_document_embeddings(self, *, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        await self._request(
            "POST",
            "/rest/v1/catalog_document_embeddings",
            json=rows,
            params={"on_conflict": "organizacion_id,entity_type,entity_id"},
            prefer="resolution=merge-duplicates",
        )

    async def delete_catalog_document_embeddings_missing(
        self,
        *,
        organizacion_id: UUID,
        entity_type: str,
        keep_entity_ids: Sequence[str] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "p_organizacion_id": str(organizacion_id),
            "p_entity_type": entity_type,
            "p_keep_ids": [str(value) for value in keep_entity_ids] if keep_entity_ids else None,
        }
        await self._request(
            "POST",
            "/rest/v1/rpc/catalog_document_embeddings_delete_missing",
            json=payload,
        )

    async def delete_catalog_document_embedding_entity(
        self,
        *,
        organizacion_id: UUID,
        entity_type: str,
        entity_id: UUID,
    ) -> None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "entity_type": f"eq.{entity_type}",
            "entity_id": f"eq.{entity_id}",
        }
        await self._request(
            "DELETE",
            "/rest/v1/catalog_document_embeddings",
            params=params,
        )

    async def search_catalog_document_embeddings(
        self,
        *,
        organizacion_id: UUID,
        embedding: Sequence[float],
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_organizacion_id": str(organizacion_id),
            "p_embedding": embedding,
            "p_limit": limit,
        }
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/catalog_document_embeddings_search",
            json=payload,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada de la búsqueda vectorial: {data!r}"
            )
        return data

    async def create_catalog_embeddings_audit(self, *, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        await self._request(
            "POST",
            "/rest/v1/catalog_embeddings_audit",
            json=rows,
            prefer="return=representation",
        )

    async def list_catalog_embeddings_audit(
        self,
        *,
        organizacion_id: UUID,
        tipo: str | None = None,
        canal: str | None = None,
        created_after: datetime | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if tipo:
            params["tipo"] = f"eq.{tipo}"
        if canal:
            params["canal"] = f"eq.{canal}"
        if created_after:
            params["creado_en"] = f"gte.{created_after.isoformat()}"
        resp = await self._request("GET", "/rest/v1/catalog_embeddings_audit", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar auditoría vector store: {data!r}")
        return data

    async def create_linea_de_negocio(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/lineas_de_negocio",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("linea_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear línea: {row!r}")
        return row

    async def update_linea_de_negocio(
        self,
        *,
        organizacion_id: UUID,
        linea_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{linea_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/lineas_de_negocio",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("linea_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar línea: {row!r}")
        return row

    async def delete_linea_de_negocio(
        self,
        *,
        organizacion_id: UUID,
        linea_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{linea_id}",
        }
        try:
            resp = await self._request(
                "DELETE",
                "/rest/v1/lineas_de_negocio",
                params=params,
                prefer="return=representation",
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raise _map_fk_delete_error(exc, "linea_has_children") from exc
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("linea_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar línea: {row!r}")
        return row

    async def create_familia_producto(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/familias_productos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("familia_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear familia: {row!r}")
        return row

    async def update_familia_producto(
        self,
        *,
        organizacion_id: UUID,
        familia_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{familia_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/familias_productos",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("familia_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar familia: {row!r}")
        return row

    async def delete_familia_producto(
        self,
        *,
        organizacion_id: UUID,
        familia_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{familia_id}",
        }
        try:
            resp = await self._request(
                "DELETE",
                "/rest/v1/familias_productos",
                params=params,
                prefer="return=representation",
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raise _map_fk_delete_error(exc, "familia_has_children") from exc
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("familia_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar familia: {row!r}")
        return row

    async def create_modelo_producto(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/modelos_productos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("modelo_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear modelo: {row!r}")
        return row

    async def update_modelo_producto(
        self,
        *,
        organizacion_id: UUID,
        modelo_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{modelo_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/modelos_productos",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("modelo_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar modelo: {row!r}")
        return row

    async def delete_modelo_producto(
        self,
        *,
        organizacion_id: UUID,
        modelo_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{modelo_id}",
        }
        try:
            resp = await self._request(
                "DELETE",
                "/rest/v1/modelos_productos",
                params=params,
                prefer="return=representation",
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raise _map_fk_delete_error(exc, "modelo_has_children") from exc
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("modelo_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar modelo: {row!r}")
        return row

    async def create_catalog_item(
        self,
        *,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/catalog_items",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el catálogo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear catálogo: {row!r}")
        return row

    async def update_catalog_item(
        self,
        *,
        item_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/catalog_items",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar catálogo: {row!r}")
        return row

    async def delete_catalog_item(
        self,
        *,
        item_id: UUID,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "DELETE",
            "/rest/v1/catalog_items",
            params=params,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar catálogo: {row!r}")
        return row

    async def list_almacenes(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "es_principal.desc,nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/almacenes", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar almacenes: {data!r}")
        return data

    async def count_almacenes(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
    ) -> int:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id",
            "limit": "1",
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request(
            "GET",
            "/rest/v1/almacenes",
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def list_proveedores(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "razon_social.asc,codigo_proveedor.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/proveedores", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar proveedores: {data!r}")
        return data

    async def create_proveedor(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        code = str(body.get("codigo_proveedor") or "").strip()
        if not code:
            existing = await self.list_proveedores(
                organizacion_id=organizacion_id,
                include_inactive=True,
                limit=5000,
            )
            code = _next_sequential_code("Prov-", [row.get("codigo_proveedor") for row in existing])
        body["codigo_proveedor"] = code
        resp = await self._request(
            "POST",
            "/rest/v1/proveedores",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear proveedor: {row!r}")
        return row

    async def update_proveedor(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/proveedores?id=eq.{proveedor_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar proveedor: {row!r}")
        return row

    async def delete_proveedor(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/proveedores?id=eq.{proveedor_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar proveedor: {row!r}")
        return row

    async def list_proveedor_contactos(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID | None = None,
        include_inactive: bool = False,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "es_principal.desc,activo.desc,rol_en_proveedor.asc,creado_en.desc",
            "limit": str(max(1, min(limit, 5000))),
            "select": (
                "id,organizacion_id,proveedor_id,persona_id,rol_en_proveedor,es_principal,"
                "es_compras,es_facturacion,es_logistica,activo,fecha_inicio,fecha_fin,notas,"
                "metadata,creado_en,actualizado_en,"
                "persona:personas(id,organizacion_id,nombre_completo,correo,correo_principal,telefono_e164,telefono_principal_e164,puesto,area,rol_decision,company_name)"
            ),
        }
        if proveedor_id is not None:
            params["proveedor_id"] = f"eq.{proveedor_id}"
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/proveedor_contactos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar proveedor_contactos: {data!r}")
        return data

    async def create_proveedor_contacto(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        if body.get("es_principal"):
            await self.clear_proveedor_contactos_principal(
                organizacion_id=organizacion_id,
                proveedor_id=UUID(str(body["proveedor_id"])),
            )
        resp = await self._request(
            "POST",
            "/rest/v1/proveedor_contactos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_contacto_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear proveedor_contacto: {row!r}")
        return row

    async def update_proveedor_contacto(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        proveedor_id = payload.get("proveedor_id")
        if payload.get("es_principal") and proveedor_id:
            await self.clear_proveedor_contactos_principal(
                organizacion_id=organizacion_id,
                proveedor_id=UUID(str(proveedor_id)),
                exclude_id=contacto_id,
            )
        resp = await self._request(
            "PATCH",
            f"/rest/v1/proveedor_contactos?id=eq.{contacto_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_contacto_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar proveedor_contacto: {row!r}")
        return row

    async def delete_proveedor_contacto(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/proveedor_contactos?id=eq.{contacto_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_contacto_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar proveedor_contacto: {row!r}")
        return row

    async def clear_proveedor_contactos_principal(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID,
        exclude_id: UUID | None = None,
    ) -> None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "proveedor_id": f"eq.{proveedor_id}",
            "es_principal": "eq.true",
            "activo": "eq.true",
        }
        if exclude_id is not None:
            params["id"] = f"neq.{exclude_id}"
        resp = await self._request(
            "PATCH",
            "/rest/v1/proveedor_contactos",
            params=params,
            json={"es_principal": False},
            prefer="return=minimal",
            organizacion_id=organizacion_id,
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError("proveedor_contacto_principal_clear_failed")

    async def list_proveedor_cuentas_bancarias(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID | None = None,
        include_inactive: bool = False,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "es_principal.desc,activo.desc,banco_nombre.asc,alias.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if proveedor_id is not None:
            params["proveedor_id"] = f"eq.{proveedor_id}"
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/proveedor_cuentas_bancarias", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar proveedor_cuentas_bancarias: {data!r}")
        return data

    async def create_proveedor_cuenta_bancaria(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        if body.get("es_principal"):
            await self.clear_proveedor_cuentas_bancarias_principal(
                organizacion_id=organizacion_id,
                proveedor_id=UUID(str(body["proveedor_id"])),
            )
        resp = await self._request(
            "POST",
            "/rest/v1/proveedor_cuentas_bancarias",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_cuenta_bancaria_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear proveedor_cuenta_bancaria: {row!r}")
        return row

    async def update_proveedor_cuenta_bancaria(
        self,
        *,
        organizacion_id: UUID,
        cuenta_bancaria_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        proveedor_id = payload.get("proveedor_id")
        if payload.get("es_principal") and proveedor_id:
            await self.clear_proveedor_cuentas_bancarias_principal(
                organizacion_id=organizacion_id,
                proveedor_id=UUID(str(proveedor_id)),
                exclude_id=cuenta_bancaria_id,
            )
        resp = await self._request(
            "PATCH",
            f"/rest/v1/proveedor_cuentas_bancarias?id=eq.{cuenta_bancaria_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_cuenta_bancaria_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar proveedor_cuenta_bancaria: {row!r}")
        return row

    async def delete_proveedor_cuenta_bancaria(
        self,
        *,
        organizacion_id: UUID,
        cuenta_bancaria_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/proveedor_cuentas_bancarias?id=eq.{cuenta_bancaria_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("proveedor_cuenta_bancaria_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar proveedor_cuenta_bancaria: {row!r}")
        return row

    async def clear_proveedor_cuentas_bancarias_principal(
        self,
        *,
        organizacion_id: UUID,
        proveedor_id: UUID,
        exclude_id: UUID | None = None,
    ) -> None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "proveedor_id": f"eq.{proveedor_id}",
            "es_principal": "eq.true",
            "activo": "eq.true",
        }
        if exclude_id is not None:
            params["id"] = f"neq.{exclude_id}"
        resp = await self._request(
            "PATCH",
            "/rest/v1/proveedor_cuentas_bancarias",
            params=params,
            json={"es_principal": False},
            prefer="return=minimal",
            organizacion_id=organizacion_id,
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError("proveedor_cuenta_bancaria_principal_clear_failed")

    async def list_inventario_existencias(
        self,
        *,
        organizacion_id: UUID,
        almacen_id: UUID | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "almacen_id.asc,catalog_item_id.asc",
            "limit": str(max(1, min(limit, 5000))),
            "select": (
                "id,organizacion_id,catalog_item_id,almacen_id,stock_actual,stock_reservado,stock_disponible,"
                "stock_minimo,stock_objetivo,costo_ultimo,costo_promedio,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,codigo,unidad,activo,maneja_inventario),"
                "almacen:almacenes(id,codigo,nombre,tipo,activo,es_principal)"
            ),
        }
        if almacen_id is not None:
            params["almacen_id"] = f"eq.{almacen_id}"
        resp = await self._request("GET", "/rest/v1/inventario_existencias", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar existencias: {data!r}")
        return data

    async def get_inventario_existencia(
        self,
        *,
        organizacion_id: UUID,
        catalog_item_id: UUID,
        almacen_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "catalog_item_id": f"eq.{catalog_item_id}",
            "almacen_id": f"eq.{almacen_id}",
            "limit": "1",
            "select": (
                "id,organizacion_id,catalog_item_id,almacen_id,stock_actual,stock_reservado,stock_disponible,"
                "stock_minimo,stock_objetivo,costo_ultimo,costo_promedio,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,codigo,unidad,activo,maneja_inventario),"
                "almacen:almacenes(id,codigo,nombre,tipo,activo,es_principal)"
            ),
        }
        resp = await self._request("GET", "/rest/v1/inventario_existencias", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar existencia: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta invalida al buscar existencia: {row!r}")
        return row

    async def adjust_inventario(
        self,
        *,
        organizacion_id: UUID,
        catalog_item_id: UUID,
        almacen_id: UUID,
        sentido: str,
        cantidad: float,
        motivo: str | None = None,
        creado_por: UUID | None = None,
    ) -> UUID:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_catalog_item_id": str(catalog_item_id),
            "p_almacen_id": str(almacen_id),
            "p_sentido": sentido,
            "p_cantidad": cantidad,
            "p_motivo": motivo,
            "p_creado_por": str(creado_por) if creado_por else None,
        }
        result = await self._rpc("crm_ajustar_inventario", body)
        if isinstance(result, dict):
            movement_id = result.get("crm_ajustar_inventario")
            if movement_id:
                return UUID(str(movement_id))
            for value in result.values():
                if isinstance(value, str):
                    try:
                        return UUID(value)
                    except ValueError:
                        continue
        if isinstance(result, str):
            return UUID(result)
        raise CRMRepositoryError(f"Respuesta inesperada al ajustar inventario: {result!r}")

    async def reserve_quote_inventory(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
        almacen_id: UUID,
        items: list[dict[str, Any]],
        creado_por: UUID | None = None,
    ) -> None:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_quote_id": str(quote_id),
            "p_almacen_id": str(almacen_id),
            "p_items": items,
            "p_creado_por": str(creado_por) if creado_por else None,
        }
        result = await self._rpc("crm_reservar_inventario_cotizacion", body)
        if isinstance(result, dict) and result.get("error"):
            raise CRMRepositoryError(str(result["error"]))

    async def release_quote_inventory(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
        liberado_por: UUID | None = None,
    ) -> None:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_quote_id": str(quote_id),
            "p_liberado_por": str(liberado_por) if liberado_por else None,
        }
        result = await self._rpc("crm_liberar_inventario_cotizacion", body)
        if isinstance(result, dict) and result.get("error"):
            raise CRMRepositoryError(str(result["error"]))

    async def list_ordenes_compra(
        self,
        *,
        organizacion_id: UUID,
        include_closed: bool = True,
        limit: int = 100,
        offset: int = 0,
        lite: bool = False,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "fecha_emision.desc",
            "limit": str(max(1, min(limit, 5000))),
            "offset": str(max(0, offset)),
        }
        if search:
            sanitized = _sanitize_search_pattern(search)
            if sanitized:
                params["or"] = (
                    f"(folio.ilike.*{sanitized}*,referencia_externa.ilike.*{sanitized}*,observaciones.ilike.*{sanitized}*)"
                )
        if lite:
            params["select"] = (
                "id,organizacion_id,folio,proveedor_id,almacen_destino_id,estado,fecha_emision,fecha_entrega_estimada,"
                "moneda,tipo_operacion,tipo_cambio_referencia,subtotal,descuento_total,impuestos_total,total,"
                "enviada_por_usuario_id,enviada_en,aprobado_por_usuario_id,aprobada_en,referencia_externa,observaciones,"
                "creado_en,actualizado_en,"
                "proveedor:proveedores(id,codigo_proveedor,razon_social,nombre_comercial,activo),"
                "almacen:almacenes(id,codigo,nombre,activo,es_principal),"
                "enviada_por_usuario:usuarios!ordenes_compra_enviada_por_usuario_id_fkey(id,nombre_completo,correo),"
                "aprobado_por_usuario:usuarios!ordenes_compra_aprobado_por_usuario_id_fkey(id,nombre_completo,correo)"
            )
        else:
            params["select"] = (
            "id,organizacion_id,folio,proveedor_id,almacen_destino_id,estado,fecha_emision,fecha_entrega_estimada,"
                "moneda,tipo_operacion,tipo_cambio_referencia,vigencia_hasta,proforma_referencia,"
                "subtotal,descuento_total,impuestos_total,total,solicitado_por_usuario_id,aprobado_por_usuario_id,"
                "enviada_por_usuario_id,enviada_en,aprobada_en,"
                "referencia_externa,observaciones,instrucciones_entrega,creado_en,actualizado_en,"
                "proveedor:proveedores(id,codigo_proveedor,razon_social,nombre_comercial,activo),"
                "almacen:almacenes(id,codigo,nombre,activo,es_principal),"
                "enviada_por_usuario:usuarios!ordenes_compra_enviada_por_usuario_id_fkey(id,nombre_completo,correo),"
                "aprobado_por_usuario:usuarios!ordenes_compra_aprobado_por_usuario_id_fkey(id,nombre_completo,correo),"
                "condiciones_comerciales:ordenes_compra_condiciones_comerciales("
                "id,orden_compra_id,incoterm_codigo,incoterm_version,lugar_incoterm,responsable_flete,responsable_seguro,"
                "responsable_despacho_exportacion,responsable_despacho_importacion,responsable_impuestos_importacion,"
                "permite_embarques_parciales,permite_transbordos,gastos_bancarios,observaciones,creado_en,actualizado_en"
                "),"
                "condiciones_pago:ordenes_compra_condiciones_pago("
                "id,orden_compra_id,forma_pago,moneda_pago,porcentaje_anticipo,monto_anticipo,porcentaje_saldo,monto_saldo,"
                "momento_pago_saldo,dias_credito,comisiones_bancarias,observaciones,creado_en,actualizado_en"
                "),"
                "pagos_programados:ordenes_compra_pagos_programados("
                "id,organizacion_id,orden_compra_id,tipo_pago,evento_base,porcentaje,monto,moneda_codigo,tipo_cambio_aplicado,monto_mxn,dias_credito,"
                "fecha_vencimiento_calculada,fecha_evento_real,fecha_pago_real,referencia_pago,estado,observaciones,creado_en,actualizado_en"
                "),"
                "logistica:ordenes_compra_logistica("
                "id,orden_compra_id,modo_transporte_codigo,fecha_requerida_embarque,fecha_estimada_embarque,fecha_estimada_arribo,"
                "puerto_origen,puerto_destino,aeropuerto_origen,aeropuerto_destino,lugar_entrega_final,direccion_entrega,"
                "tipo_embarque,tipo_contenedor,forwarder_nombre,numero_booking,numero_bl_awb,tracking,peso_neto_total,"
                "peso_bruto_total,volumen_total_cbm,cantidad_bultos,tipo_empaque,marcas_embarque,requiere_seguro,monto_asegurado,"
                "observaciones,creado_en,actualizado_en"
                "),"
                "documentos:ordenes_compra_documentos("
                "id,orden_compra_id,tipo_documento,obligatorio,estado,fecha_limite,archivo_id,observaciones,creado_en,actualizado_en,"
                "archivo:archivos(id,storage_path,nombre_original,content_type,metadata,subido_en)"
                "),"
                "items:ordenes_compra_items("
                "id,orden_compra_id,catalog_item_id,proveedor_item_id,numero_partida,descripcion,marca,modelo,fabricante,"
                "pais_origen_codigo_iso2,pais_procedencia_codigo_iso2,fraccion_arancelaria,hs_code,nico,cantidad_solicitada,cantidad_recibida,"
                "unidad,costo_unitario,descuento_porcentaje,subtotal,impuestos,total,peso_neto,peso_bruto,volumen_cbm,"
                "lote,numero_serie,fecha_caducidad,observaciones,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,tipo,unidad,activo,maneja_inventario)"
                ")"
            )
        if not include_closed:
            params["estado"] = "in.(borrador,enviada,aprobada,parcial)"
        resp = await self._request("GET", "/rest/v1/ordenes_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar ordenes de compra: {data!r}")
        return data

    async def count_ordenes_compra(
        self,
        *,
        organizacion_id: UUID,
        include_closed: bool = True,
    ) -> int:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id",
            "limit": "1",
        }
        if not include_closed:
            params["estado"] = "in.(borrador,enviada,aprobada,parcial)"
        resp = await self._request(
            "GET",
            "/rest/v1/ordenes_compra",
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def get_orden_compra(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{orden_id}",
            "limit": "1",
            "select": (
            "id,organizacion_id,folio,proveedor_id,almacen_destino_id,estado,fecha_emision,fecha_entrega_estimada,"
                "moneda,tipo_operacion,tipo_cambio_referencia,vigencia_hasta,proforma_referencia,"
                "subtotal,descuento_total,impuestos_total,total,solicitado_por_usuario_id,aprobado_por_usuario_id,"
                "enviada_por_usuario_id,enviada_en,aprobada_en,"
                "referencia_externa,observaciones,instrucciones_entrega,creado_en,actualizado_en,"
                "proveedor:proveedores(id,codigo_proveedor,razon_social,nombre_comercial,activo),"
                "almacen:almacenes(id,codigo,nombre,activo,es_principal),"
                "enviada_por_usuario:usuarios!ordenes_compra_enviada_por_usuario_id_fkey(id,nombre_completo,correo),"
                "aprobado_por_usuario:usuarios!ordenes_compra_aprobado_por_usuario_id_fkey(id,nombre_completo,correo),"
                "condiciones_comerciales:ordenes_compra_condiciones_comerciales("
                "id,orden_compra_id,incoterm_codigo,incoterm_version,lugar_incoterm,responsable_flete,responsable_seguro,"
                "responsable_despacho_exportacion,responsable_despacho_importacion,responsable_impuestos_importacion,"
                "permite_embarques_parciales,permite_transbordos,gastos_bancarios,observaciones,creado_en,actualizado_en"
                "),"
                "condiciones_pago:ordenes_compra_condiciones_pago("
                "id,orden_compra_id,forma_pago,moneda_pago,porcentaje_anticipo,monto_anticipo,porcentaje_saldo,monto_saldo,"
                "momento_pago_saldo,dias_credito,comisiones_bancarias,observaciones,creado_en,actualizado_en"
                "),"
                "pagos_programados:ordenes_compra_pagos_programados("
                "id,organizacion_id,orden_compra_id,tipo_pago,evento_base,porcentaje,monto,moneda_codigo,tipo_cambio_aplicado,monto_mxn,dias_credito,"
                "fecha_vencimiento_calculada,fecha_evento_real,fecha_pago_real,referencia_pago,estado,observaciones,creado_en,actualizado_en"
                "),"
                "logistica:ordenes_compra_logistica("
                "id,orden_compra_id,modo_transporte_codigo,fecha_requerida_embarque,fecha_estimada_embarque,fecha_estimada_arribo,"
                "puerto_origen,puerto_destino,aeropuerto_origen,aeropuerto_destino,lugar_entrega_final,direccion_entrega,"
                "tipo_embarque,tipo_contenedor,forwarder_nombre,numero_booking,numero_bl_awb,tracking,peso_neto_total,"
                "peso_bruto_total,volumen_total_cbm,cantidad_bultos,tipo_empaque,marcas_embarque,requiere_seguro,monto_asegurado,"
                "observaciones,creado_en,actualizado_en"
                "),"
                "documentos:ordenes_compra_documentos("
                "id,orden_compra_id,tipo_documento,obligatorio,estado,fecha_limite,archivo_id,observaciones,creado_en,actualizado_en,"
                "archivo:archivos(id,storage_path,nombre_original,content_type,metadata,subido_en)"
                "),"
                "items:ordenes_compra_items("
                "id,orden_compra_id,catalog_item_id,proveedor_item_id,numero_partida,descripcion,marca,modelo,fabricante,"
                "pais_origen_codigo_iso2,pais_procedencia_codigo_iso2,fraccion_arancelaria,hs_code,nico,cantidad_solicitada,cantidad_recibida,"
                "unidad,costo_unitario,descuento_porcentaje,subtotal,impuestos,total,peso_neto,peso_bruto,volumen_cbm,"
                "lote,numero_serie,fecha_caducidad,observaciones,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,tipo,unidad,activo,maneja_inventario)"
                ")"
            ),
        }
        resp = await self._request("GET", "/rest/v1/ordenes_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar orden de compra: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta invalida al buscar orden de compra: {row!r}")
        return row

    async def create_almacen(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        code = str(body.get("codigo") or "").strip()
        if not code:
            existing = await self.list_almacenes(
                organizacion_id=organizacion_id,
                include_inactive=True,
                limit=5000,
            )
            code = _next_sequential_code("AL-", [row.get("codigo") for row in existing])
        body["codigo"] = code
        resp = await self._request(
            "POST",
            "/rest/v1/almacenes",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("almacen_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear almacén: {row!r}")
        return row

    async def update_almacen(
        self,
        *,
        organizacion_id: UUID,
        almacen_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/almacenes?id=eq.{almacen_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("almacen_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar almacén: {row!r}")
        return row

    async def delete_almacen(
        self,
        *,
        organizacion_id: UUID,
        almacen_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/almacenes?id=eq.{almacen_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("almacen_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar almacén: {row!r}")
        return row

    async def list_agentes_aduanales(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "activo.desc,nombre.asc",
            "limit": str(max(1, min(limit, 5000))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        resp = await self._request("GET", "/rest/v1/agentes_aduanales", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar agentes aduanales: {data!r}")
        return data

    async def create_agente_aduanal(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/agentes_aduanales",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("agente_aduanal_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear agente aduanal: {row!r}")
        return row

    async def update_agente_aduanal(
        self,
        *,
        organizacion_id: UUID,
        agente_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/agentes_aduanales?id=eq.{agente_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("agente_aduanal_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar agente aduanal: {row!r}")
        return row

    async def delete_agente_aduanal(
        self,
        *,
        organizacion_id: UUID,
        agente_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/agentes_aduanales?id=eq.{agente_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("agente_aduanal_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar agente aduanal: {row!r}")
        return row

    async def list_pedimentos_importacion(
        self,
        *,
        organizacion_id: UUID,
        include_cancelled: bool = False,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "fecha_pedimento.desc,creado_en.desc",
            "limit": str(max(1, min(limit, 5000))),
                "select": (
                "id,organizacion_id,numero_pedimento,embarque,agente_aduanal_id,estado,fecha_pedimento,fecha_presentacion,"
                "fecha_liberacion,moneda,tipo_cambio,subtotal_aduanal,gastos_pedimento_total,gastos_ordenes_total,"
                "costo_total_prorrateable,observaciones,creado_en,actualizado_en,"
                "agente_aduanal:agentes_aduanales(id,nombre,patente,razon_social,rfc,contacto,telefono,email,direccion,activo,observaciones,creado_en,actualizado_en),"
                "ordenes_compra:pedimentos_importacion_ordenes_compra(id,pedimento_id,orden_compra_id,rol,observaciones,creado_en,actualizado_en)"
            ),
        }
        if not include_cancelled:
            params["estado"] = "neq.cancelado"
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar pedimentos de importacion: {data!r}")
        return data

    async def get_pedimento_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{pedimento_id}",
            "limit": "1",
                "select": (
                "id,organizacion_id,numero_pedimento,embarque,agente_aduanal_id,estado,fecha_pedimento,fecha_presentacion,"
                "fecha_liberacion,moneda,tipo_cambio,subtotal_aduanal,gastos_pedimento_total,gastos_ordenes_total,"
                "costo_total_prorrateable,observaciones,creado_en,actualizado_en,"
                "agente_aduanal:agentes_aduanales(id,nombre,patente,razon_social,rfc,contacto,telefono,email,direccion,activo,observaciones,creado_en,actualizado_en)"
            ),
        }
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar pedimento de importacion: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta invalida al buscar pedimento de importacion: {row!r}")
        return row

    async def create_pedimento_importacion(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        if "moneda" in body and isinstance(body["moneda"], str):
            body["moneda"] = body["moneda"].upper()
        resp = await self._request(
            "POST",
            "/rest/v1/pedimentos_importacion",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_importacion_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear pedimento de importacion: {row!r}")
        return row

    async def update_pedimento_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = dict(payload)
        if "moneda" in body and isinstance(body["moneda"], str):
            body["moneda"] = body["moneda"].upper()
        resp = await self._request(
            "PATCH",
            f"/rest/v1/pedimentos_importacion?id=eq.{pedimento_id}",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_importacion_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar pedimento de importacion: {row!r}")
        return row

    async def delete_pedimento_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/pedimentos_importacion?id=eq.{pedimento_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_importacion_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar pedimento de importacion: {row!r}")
        return row

    async def list_pedimento_ordenes_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "pedimento_id": f"eq.{pedimento_id}",
            "order": "creado_en.asc",
            "select": (
                "id,organizacion_id,pedimento_id,orden_compra_id,rol,observaciones,creado_en,actualizado_en,"
                "orden_compra:ordenes_compra(id,folio,estado,tipo_operacion,moneda,subtotal,total,proveedor_id,almacen_destino_id,creado_en,actualizado_en)"
            ),
        }
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion_ordenes_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar ordenes del pedimento: {data!r}")
        return data

    async def attach_pedimento_orden_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {
            "organizacion_id": str(organizacion_id),
            "pedimento_id": str(pedimento_id),
            **payload,
        }
        if "orden_compra_id" in body:
            body["orden_compra_id"] = str(body["orden_compra_id"])
        resp = await self._request(
            "POST",
            "/rest/v1/pedimentos_importacion_ordenes_compra",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_orden_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al ligar orden al pedimento: {row!r}")
        return row

    async def detach_pedimento_orden_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        orden_compra_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/pedimentos_importacion_ordenes_compra?pedimento_id=eq.{pedimento_id}&orden_compra_id=eq.{orden_compra_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_orden_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al desligar orden del pedimento: {row!r}")
        return row

    async def list_pedimentos_importacion_por_orden_compra(
        self,
        *,
        organizacion_id: UUID,
        orden_compra_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "orden_compra_id": f"eq.{orden_compra_id}",
            "select": "pedimento_id,pedimento:pedimentos_importacion(id,organizacion_id,numero_pedimento,estado,fecha_pedimento,moneda,tipo_cambio,gastos_pedimento_total,gastos_ordenes_total,costo_total_prorrateable,actualizado_en)",
        }
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion_ordenes_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar pedimentos por orden: {data!r}")
        return data

    async def recalcular_pedimento_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> None:
        await self._rpc(
            "crm_recalcular_pedimento_importacion",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_pedimento_id": str(pedimento_id),
            },
        )

    async def list_pedimento_gastos_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "pedimento_id": f"eq.{pedimento_id}",
            "order": "fecha_gasto.desc,creado_en.desc",
            "select": (
                "id,organizacion_id,pedimento_id,agente_aduanal_id,tipo_gasto,descripcion,monto,moneda,tipo_cambio,"
                "monto_mxn,fecha_gasto,referencia_factura,archivo_id,estado,observaciones,creado_en,actualizado_en,"
                "agente_aduanal:agentes_aduanales(id,nombre,patente,razon_social,rfc,contacto,telefono,email,direccion,activo,observaciones,creado_en,actualizado_en)"
            ),
        }
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion_gastos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar gastos de pedimento: {data!r}")
        return data

    async def create_pedimento_gasto_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {
            "organizacion_id": str(organizacion_id),
            "pedimento_id": str(pedimento_id),
            **payload,
        }
        if "agente_aduanal_id" in body and body["agente_aduanal_id"] is not None:
            body["agente_aduanal_id"] = str(body["agente_aduanal_id"])
        if "moneda" in body and isinstance(body["moneda"], str):
            body["moneda"] = body["moneda"].upper()
        resp = await self._request(
            "POST",
            "/rest/v1/pedimentos_importacion_gastos",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_gasto_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear gasto de pedimento: {row!r}")
        return row

    async def update_pedimento_gasto_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        gasto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = dict(payload)
        if "agente_aduanal_id" in body and body["agente_aduanal_id"] is not None:
            body["agente_aduanal_id"] = str(body["agente_aduanal_id"])
        if "moneda" in body and isinstance(body["moneda"], str):
            body["moneda"] = body["moneda"].upper()
        resp = await self._request(
            "PATCH",
            f"/rest/v1/pedimentos_importacion_gastos?id=eq.{gasto_id}&pedimento_id=eq.{pedimento_id}",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_gasto_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar gasto de pedimento: {row!r}")
        return row

    async def delete_pedimento_gasto_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
        gasto_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/pedimentos_importacion_gastos?id=eq.{gasto_id}&pedimento_id=eq.{pedimento_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("pedimento_gasto_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar gasto de pedimento: {row!r}")
        return row

    async def list_pedimento_prorrateos_importacion(
        self,
        *,
        organizacion_id: UUID,
        pedimento_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "pedimento_id": f"eq.{pedimento_id}",
            "order": "orden_compra_id.asc,orden_compra_item_id.asc",
            "select": (
                "id,organizacion_id,pedimento_id,orden_compra_id,orden_compra_item_id,base_prorrateo,base_item,base_total,base_item_mxn,base_total_mxn,"
                "porcentaje_prorrateo,costo_pedimento_asignado,costo_orden_asignado,costo_total_asignado,costo_unitario_adicional,"
                "observaciones,creado_en,actualizado_en,"
                "orden_compra:ordenes_compra(id,folio,estado,tipo_operacion,moneda,tipo_cambio_referencia,subtotal,total),"
                "orden_compra_item:ordenes_compra_items(id,numero_partida,descripcion,cantidad_solicitada,cantidad_recibida,unidad,costo_unitario,subtotal,total)"
            ),
        }
        resp = await self._request("GET", "/rest/v1/pedimentos_importacion_prorrateos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar prorrateos de pedimento: {data!r}")
        return data

    async def list_ordenes_compra_para_recepcion(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        data = await self.list_ordenes_compra(
            organizacion_id=organizacion_id,
            include_closed=False,
            limit=limit,
            offset=offset,
        )
        return data

    async def list_incoterms(
        self,
        *,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "activo": "eq.true",
            "order": "codigo.asc",
            "limit": str(max(1, min(limit, 1000))),
        }
        resp = await self._request("GET", "/rest/v1/incoterms", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar incoterms: {data!r}")
        return data

    async def list_monedas(
        self,
        *,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "activo": "eq.true",
            "order": "codigo.asc",
            "limit": str(max(1, min(limit, 1000))),
        }
        resp = await self._request("GET", "/rest/v1/monedas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar monedas: {data!r}")
        return data

    async def list_modos_transporte(
        self,
        *,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "activo": "eq.true",
            "order": "codigo.asc",
            "limit": str(max(1, min(limit, 1000))),
        }
        resp = await self._request("GET", "/rest/v1/modos_transporte", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar modos de transporte: {data!r}")
        return data

    async def list_geo_paises(
        self,
        *,
        limit: int = 250,
    ) -> list[dict[str, Any]]:
        params = {
            "activo": "eq.true",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 2000))),
        }
        resp = await self._request("GET", "/rest/v1/geo_paises", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar paises: {data!r}")
        return data

    async def create_orden_compra(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> UUID:
        condiciones_comerciales = payload.get("condiciones_comerciales")
        if isinstance(condiciones_comerciales, dict):
            condiciones_comerciales = dict(condiciones_comerciales)
            for key in (
                "responsable_flete",
                "responsable_seguro",
                "responsable_despacho_exportacion",
                "responsable_despacho_importacion",
                "responsable_impuestos_importacion",
            ):
                condiciones_comerciales[key] = _normalize_trade_responsibility(condiciones_comerciales.get(key))

        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_proveedor_id": payload.get("proveedor_id"),
            "p_almacen_destino_id": payload.get("almacen_destino_id"),
            "p_folio": payload.get("folio"),
            "p_fecha_emision": payload.get("fecha_emision"),
            "p_fecha_entrega_estimada": payload.get("fecha_entrega_estimada"),
            "p_moneda": payload.get("moneda"),
            "p_tipo_operacion": payload.get("tipo_operacion"),
            "p_tipo_cambio_referencia": payload.get("tipo_cambio_referencia"),
            "p_vigencia_hasta": payload.get("vigencia_hasta"),
            "p_proforma_referencia": payload.get("proforma_referencia"),
            "p_solicitado_por_usuario_id": payload.get("solicitado_por_usuario_id"),
            "p_aprobado_por_usuario_id": payload.get("aprobado_por_usuario_id"),
            "p_referencia_externa": payload.get("referencia_externa"),
            "p_observaciones": payload.get("observaciones"),
            "p_instrucciones_entrega": payload.get("instrucciones_entrega"),
            "p_condiciones_comerciales": condiciones_comerciales,
            "p_condiciones_pago": payload.get("condiciones_pago"),
            "p_logistica": payload.get("logistica"),
            "p_documentos": payload.get("documentos"),
            "p_items": payload.get("items") or [],
        }
        result = await self._rpc("crm_crear_orden_compra", body)
        if isinstance(result, dict):
            order_id = result.get("crm_crear_orden_compra")
            if order_id:
                return UUID(str(order_id))
            for value in result.values():
                if isinstance(value, str):
                    try:
                        return UUID(value)
                    except ValueError:
                        continue
        if isinstance(result, str):
            return UUID(result)
        raise CRMRepositoryError(f"Respuesta inesperada al crear orden de compra: {result!r}")

    async def update_orden_compra_transactional(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        payload: dict[str, Any],
    ) -> UUID:
        condiciones_comerciales = payload.get("condiciones_comerciales")
        if isinstance(condiciones_comerciales, dict):
            condiciones_comerciales = dict(condiciones_comerciales)
            for key in (
                "responsable_flete",
                "responsable_seguro",
                "responsable_despacho_exportacion",
                "responsable_despacho_importacion",
                "responsable_impuestos_importacion",
            ):
                condiciones_comerciales[key] = _normalize_trade_responsibility(condiciones_comerciales.get(key))

        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_orden_id": str(orden_id),
            "p_proveedor_id": payload.get("proveedor_id"),
            "p_almacen_destino_id": payload.get("almacen_destino_id"),
            "p_folio": payload.get("folio"),
            "p_fecha_emision": payload.get("fecha_emision"),
            "p_fecha_entrega_estimada": payload.get("fecha_entrega_estimada"),
            "p_moneda": payload.get("moneda"),
            "p_tipo_operacion": payload.get("tipo_operacion"),
            "p_tipo_cambio_referencia": payload.get("tipo_cambio_referencia"),
            "p_vigencia_hasta": payload.get("vigencia_hasta"),
            "p_proforma_referencia": payload.get("proforma_referencia"),
            "p_solicitado_por_usuario_id": payload.get("solicitado_por_usuario_id"),
            "p_aprobado_por_usuario_id": payload.get("aprobado_por_usuario_id"),
            "p_referencia_externa": payload.get("referencia_externa"),
            "p_observaciones": payload.get("observaciones"),
            "p_instrucciones_entrega": payload.get("instrucciones_entrega"),
            "p_condiciones_comerciales": condiciones_comerciales,
            "p_condiciones_pago": payload.get("condiciones_pago"),
            "p_logistica": payload.get("logistica"),
            "p_documentos": payload.get("documentos"),
            "p_items": payload.get("items") or [],
        }
        result = await self._rpc("crm_actualizar_orden_compra", body)
        if isinstance(result, dict):
            order_id = result.get("crm_actualizar_orden_compra")
            if order_id:
                return UUID(str(order_id))
            for value in result.values():
                if isinstance(value, str):
                    try:
                        return UUID(value)
                    except ValueError:
                        continue
        if isinstance(result, str):
            return UUID(result)
        raise CRMRepositoryError(f"Respuesta inesperada al actualizar orden de compra: {result!r}")

    async def update_orden_compra(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            f"/rest/v1/ordenes_compra?id=eq.{orden_id}",
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("orden_compra_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar orden de compra: {row!r}")
        return row

    async def update_orden_compra_estado(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
        estado: str,
        usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"estado": estado}
        now_iso = datetime.now(timezone.utc).isoformat()
        if estado == "enviada":
            if usuario_id is not None:
                body["enviada_por_usuario_id"] = str(usuario_id)
            body["enviada_en"] = now_iso
        elif estado == "aprobada":
            if usuario_id is not None:
                body["aprobado_por_usuario_id"] = str(usuario_id)
            body["aprobada_en"] = now_iso
        resp = await self._request(
            "PATCH",
            f"/rest/v1/ordenes_compra?id=eq.{orden_id}",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("orden_compra_estado_not_updated")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar estado de orden de compra: {row!r}")
        return row

    async def delete_orden_compra(
        self,
        *,
        organizacion_id: UUID,
        orden_id: UUID,
    ) -> dict[str, Any]:
        resp = await self._request(
            "DELETE",
            f"/rest/v1/ordenes_compra?id=eq.{orden_id}",
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("orden_compra_not_deleted")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar orden de compra: {row!r}")
        return row

    async def list_recepciones_compra(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "recibido_en.desc",
            "limit": str(max(1, min(limit, 5000))),
            "select": (
                "id,organizacion_id,orden_compra_id,almacen_id,numero_recepcion,estado,recibido_por_usuario_id,"
                "recibido_en,referencia_externa,observaciones,creado_en,actualizado_en,"
                "orden_compra:ordenes_compra(id,folio,estado,proveedor_id,almacen_destino_id),"
                "almacen:almacenes(id,codigo,nombre),"
                "items:recepciones_compra_items("
                "id,recepcion_id,orden_compra_item_id,catalog_item_id,cantidad_recibida,costo_unitario_real,subtotal,"
                "lote_codigo,fecha_caducidad,serie,observaciones,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,unidad,tipo)"
                ")"
            ),
        }
        resp = await self._request("GET", "/rest/v1/recepciones_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar recepciones: {data!r}")
        return data

    async def count_recepciones_compra(
        self,
        *,
        organizacion_id: UUID,
    ) -> int:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/recepciones_compra",
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def get_recepcion_compra(
        self,
        *,
        organizacion_id: UUID,
        recepcion_id: UUID,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{recepcion_id}",
            "limit": "1",
            "select": (
                "id,organizacion_id,orden_compra_id,almacen_id,numero_recepcion,estado,recibido_por_usuario_id,"
                "recibido_en,referencia_externa,observaciones,creado_en,actualizado_en,"
                "orden_compra:ordenes_compra(id,folio,estado,proveedor_id,almacen_destino_id),"
                "almacen:almacenes(id,codigo,nombre),"
                "items:recepciones_compra_items("
                "id,recepcion_id,orden_compra_item_id,catalog_item_id,cantidad_recibida,costo_unitario_real,subtotal,"
                "lote_codigo,fecha_caducidad,serie,observaciones,creado_en,actualizado_en,"
                "catalog_item:catalog_items(id,slug,nombre,unidad,tipo)"
                ")"
            ),
        }
        resp = await self._request("GET", "/rest/v1/recepciones_compra", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar recepcion: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al buscar recepcion: {row!r}")
        return row

    async def register_recepcion_compra(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> UUID:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_orden_compra_id": payload.get("orden_compra_id"),
            "p_almacen_id": payload.get("almacen_id"),
            "p_numero_recepcion": payload.get("numero_recepcion"),
            "p_recibido_por_usuario_id": payload.get("recibido_por_usuario_id"),
            "p_referencia_externa": payload.get("referencia_externa"),
            "p_observaciones": payload.get("observaciones"),
            "p_items": payload.get("items") or [],
        }
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/registrar_recepcion_compra",
            json=body,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if isinstance(data, str):
            try:
                return UUID(data)
            except (TypeError, ValueError) as exc:
                raise CRMRepositoryError(f"Respuesta inválida al registrar recepcion: {data!r}") from exc
        if isinstance(data, dict):
            candidate = data.get("id") or data.get("recepcion_id")
            if candidate:
                try:
                    return UUID(str(candidate))
                except (TypeError, ValueError) as exc:
                    raise CRMRepositoryError(f"Respuesta inválida al registrar recepcion: {data!r}") from exc
        raise CRMRepositoryError(f"Respuesta inesperada al registrar recepcion: {data!r}")

    async def update_recepcion_compra(
        self,
        *,
        organizacion_id: UUID,
        recepcion_id: UUID,
        payload: dict[str, Any],
    ) -> UUID:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_recepcion_id": str(recepcion_id),
            "p_orden_compra_id": payload.get("orden_compra_id"),
            "p_almacen_id": payload.get("almacen_id"),
            "p_numero_recepcion": payload.get("numero_recepcion"),
            "p_recibido_por_usuario_id": payload.get("recibido_por_usuario_id"),
            "p_referencia_externa": payload.get("referencia_externa"),
            "p_observaciones": payload.get("observaciones"),
            "p_items": payload.get("items") or [],
        }
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/actualizar_recepcion_compra",
            json=body,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if isinstance(data, str):
            try:
                return UUID(data)
            except (TypeError, ValueError) as exc:
                raise CRMRepositoryError(f"Respuesta inválida al actualizar recepcion: {data!r}") from exc
        if isinstance(data, dict):
            candidate = data.get("id") or data.get("recepcion_id")
            if candidate:
                try:
                    return UUID(str(candidate))
                except (TypeError, ValueError) as exc:
                    raise CRMRepositoryError(f"Respuesta inválida al actualizar recepcion: {data!r}") from exc
        raise CRMRepositoryError(f"Respuesta inesperada al actualizar recepcion: {data!r}")

    async def delete_recepcion_compra(
        self,
        *,
        organizacion_id: UUID,
        recepcion_id: UUID,
    ) -> UUID:
        body = {
            "p_organizacion_id": str(organizacion_id),
            "p_recepcion_id": str(recepcion_id),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/eliminar_recepcion_compra",
            json=body,
            organizacion_id=organizacion_id,
        )
        data = resp.json()
        if isinstance(data, str):
            try:
                return UUID(data)
            except (TypeError, ValueError) as exc:
                raise CRMRepositoryError(f"Respuesta inválida al eliminar recepcion: {data!r}") from exc
        if isinstance(data, dict):
            candidate = data.get("id") or data.get("recepcion_id")
            if candidate:
                try:
                    return UUID(str(candidate))
                except (TypeError, ValueError) as exc:
                    raise CRMRepositoryError(f"Respuesta inválida al eliminar recepcion: {data!r}") from exc
        raise CRMRepositoryError(f"Respuesta inesperada al eliminar recepcion: {data!r}")

    async def soft_delete_catalog_item(
        self,
        *,
        item_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/catalog_items",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al archivar catálogo: {row!r}")
        return row

    async def personas_resumen(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        search: str | None = None,
        propietario: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        origen: str | None = None,
        captura: str | None = None,
        puesto: str | None = None,
        rol_decision: str | None = None,
        estado_contacto: str | None = None,
        ligado: str | None = None,
        tipo_cuenta: str | None = None,
        tamano: str | None = None,
        clasificacion: str | None = None,
        cuenta_from: datetime | None = None,
        cuenta_to: datetime | None = None,
        fecha_incorporacion_from: datetime | None = None,
        fecha_incorporacion_to: datetime | None = None,
        fusionada: str | None = None,
        pais: str | None = None,
        estado_direccion: str | None = None,
        municipio: str | None = None,
    ) -> dict[str, Any]:
        if not usuario_token:
            return {
                "total": 0,
                "completos": 0,
                "incompletos": 0,
                "activos": 0,
                "leads": 0,
                "webchat": 0,
                "propietarios": 0,
                "ultimo": None,
            }

        payload: dict[str, Any] = {}
        if date_from:
            payload["p_from"] = date_from.astimezone(timezone.utc).isoformat()
        if date_to:
            payload["p_to"] = date_to.astimezone(timezone.utc).isoformat()
        if propietario:
            payload["p_propietario"] = str(propietario)
        if search and search.strip():
            payload["p_search"] = search.strip()
        if origen and origen.strip():
            payload["p_origen"] = origen.strip()
        if puesto and puesto.strip():
            payload["p_puesto"] = puesto.strip()
        if rol_decision and rol_decision.strip():
            payload["p_rol_decision"] = rol_decision.strip()
        if estado_contacto and estado_contacto.strip():
            payload["p_estado_contacto"] = estado_contacto.strip()
        if ligado and ligado.strip():
            payload["p_ligado"] = ligado.strip()
        if tipo_cuenta and tipo_cuenta.strip():
            payload["p_tipo_cuenta"] = tipo_cuenta.strip()
        if tamano and tamano.strip():
            payload["p_tamano"] = tamano.strip()
        if clasificacion and clasificacion.strip():
            payload["p_clasificacion"] = clasificacion.strip()
        if cuenta_from:
            payload["p_cuenta_from"] = cuenta_from.astimezone(timezone.utc).isoformat()
        if cuenta_to:
            payload["p_cuenta_to"] = cuenta_to.astimezone(timezone.utc).isoformat()
        if fecha_incorporacion_from:
            payload["p_fecha_incorporacion_from"] = fecha_incorporacion_from.astimezone(timezone.utc).isoformat()
        if fecha_incorporacion_to:
            payload["p_fecha_incorporacion_to"] = fecha_incorporacion_to.astimezone(timezone.utc).isoformat()
        if fusionada and fusionada.strip():
            payload["p_fusionada"] = fusionada.strip()
        if pais and pais.strip():
            payload["p_pais"] = pais.strip()
        if estado_direccion and estado_direccion.strip():
            payload["p_estado_direccion"] = estado_direccion.strip()
        if municipio and municipio.strip():
            payload["p_municipio"] = municipio.strip()
        if organizacion_id is not None:
            payload["p_organizacion_id"] = str(organizacion_id)

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_contactos_resumen",
            token=usuario_token,
            json=payload,
        )
        data = resp.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError(f"Respuesta inesperada en personas_resumen: {data!r}")
        return data

    async def personas_list(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        limit: int = 200,
        offset: int = 0,
        search: str | None = None,
        estado: str | None = None,
        captura: str | None = None,
        origen: str | None = None,
        propietario: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        puesto: str | None = None,
        rol_decision: str | None = None,
        estado_contacto: str | None = None,
        ligado: str | None = None,
        tipo_cuenta: str | None = None,
        tamano: str | None = None,
        clasificacion: str | None = None,
        cuenta_from: datetime | None = None,
        cuenta_to: datetime | None = None,
        fecha_incorporacion_from: datetime | None = None,
        fecha_incorporacion_to: datetime | None = None,
        fusionada: str | None = None,
        pais: str | None = None,
        estado_direccion: str | None = None,
        municipio: str | None = None,
    ) -> list[dict[str, Any]]:
        body = {
            "p_limit": max(1, min(limit, 500)),
            "p_offset": max(0, offset),
            "p_order_by": "creado_en",
            "p_order_dir": "desc",
        }
        search_value = search.strip() if isinstance(search, str) and search.strip() else None
        estado_value = estado.strip() if isinstance(estado, str) and estado.strip() else None
        captura_value = captura.strip() if isinstance(captura, str) and captura.strip() else None
        origen_value = origen.strip() if isinstance(origen, str) and origen.strip() else None
        if search_value:
            body["p_search"] = search_value
        if estado_value:
            body["p_estado"] = estado_value
        if captura_value:
            body["p_captura"] = captura_value
        if origen_value:
            body["p_origen"] = origen_value
        if propietario:
            body["p_propietario"] = str(propietario)
        if date_from:
            body["p_from"] = date_from.astimezone(timezone.utc).isoformat()
        if date_to:
            body["p_to"] = date_to.astimezone(timezone.utc).isoformat()
        if puesto and puesto.strip():
            body["p_puesto"] = puesto.strip()
        if rol_decision and rol_decision.strip():
            body["p_rol_decision"] = rol_decision.strip()
        if estado_contacto and estado_contacto.strip():
            body["p_estado_contacto"] = estado_contacto.strip()
        if ligado and ligado.strip():
            body["p_ligado"] = ligado.strip()
        if tipo_cuenta and tipo_cuenta.strip():
            body["p_tipo_cuenta"] = tipo_cuenta.strip()
        if tamano and tamano.strip():
            body["p_tamano"] = tamano.strip()
        if clasificacion and clasificacion.strip():
            body["p_clasificacion"] = clasificacion.strip()
        if cuenta_from:
            body["p_cuenta_from"] = cuenta_from.astimezone(timezone.utc).isoformat()
        if cuenta_to:
            body["p_cuenta_to"] = cuenta_to.astimezone(timezone.utc).isoformat()
        if fecha_incorporacion_from:
            body["p_fecha_incorporacion_from"] = fecha_incorporacion_from.astimezone(timezone.utc).isoformat()
        if fecha_incorporacion_to:
            body["p_fecha_incorporacion_to"] = fecha_incorporacion_to.astimezone(timezone.utc).isoformat()
        if fusionada and fusionada.strip():
            body["p_fusionada"] = fusionada.strip()
        if pais and pais.strip():
            body["p_pais"] = pais.strip()
        if estado_direccion and estado_direccion.strip():
            body["p_estado_direccion"] = estado_direccion.strip()
        if municipio and municipio.strip():
            body["p_municipio"] = municipio.strip()
        if organizacion_id is not None:
            body["p_organizacion_id"] = str(organizacion_id)
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_contactos_list",
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en personas_list: {data!r}")
        return data

    async def contactos_list(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        limit: int = 200,
        offset: int = 0,
        search: str | None = None,
        estado: str | None = None,
        captura: str | None = None,
        origen: str | None = None,
        propietario: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        puesto: str | None = None,
        rol_decision: str | None = None,
        estado_contacto: str | None = None,
        ligado: str | None = None,
        tipo_cuenta: str | None = None,
        tamano: str | None = None,
        clasificacion: str | None = None,
        cuenta_from: datetime | None = None,
        cuenta_to: datetime | None = None,
        fecha_incorporacion_from: datetime | None = None,
        fecha_incorporacion_to: datetime | None = None,
        fusionada: str | None = None,
        pais: str | None = None,
        estado_direccion: str | None = None,
        municipio: str | None = None,
    ) -> list[dict[str, Any]]:
        return await self.personas_list(
            usuario_token=usuario_token,
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
            search=search,
            estado=estado,
            captura=captura,
            origen=origen,
            propietario=propietario,
            date_from=date_from,
            date_to=date_to,
            puesto=puesto,
            rol_decision=rol_decision,
            estado_contacto=estado_contacto,
            ligado=ligado,
            tipo_cuenta=tipo_cuenta,
            tamano=tamano,
            clasificacion=clasificacion,
            cuenta_from=cuenta_from,
            cuenta_to=cuenta_to,
            fecha_incorporacion_from=fecha_incorporacion_from,
            fecha_incorporacion_to=fecha_incorporacion_to,
            fusionada=fusionada,
            pais=pais,
            estado_direccion=estado_direccion,
            municipio=municipio,
        )

    async def inbox_summary(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_resumen_persisted",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_resumen: {data!r}")

    async def mark_inbox_thread_read(
        self,
        *,
        usuario_token: str,
        conversacion_id: UUID,
    ) -> int:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_mark_thread_read",
            token=usuario_token,
            json={"p_conversacion_id": str(conversacion_id)},
        )
        data = resp.json()
        if isinstance(data, int):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_mark_thread_read: {data!r}")

    async def inbox_threads(
        self,
        *,
        usuario_token: str,
        estado: str | None = None,
        asignado_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        message_limit: int = 20,
        source: str | None = None,
        channel: str | None = None,
        batch_id: UUID | None = None,
        campana_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict[str, Any]]:
        body = {
            "p_estado": estado,
            "p_asignado": str(asignado_id) if asignado_id else None,
            "p_limit": max(1, min(limit, 200)),
            "p_offset": max(0, offset),
            "p_message_limit": max(1, min(message_limit, 50)),
        }
        source_value = source.strip().lower() if isinstance(source, str) and source.strip() else None
        channel_value = channel.strip().lower() if isinstance(channel, str) and channel.strip() else None
        if source_value:
            body["p_source"] = source_value
        if channel_value:
            body["p_channel"] = channel_value
        if batch_id:
            body["p_batch_id"] = str(batch_id)
        if campana_id:
            body["p_campana_id"] = str(campana_id)
        if date_from:
            body["p_from"] = date_from.isoformat()
        if date_to:
            body["p_to"] = date_to.isoformat()
        rpc_name = "/rest/v1/rpc/panel_inbox_threads_persisted"
        resp = await self._request_with_user(
            "POST",
            rpc_name,
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_threads: {data!r}")
        return data

    async def inbox_filter_options(
        self,
        *,
        usuario_token: str,
        source: str | None = None,
        channel: str | None = None,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_source": source.strip().lower() if isinstance(source, str) and source.strip() else None,
            "p_channel": channel.strip().lower() if isinstance(channel, str) and channel.strip() else None,
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_filter_options_persisted",
            token=usuario_token,
            json=payload,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en inbox_filter_options: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def inbox_threads_debug(
        self,
        *,
        actor_user_id: UUID,
        estado: str | None = None,
        asignado_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        message_limit: int = 20,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_actor_user_id": str(actor_user_id),
            "p_estado": estado,
            "p_asignado": str(asignado_id) if asignado_id else None,
            "p_limit": max(1, min(limit, 200)),
            "p_offset": max(0, offset),
            "p_message_limit": max(1, min(message_limit, 50)),
        }
        data = await self._rpc("panel_inbox_threads_debug", payload)
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada en panel_inbox_threads_debug: {data!r}"
            )
        return data

    async def inbox_messages(
        self,
        *,
        usuario_token: str,
        conversacion_id: UUID,
        limit: int = 100,
        before: str | None = None,
    ) -> list[dict[str, Any]]:
        body: dict[str, Any] = {
            "p_conversacion_id": str(conversacion_id),
            "p_limit": max(1, min(limit, 500)),
        }
        if before:
            body["p_before"] = before
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_messages",
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_messages: {data!r}")
        return data

    async def visitas_dashboard_kpis(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if date_from:
            body["p_from"] = date_from.isoformat()
        if date_to:
            body["p_to"] = date_to.isoformat()
        if organizacion_id:
            body["p_organizacion"] = str(organizacion_id)
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/dashboard_kpis",
                token=usuario_token,
                json=body or None,
                prefer="return=representation",
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/dashboard_kpis",
                json=body or None,
                prefer="return=representation",
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        raise CRMRepositoryError(f"Respuesta inesperada en dashboard_kpis: {data!r}")

    async def visitas_estados(
        self,
        *,
        usuario_token: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_estados",
                token=usuario_token,
                json=payload or None,
                prefer="return=representation",
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_estados",
                json=payload or None,
                prefer="return=representation",
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada en panel_visitantes_sin_chat_estados: {data!r}"
        )

    async def visitas_municipios(
        self,
        *,
        state_code: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_estado": state_code}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_municipios",
                token=usuario_token,
                json=payload,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_municipios",
                json=payload,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada en panel_visitantes_sin_chat_municipios: {data!r}"
        )

    async def visitas_paises(
        self,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_world_paises",
                token=usuario_token,
                json=payload or None,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_world_paises",
                json=payload or None,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_visitantes_world_paises: {data!r}")

    async def leads_estados(
        self,
        *,
        channels: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if channels:
            payload["p_canales"] = ",".join(channels)
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_estados",
                token=usuario_token,
                json=payload or None,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_estados",
                json=payload or None,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_leads_geo_estados: {data!r}")

    async def leads_municipios(
        self,
        *,
        state_code: str,
        channels: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_estado": state_code}
        if channels:
            payload["p_canales"] = ",".join(channels)
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_municipios",
                token=usuario_token,
                json=payload,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_municipios",
                json=payload,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_leads_geo_municipios: {data!r}")

    async def analytics_catalog_sales(
        self,
        *,
        usuario_token: str,
        mes_desde: str | None = None,
        mes_hasta: str | None = None,
        moneda: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "mes,catalog_item_id,item_nombre,moneda,total_vendido,unidades_vendidas,leads_ganados",
            "order": "mes.asc,item_nombre.asc",
        }
        if mes_desde and mes_hasta:
            params["and"] = f"(mes.gte.{mes_desde},mes.lte.{mes_hasta})"
        elif mes_desde:
            params["mes"] = f"gte.{mes_desde}"
        elif mes_hasta:
            params["mes"] = f"lte.{mes_hasta}"
        if moneda:
            params["moneda"] = f"eq.{moneda.upper()}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/ventas_por_producto_mes",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en ventas_por_producto_mes: {data!r}")

    async def analytics_catalog_pipeline(
        self,
        *,
        usuario_token: str,
        tablero_id: UUID | None = None,
        etapa_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "tablero_id,etapa_id,catalog_item_id,item_nombre,moneda,monto_estimado,leads_con_cotizacion",
        }
        if tablero_id:
            params["tablero_id"] = f"eq.{tablero_id}"
        if etapa_id:
            params["etapa_id"] = f"eq.{etapa_id}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/embudo_por_producto",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en embudo_por_producto: {data!r}")

    async def _fetch_openai_cost_view(
        self,
        *,
        view_name: str,
        usuario_token: str,
        select: str,
        params: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        base_params: dict[str, str] = {
            "select": select,
        }
        if params:
            base_params.update(params)
        resp = await self._request_with_user(
            "GET",
            f"/rest/v1/{view_name}",
            token=usuario_token,
            params=base_params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en {view_name}: {data!r}")

    async def openai_costs_daily(
        self,
        *,
        usuario_token: str,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        model_family: str | None = None,
        project_key: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_date.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if date_from:
            and_parts.append(f"usage_date.gte.{date_from}")
        if date_to:
            and_parts.append(f"usage_date.lte.{date_to}")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if model_family:
            params["openai_model_family"] = f"eq.{model_family}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        return await self._fetch_openai_cost_view(
            view_name="v_openai_costs_daily",
            usuario_token=usuario_token,
            select=(
                "usage_date,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,requests_count,conversations_count,input_tokens,"
                "cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,"
                "avg_latency_ms,p50_latency_ms,p90_latency_ms,fallback_count,quality_retry_count,"
                "missing_pricing_count"
            ),
            params=params,
        )

    async def openai_costs_by_conversation(
        self,
        *,
        usuario_token: str,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return await self._fetch_openai_conversation_costs_rpc(
            usuario_token=usuario_token,
            date_from=date_from,
            date_to=date_to,
            channel=channel,
            feature=feature,
            project_key=project_key,
            limit=limit,
        )

    async def _fetch_openai_conversation_costs_rpc(
        self,
        *,
        usuario_token: str | None = None,
        tenant_id: UUID | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_date_from": date_from,
            "p_date_to": date_to,
            "p_channel": channel,
            "p_feature": feature,
            "p_project_key": project_key,
            "p_organizacion_id": str(tenant_id) if tenant_id else None,
            "p_limit": max(1, min(limit, 500)),
        }
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/openai_costs_by_conversation_filtered",
                token=usuario_token,
                json=payload,
            )
        else:
            resp = await self._request_service_role(
                "POST",
                "/rest/v1/rpc/openai_costs_by_conversation_filtered",
                json=payload,
            )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en openai_costs_by_conversation_filtered: {data!r}")

    async def openai_costs_by_model(
        self,
        *,
        usuario_token: str,
        month_from: str | None = None,
        month_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        return await self._fetch_openai_cost_view(
            view_name="v_openai_costs_by_model",
            usuario_token=usuario_token,
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,requests_count,input_tokens,cached_input_tokens,"
                "output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,avg_latency_ms,"
                "fallback_count,quality_retry_count"
            ),
            params=params,
        )

    async def openai_costs_by_project(
        self,
        *,
        usuario_token: str,
        month_from: str | None = None,
        month_to: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        return await self._fetch_openai_cost_view(
            view_name="v_openai_costs_by_project",
            usuario_token=usuario_token,
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,openai_project_key,openai_project_display_name,"
                "requests_count,conversations_count,models_count,input_tokens,cached_input_tokens,"
                "output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,avg_latency_ms,"
                "fallback_count,quality_retry_count,missing_pricing_count"
            ),
            params=params,
        )

    async def openai_costs_by_assistant(
        self,
        *,
        usuario_token: str,
        month_from: str | None = None,
        month_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
        assistant_kind: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        if assistant_kind:
            params["assistant_kind"] = f"eq.{assistant_kind}"
        return await self._fetch_openai_cost_view(
            view_name="v_openai_costs_by_assistant",
            usuario_token=usuario_token,
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,assistant_kind,assistant_ref,assistant_display_name,requests_count,"
                "conversations_count,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,"
                "total_tokens,estimated_total_cost_usd,avg_latency_ms,fallback_count,quality_retry_count,"
                "missing_pricing_count"
            ),
            params=params,
        )

    async def _fetch_openai_cost_view_service_role(
        self,
        *,
        view_name: str,
        select: str,
        params: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        base_params: dict[str, str] = {
            "select": select,
        }
        if params:
            base_params.update(params)
        resp = await self._request_service_role(
            "GET",
            f"/rest/v1/{view_name}",
            params=base_params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en {view_name}: {data!r}")

    async def master_openai_costs_daily(
        self,
        *,
        tenant_id: UUID | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        model_family: str | None = None,
        project_key: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_date.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if date_from:
            and_parts.append(f"usage_date.gte.{date_from}")
        if date_to:
            and_parts.append(f"usage_date.lte.{date_to}")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if tenant_id:
            params["organizacion_id"] = f"eq.{tenant_id}"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if model_family:
            params["openai_model_family"] = f"eq.{model_family}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_costs_daily",
            select=(
                "usage_date,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,requests_count,conversations_count,input_tokens,"
                "cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,"
                "avg_latency_ms,p50_latency_ms,p90_latency_ms,fallback_count,quality_retry_count,"
                "missing_pricing_count"
            ),
            params=params,
        )

    async def master_openai_costs_by_conversation(
        self,
        *,
        tenant_id: UUID | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return await self._fetch_openai_conversation_costs_rpc(
            tenant_id=tenant_id,
            date_from=date_from,
            date_to=date_to,
            channel=channel,
            feature=feature,
            project_key=project_key,
            limit=limit,
        )

    async def master_openai_costs_by_model(
        self,
        *,
        tenant_id: UUID | None = None,
        month_from: str | None = None,
        month_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if tenant_id:
            params["organizacion_id"] = f"eq.{tenant_id}"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_costs_by_model",
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,requests_count,input_tokens,cached_input_tokens,"
                "output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,avg_latency_ms,"
                "fallback_count,quality_retry_count"
            ),
            params=params,
        )

    async def master_openai_costs_by_project(
        self,
        *,
        tenant_id: UUID | None = None,
        month_from: str | None = None,
        month_to: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if tenant_id:
            params["organizacion_id"] = f"eq.{tenant_id}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_costs_by_project",
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,openai_project_key,openai_project_display_name,"
                "requests_count,conversations_count,models_count,input_tokens,cached_input_tokens,"
                "output_tokens,reasoning_tokens,total_tokens,estimated_total_cost_usd,avg_latency_ms,"
                "fallback_count,quality_retry_count,missing_pricing_count"
            ),
            params=params,
        )

    async def master_openai_costs_by_assistant(
        self,
        *,
        tenant_id: UUID | None = None,
        month_from: str | None = None,
        month_to: str | None = None,
        channel: str | None = None,
        feature: str | None = None,
        project_key: str | None = None,
        assistant_kind: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_month.desc,estimated_total_cost_usd.desc",
        }
        and_parts: list[str] = []
        if month_from:
            and_parts.append(f"usage_month.gte.{month_from}T00:00:00+00:00")
        if month_to:
            and_parts.append(f"usage_month.lte.{month_to}T23:59:59+00:00")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if tenant_id:
            params["organizacion_id"] = f"eq.{tenant_id}"
        if channel:
            params["channel"] = f"eq.{channel}"
        if feature:
            params["feature"] = f"eq.{feature}"
        if project_key:
            params["openai_project_key"] = f"eq.{project_key}"
        if assistant_kind:
            params["assistant_kind"] = f"eq.{assistant_kind}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_costs_by_assistant",
            select=(
                "usage_month,organizacion_id,organizacion_nombre,source_tenant_mode,channel,feature,"
                "openai_project_key,openai_project_display_name,openai_model_family,assistant_kind,assistant_ref,assistant_display_name,requests_count,"
                "conversations_count,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,"
                "total_tokens,estimated_total_cost_usd,avg_latency_ms,fallback_count,quality_retry_count,"
                "missing_pricing_count"
            ),
            params=params,
        )

    async def master_openai_cost_reconciliation_daily(
        self,
        *,
        date_from: str | None = None,
        date_to: str | None = None,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "usage_date.desc,variance_usd.desc",
        }
        and_parts: list[str] = []
        if date_from:
            and_parts.append(f"usage_date.gte.{date_from}")
        if date_to:
            and_parts.append(f"usage_date.lte.{date_to}")
        if and_parts:
            params["and"] = f"({','.join(and_parts)})"
        if project_id:
            params["openai_project_id"] = f"eq.{project_id}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_cost_reconciliation_daily",
            select=(
                "usage_date,openai_project_id,openai_project_display_name,openai_organization_id,"
                "openai_organization_name,internal_requests_count,internal_estimated_cost_usd,"
                "official_cost_usd,variance_usd,variance_pct"
            ),
            params=params,
        )

    async def master_openai_tenant_measurement_audit(
        self,
        *,
        tenant_id: UUID | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "order": "measurement_status.asc,organizacion_nombre.asc",
        }
        if tenant_id:
            params["organizacion_id"] = f"eq.{tenant_id}"
        if status:
            params["measurement_status"] = f"eq.{status}"
        return await self._fetch_openai_cost_view_service_role(
            view_name="v_openai_tenant_measurement_audit",
            select=(
                "organizacion_id,organizacion_nombre,activo,openai_project_id,has_openai_api_secret,"
                "has_openai_voice_secret,webchat_assistant_id,whatsapp_prompt_id,whatsapp_assistant_id,"
                "webchat_enabled,whatsapp_enabled,internal_requests_30d,requests_missing_project_30d,"
                "measurement_incomplete_requests_30d,last_request_at,uses_openai,measurement_status,"
                "measurement_reason"
            ),
            params=params,
        )

    async def visitas_detalle(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        order_by: str = "primera",
        order_dir: Literal["asc", "desc"] = "asc",
        with_contacts_only: bool = False,
    ) -> list[dict[str, Any]]:
        body = {
            "p_limit": max(1, min(limit, 500)),
            "p_offset": max(0, offset),
            "p_order_by": order_by,
            "p_order_dir": order_dir,
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_webchat_visitas_detalle",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada en panel_webchat_visitas_detalle: {data!r}"
            )
        if with_contacts_only:
            data = [row for row in data if isinstance(row, dict) and row.get("contacto_id")]
        return data

    async def visitas_persona_detalle(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        order_by: str = "primera",
        order_dir: Literal["asc", "desc"] = "asc",
        with_personas_only: bool = False,
    ) -> list[dict[str, Any]]:
        return await self.visitas_detalle(
            usuario_token=usuario_token,
            limit=limit,
            offset=offset,
            order_by=order_by,
            order_dir=order_dir,
            with_contacts_only=with_personas_only,
        )

    async def visitas_detalle_custom(
        self,
        *,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/panel_webchat_visitas_detalle",
            json=payload,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_webchat_visitas_detalle: {data!r}")

    async def visitas_whatsapp_total(
        self,
        *,
        usuario_token: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> int:
        body: dict[str, Any] = {}
        if date_from:
            body["p_from"] = date_from.isoformat()
        if date_to:
            body["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/embudo_visitantes_whatsapp",
                token=usuario_token,
                json=body or None,
                prefer="return=representation",
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/embudo_visitantes_whatsapp",
                json=body or None,
                prefer="return=representation",
            )
        data = resp.json()
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict) and "total" in first:
                try:
                    return int(first["total"] or 0)
                except (TypeError, ValueError):
                    pass
            if isinstance(first, (int, float)):
                return int(first)
        if isinstance(data, dict) and "total" in data:
            try:
                return int(data["total"] or 0)
            except (TypeError, ValueError):
                pass
        if isinstance(data, (int, float)):
            return int(data)
        raise CRMRepositoryError(f"Respuesta inesperada en embudo_visitantes_whatsapp: {data!r}")

    async def visitas_whatsapp_conversaciones(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        limit: int = 200,
        offset: int = 0,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        include_contact_details: bool = True,
    ) -> list[dict[str, Any]]:
        request_started = time.perf_counter()
        stage_timings: dict[str, float] = {}
        params = {
            "select": "id,canal,iniciada_en,ultimo_mensaje_en,contacto_id",
            "canal": "eq.whatsapp",
            "order": "iniciada_en.desc",
            "limit": str(max(1, min(limit, 500))),
            "offset": str(max(0, int(offset))),
        }
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if date_from and date_to:
            params["and"] = (
                f"(iniciada_en.gte.{date_from.isoformat()},"
                f"iniciada_en.lte.{date_to.isoformat()})"
            )
        elif date_from:
            params["iniciada_en"] = f"gte.{date_from.isoformat()}"
        elif date_to:
            params["iniciada_en"] = f"lte.{date_to.isoformat()}"
        # Usamos service role y filtramos por organizacion para evitar diferencias de RLS
        # entre ambientes, manteniendo aislamiento por tenant.
        query_started = time.perf_counter()
        resp = await self._request(
            "GET",
            "/rest/v1/conversaciones",
            params=params,
        )
        stage_timings["conversations_query_ms"] = round((time.perf_counter() - query_started) * 1000, 2)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en conversaciones: {data!r}")
        rows = [row for row in data if isinstance(row, dict)]
        stage_timings["rows_ms"] = round((time.perf_counter() - request_started) * 1000, 2)
        if not organizacion_id:
            logger.info(
                "crm_repo.visitas_whatsapp_conversaciones.done",
                extra={
                    "rows": len(rows),
                    "include_contact_details": include_contact_details,
                    "stage_timings": stage_timings,
                },
            )
            return rows
        if not include_contact_details:
            logger.info(
                "crm_repo.visitas_whatsapp_conversaciones.done",
                extra={
                    "rows": len(rows),
                    "include_contact_details": include_contact_details,
                    "stage_timings": stage_timings,
                },
            )
            return rows
        attach_started = time.perf_counter()
        contact_ids: list[UUID] = []
        seen_contact_ids: set[str] = set()
        for row in rows:
            raw_contact_id = row.get("contacto_id")
            if raw_contact_id is None:
                continue
            try:
                contact_uuid = _coerce_uuid(str(raw_contact_id), field="contacto_id")
            except Exception:
                continue
            contact_key = str(contact_uuid)
            if contact_key in seen_contact_ids:
                continue
            seen_contact_ids.add(contact_key)
            contact_ids.append(contact_uuid)

        contact_rows = await self.get_personas_by_ids_light(
            organizacion_id=organizacion_id,
            persona_ids=contact_ids,
        )
        contact_map: dict[str, dict[str, Any]] = {}
        for contact in contact_rows:
            contact_id = str(contact.get("id") or "").strip()
            if contact_id:
                contact_map[contact_id] = contact

        def _compose_contact_row(persona: dict[str, Any]) -> dict[str, Any]:
            name_parts = [
                _clean_text(persona.get("nombre")),
                _clean_text(persona.get("apellido_paterno")),
                _clean_text(persona.get("apellido_materno")),
            ]
            nombre_completo = _clean_text(persona.get("nombre_completo")) or " ".join(
                part for part in name_parts if part
            ).strip()
            email = (
                _clean_text(persona.get("correo_principal"))
                or _clean_text(persona.get("correo_secundario"))
                or _clean_text(persona.get("correo_institucional"))
            )
            telefono = (
                _clean_text(persona.get("telefono_movil_1_e164"))
                or _clean_text(persona.get("telefono_principal_e164"))
                or _clean_text(persona.get("telefono_movil_2_e164"))
                or _clean_text(persona.get("telefono_secundario_e164"))
                or _clean_text(persona.get("telefono_empresa_1_e164"))
                or _clean_text(persona.get("telefono_empresa_2_e164"))
            )
            return {
                "id": persona.get("id"),
                "organizacion_id": persona.get("organizacion_id"),
                "nombre_completo": nombre_completo or None,
                "nombre": nombre_completo or None,
                "correo_principal": persona.get("correo_principal"),
                "correo_secundario": persona.get("correo_secundario"),
                "correo_institucional": persona.get("correo_institucional"),
                "correo": email,
                "email": email,
                "telefono_principal_e164": persona.get("telefono_principal_e164"),
                "telefono_movil_1_e164": persona.get("telefono_movil_1_e164"),
                "telefono_movil_2_e164": persona.get("telefono_movil_2_e164"),
                "telefono_secundario_e164": persona.get("telefono_secundario_e164"),
                "telefono_empresa_1_e164": persona.get("telefono_empresa_1_e164"),
                "telefono_empresa_2_e164": persona.get("telefono_empresa_2_e164"),
                "telefono_e164": telefono or None,
                "telefono": telefono or None,
                "phone_e164": telefono or None,
                "estado": persona.get("estado"),
                "origen": persona.get("origen"),
                "creado_en": persona.get("creado_en"),
                "actualizado_en": persona.get("actualizado_en"),
                "clave_entidad": persona.get("clave_entidad"),
                "entidad": persona.get("entidad"),
                "clave_municipio": persona.get("clave_municipio"),
                "municipio": persona.get("municipio"),
                "pais": persona.get("pais"),
                "notas": persona.get("notas"),
                "metadata": persona.get("metadata") if isinstance(persona.get("metadata"), dict) else {},
                "persona_datos": persona.get("persona_datos") if isinstance(persona.get("persona_datos"), dict) else {},
                "contacto_datos": {},
            }

        rows = [
            {
                **row,
                "contacto": _compose_contact_row(contact_map[str(row.get("contacto_id"))])
                if str(row.get("contacto_id") or "").strip() in contact_map
                else None,
            }
            for row in rows
        ]
        stage_timings["attach_contact_ms"] = round((time.perf_counter() - attach_started) * 1000, 2)
        stage_timings["total_ms"] = round((time.perf_counter() - request_started) * 1000, 2)
        logger.info(
            "crm_repo.visitas_whatsapp_conversaciones.done",
            extra={
                "rows": len(rows),
                "include_contact_details": include_contact_details,
                "stage_timings": stage_timings,
            },
        )
        return rows

    async def visitas_persona_whatsapp_conversaciones(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        limit: int = 200,
        offset: int = 0,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        include_persona_details: bool = True,
    ) -> list[dict[str, Any]]:
        return await self.visitas_whatsapp_conversaciones(
            usuario_token=usuario_token,
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
            date_from=date_from,
            date_to=date_to,
            include_contact_details=include_persona_details,
        )

    async def list_whatsapp_sales_assignments(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
        oportunidad_id: UUID | None = None,
        persona_id: UUID | None = None,
        contacto_id: UUID | None = None,
        conversacion_id: UUID | None = None,
        vendedor_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": str(limit),
            "offset": str(offset),
            "order": order,
        }
        if oportunidad_id:
            params["oportunidad_id"] = f"eq.{oportunidad_id}"
        resolved_persona_id = persona_id or contacto_id
        if resolved_persona_id:
            params["persona_id"] = f"eq.{resolved_persona_id}"
        if conversacion_id:
            params["conversacion_id"] = f"eq.{conversacion_id}"
        if vendedor_id:
            params["vendedor_usuario_id"] = f"eq.{vendedor_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/v_asignaciones_vendedores",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar asignaciones WhatsApp: {data!r}"
            )
        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            if not row.get("persona_id") and row.get("contacto_id"):
                row["persona_id"] = row.get("contacto_id")
            rows.append(row)
        return rows

    async def list_persona_whatsapp_assignments(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
        oportunidad_id: UUID | None = None,
        persona_id: UUID | None = None,
        conversacion_id: UUID | None = None,
        vendedor_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        return await self.list_whatsapp_sales_assignments(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
            order=order,
            oportunidad_id=oportunidad_id,
            persona_id=persona_id,
            conversacion_id=conversacion_id,
            vendedor_id=vendedor_id,
        )

    async def list_agenda_bookings(
        self,
        *,
        usuario_token: str,
        params: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], int | None]:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/panel_calendar_bookings",
            token=usuario_token,
            params=params,
            prefer="count=planned",
        )
        raw = resp.json() or []
        if not isinstance(raw, list):
            raw = []
        total = self._extract_total_count(resp.headers.get("content-range"))
        return raw, total

    async def get_calendar_booking(
        self,
        *,
        usuario_token: str,
        booking_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "id": f"eq.{booking_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_bookings",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("booking_not_found")
        return row

    async def get_calendar_booking_by_id(
        self,
        *,
        booking_id: UUID,
    ) -> dict[str, Any] | None:
        """Recupera una cita del calendario usando service role."""
        params = {
            "id": f"eq.{booking_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/calendar_bookings", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_calendar_booking_by_conversation(
        self,
        *,
        conversation_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "conversacion_id": f"eq.{conversation_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "order": "start_at.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/calendar_bookings", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_calendar_booking_by_persona(
        self,
        *,
        persona_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "contact_id": f"eq.{persona_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "order": "start_at.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/calendar_bookings", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def get_calendar_booking_by_contact(
        self,
        *,
        contact_id: UUID,
    ) -> dict[str, Any] | None:
        return await self.get_calendar_booking_by_persona(persona_id=contact_id)

    async def list_calendar_bookings_by_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        include_cancelled: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "tarjeta_id": f"eq.{oportunidad_id}",
            "select": "id,conversacion_id,status,start_at,end_at,metadata",
            "order": "start_at.desc",
            "limit": "200",
        }
        if not include_cancelled:
            params["status"] = "neq.cancelled"
        resp = await self._request("GET", "/rest/v1/calendar_bookings", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar citas por oportunidad: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def update_calendar_booking_metadata(
        self,
        *,
        booking_id: str,
        metadata: dict[str, Any],
    ) -> None:
        booking_key = booking_id.strip()
        if not booking_key:
            raise CRMRepositoryError("booking_id_required")
        params = {"id": f"eq.{booking_key}", "limit": "1"}
        await self._request(
            "PATCH",
            "/rest/v1/calendar_bookings",
            params=params,
            json={"metadata": metadata},
            prefer="return=minimal",
        )

    async def assign_calendar_booking_creator(
        self,
        *,
        booking_id: str,
        organizacion_id: UUID,
        usuario_id: UUID,
    ) -> None:
        """Asigna el responsable autenticado a una cita ya confirmada."""
        booking_key = booking_id.strip()
        if not booking_key:
            raise CRMRepositoryError("booking_id_required")
        await self._request(
            "PATCH",
            "/rest/v1/calendar_bookings",
            params={
                "id": f"eq.{booking_key}",
                "organizacion_id": f"eq.{organizacion_id}",
            },
            json={"created_by": str(usuario_id), "updated_by": str(usuario_id)},
            prefer="return=minimal",
        )

    async def user_has_role(self, *, usuario_id: UUID, role_code: str) -> bool:
        normalized_target = (role_code or "").strip().lower()
        if not normalized_target:
            return False

        alias_map: dict[str, set[str]] = {
            "admin": {"admin", "administrador"},
            "administrador": {"admin", "administrador"},
        }
        lookup_targets = alias_map.get(normalized_target, {normalized_target})

        user_roles_resp = await self._request(
            "GET",
            "/rest/v1/usuarios_roles",
            params={
                "select": "rol_id",
                "usuario_id": f"eq.{usuario_id}",
            },
        )
        user_roles_data = user_roles_resp.json() or []
        if not isinstance(user_roles_data, list):
            return False

        role_ids = [
            str(row.get("rol_id")).strip()
            for row in user_roles_data
            if isinstance(row, dict) and str(row.get("rol_id") or "").strip()
        ]
        if not role_ids:
            return False

        roles_resp = await self._request(
            "GET",
            "/rest/v1/roles",
            params={
                "select": "codigo,nombre",
                "id": f"in.({','.join(role_ids)})",
            },
        )
        roles_data = roles_resp.json() or []
        if not isinstance(roles_data, list):
            return False

        for role in roles_data:
            if not isinstance(role, dict):
                continue
            codigo_norm = str(role.get("codigo") or "").strip().lower()
            nombre_norm = str(role.get("nombre") or "").strip().lower()
            if codigo_norm in lookup_targets or nombre_norm in lookup_targets:
                return True
        return False

    async def user_has_permission(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
        codigo: str,
    ) -> bool:
        perm_code = (codigo or "").strip().lower()
        if not perm_code:
            return False

        roles_resp = await self._request(
            "GET",
            "/rest/v1/usuarios_roles",
            params={
                "select": "rol_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "usuario_id": f"eq.{usuario_id}",
            },
        )
        roles_data = roles_resp.json() or []
        if not isinstance(roles_data, list):
            return False

        role_ids = [
            str(row.get("rol_id")).strip()
            for row in roles_data
            if isinstance(row, dict) and str(row.get("rol_id") or "").strip()
        ]
        if not role_ids:
            return False

        role_permissions_resp = await self._request(
            "GET",
            "/rest/v1/roles_permisos",
            params={
                "select": "permiso_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "rol_id": f"in.({','.join(role_ids)})",
            },
        )
        role_permissions_data = role_permissions_resp.json() or []
        if not isinstance(role_permissions_data, list):
            return False

        permiso_ids = [
            str(row.get("permiso_id")).strip()
            for row in role_permissions_data
            if isinstance(row, dict) and str(row.get("permiso_id") or "").strip()
        ]
        if not permiso_ids:
            return False

        permisos_resp = await self._request(
            "GET",
            "/rest/v1/permisos",
            params={
                "select": "codigo",
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"in.({','.join(permiso_ids)})",
                "codigo": f"eq.{perm_code}",
                "limit": "1",
            },
        )
        permisos_data = permisos_resp.json() or []
        if isinstance(permisos_data, list):
            return bool(permisos_data)
        if isinstance(permisos_data, dict):
            return bool(str(permisos_data.get("codigo") or "").strip())
        return False

    async def list_user_ids_with_permission(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
    ) -> list[UUID]:
        perm_code = (codigo or "").strip().lower()
        if not perm_code:
            return []

        permisos_resp = await self._request(
            "GET",
            "/rest/v1/permisos",
            params={
                "select": "id",
                "organizacion_id": f"eq.{organizacion_id}",
                "codigo": f"eq.{perm_code}",
            },
        )
        permisos_data = permisos_resp.json() or []
        if not isinstance(permisos_data, list) or not permisos_data:
            return []

        permiso_ids = [
            str(row.get("id")).strip()
            for row in permisos_data
            if isinstance(row, dict) and str(row.get("id") or "").strip()
        ]
        if not permiso_ids:
            return []

        roles_permisos_resp = await self._request(
            "GET",
            "/rest/v1/roles_permisos",
            params={
                "select": "rol_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "permiso_id": f"in.({','.join(permiso_ids)})",
            },
        )
        roles_permisos_data = roles_permisos_resp.json() or []
        if not isinstance(roles_permisos_data, list) or not roles_permisos_data:
            return []

        role_ids = [
            str(row.get("rol_id")).strip()
            for row in roles_permisos_data
            if isinstance(row, dict) and str(row.get("rol_id") or "").strip()
        ]
        if not role_ids:
            return []

        usuarios_roles_resp = await self._request(
            "GET",
            "/rest/v1/usuarios_roles",
            params={
                "select": "usuario_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "rol_id": f"in.({','.join(role_ids)})",
            },
        )
        usuarios_roles_data = usuarios_roles_resp.json() or []
        if not isinstance(usuarios_roles_data, list) or not usuarios_roles_data:
            return []

        user_ids: list[UUID] = []
        for row in usuarios_roles_data:
            if not isinstance(row, dict):
                continue
            raw_id = row.get("usuario_id")
            try:
                user_ids.append(UUID(str(raw_id)))
            except (TypeError, ValueError):
                continue
        unique = []
        seen = set()
        for user_id in user_ids:
            if user_id in seen:
                continue
            seen.add(user_id)
            unique.append(user_id)
        return unique

    async def get_conversation_summary(
        self,
        *,
        conversation_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request(
            "GET",
            "/rest/v1/conversaciones",
            params={
                "id": f"eq.{conversation_id}",
                "select": "id,organizacion_id,contacto_id,asignado_a_usuario_id,canal,estado,no_leidos",
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def user_belongs_to_organizacion(
        self,
        *,
        organizacion_id: UUID,
        usuario_id: UUID,
    ) -> bool:
        roles_resp = await self._request(
            "GET",
            "/rest/v1/usuarios_roles",
            params={
                "select": "usuario_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "usuario_id": f"eq.{usuario_id}",
                "limit": "1",
            },
        )
        roles_data = roles_resp.json() or []
        if isinstance(roles_data, list) and roles_data:
            return True

        direct_org_id = await self._get_usuario_organizacion_id(usuario_id=usuario_id)
        return direct_org_id == organizacion_id

    async def current_user_has_perm(self, *, codigo: str) -> bool:
        perm_code = (codigo or "").strip().lower()
        if not perm_code:
            return False
        cached = self._current_user_perm_cache.get(perm_code)
        if cached is not None:
            return cached
        data = await self._rpc("current_user_has_perm", {"perm_code": perm_code})
        result = False
        if isinstance(data, bool):
            result = data
        elif isinstance(data, dict):
            value = data.get("current_user_has_perm")
            if isinstance(value, bool):
                result = value
        self._current_user_perm_cache[perm_code] = result
        return result

    async def can_view_contact_sensitive_fields(self, *, persona_id: UUID) -> bool:
        data = await self._rpc(
            "can_view_contact_sensitive_fields",
            {"p_persona_id": str(persona_id)},
        )
        if isinstance(data, bool):
            return data
        if isinstance(data, dict):
            value = data.get("can_view_contact_sensitive_fields")
            if isinstance(value, bool):
                return value
        return False

    async def can_view_account_sensitive_fields(self, *, cuenta_id: UUID) -> bool:
        data = await self._rpc(
            "can_view_account_sensitive_fields",
            {"p_cuenta_id": str(cuenta_id)},
        )
        if isinstance(data, bool):
            return data
        if isinstance(data, dict):
            value = data.get("can_view_account_sensitive_fields")
            if isinstance(value, bool):
                return value
        return False

    async def get_permission_context(self) -> dict[str, Any]:
        if self._permission_context_cache is not None:
            return dict(self._permission_context_cache)
        data = await self._rpc("mi_contexto_permisos", {})
        context: dict[str, Any]
        if isinstance(data, list) and data:
            context = data[0] if isinstance(data[0], dict) else {}
        elif isinstance(data, dict):
            context = data
        else:
            context = {}
        self._permission_context_cache = dict(context)
        return dict(self._permission_context_cache)

    async def list_clientes(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": self._CLIENTE_SELECT,
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar clientes: {data!r}")
        rows = [row for row in data if isinstance(row, dict)]
        if rows:
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=rows,
                source_fields=("contacto_id",),
            )
            await self._attach_cliente_vendor_rows(
                organizacion_id=organizacion_id,
                rows=rows,
            )
        return rows

    async def get_cliente_por_oportunidad(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/clientes",
                    token=usuario_token,
                    params=params,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
            else:
                data = resp.json() or []
                row = self._first_row(data)
                if isinstance(row, dict):
                    await self._attach_contact_rows(
                        organizacion_id=organizacion_id,
                        rows=[row],
                        source_fields=("contacto_id",),
                    )
                    await self._attach_cliente_vendor_rows(
                        organizacion_id=organizacion_id,
                        rows=[row],
                    )
                    return row
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        if isinstance(row, dict):
            await self._attach_contact_rows(
                organizacion_id=organizacion_id,
                rows=[row],
                source_fields=("contacto_id",),
            )
            await self._attach_cliente_vendor_rows(
                organizacion_id=organizacion_id,
                rows=[row],
            )
            return row
        return None

    async def get_cliente_por_contacto(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_id": f"eq.{contacto_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/clientes",
                    token=usuario_token,
                    params=params,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
            else:
                data = resp.json() or []
                row = self._first_row(data)
                if isinstance(row, dict):
                    return row
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        if isinstance(row, dict):
            return row
        return None

    async def get_cliente_por_id(
        self,
        *,
        organizacion_id: UUID,
        cliente_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{cliente_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/clientes",
                    token=usuario_token,
                    params=params,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
            else:
                data = resp.json() or []
                row = self._first_row(data)
                if isinstance(row, dict):
                    return row
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        if isinstance(row, dict):
            row_org_id = _safe_uuid(row.get("organizacion_id"))
            if row_org_id is not None:
                await self._attach_contact_rows(
                    organizacion_id=row_org_id,
                    rows=[row],
                    source_fields=("contacto_id",),
                )
                await self._attach_cliente_vendor_rows(
                    organizacion_id=row_org_id,
                    rows=[row],
                )
            return row
        return None

    async def get_cliente_por_id_service(
        self,
        *,
        cliente_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{cliente_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        if isinstance(row, dict):
            row_org_id = _safe_uuid(row.get("organizacion_id")) or None
            if row_org_id is not None:
                await self._attach_contact_rows(
                    organizacion_id=row_org_id,
                    rows=[row],
                    source_fields=("contacto_id",),
                )
                await self._attach_cliente_vendor_rows(
                    organizacion_id=row_org_id,
                    rows=[row],
                )
            return row
        return None

    async def update_cliente(
        self,
        *,
        cliente_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/clientes",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/clientes",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if isinstance(row, dict):
            org_value = row.get("organizacion_id")
            try:
                org_uuid = _coerce_uuid(str(org_value), field="organizacion_id") if org_value else None
            except Exception:
                org_uuid = None
            if org_uuid:
                await self._attach_contact_rows(
                    organizacion_id=org_uuid,
                    rows=[row],
                    source_fields=("contacto_id",),
                )
                await self._attach_cliente_vendor_rows(
                    organizacion_id=org_uuid,
                    rows=[row],
                )
            return row
        return None

    async def convert_oportunidad_en_cliente(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_token: str | None = None,
        forzar: bool = False,
    ) -> Any:
        opportunity = await self.get_opportunity_with_contact(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
        if not isinstance(opportunity, dict):
            raise CRMRepositoryError("oportunidad_no_encontrada_para_convertir")

        contact_id = _safe_uuid(opportunity.get("contacto_principal_id"))
        if contact_id is None:
            raise CRMRepositoryError("oportunidad_sin_contacto_principal")

        await self.ensure_contact_record_for_persona(
            organizacion_id=organizacion_id,
            persona_id=contact_id,
            use_service_role=True,
        )

        existing = await self.get_cliente_por_oportunidad(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            usuario_token=usuario_token,
        )
        if isinstance(existing, dict):
            return existing

        account_id = _safe_uuid(opportunity.get("cuenta_id"))
        if account_id is None:
            raise CRMRepositoryError("cliente_conversion_cuenta_missing")

        quotes_total = opportunity.get("monto_estimado")
        metadata = _ensure_metadata(opportunity.get("metadata"))
        body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "contacto_id": str(contact_id),
            "persona_id": str(contact_id),
            "cuenta_id": str(account_id),
            "oportunidad_id": str(oportunidad_id),
            "legacy_lead_id": str(oportunidad_id),
            "estado_onboarding": "pendiente",
            "datos_facturacion": {},
            "metadatos": {
                "source": "crm",
                "conversion_source": "oportunidad",
                "conversion_forzada": bool(forzar),
                "opportunity_stage": (opportunity.get("etapa") or {}).get("codigo"),
            },
            "moneda": opportunity.get("moneda") or "MXN",
            "monto_estimado": quotes_total if isinstance(quotes_total, (int, float, Decimal)) else None,
            "ganado_en": datetime.now(timezone.utc).isoformat(),
            "tablero_id": _safe_uuid((metadata.get("stage_prep") or {}).get("tablero_id")) if isinstance(metadata, dict) else None,
            "etapa_id": _safe_uuid(opportunity.get("etapa_id")),
        }
        body = {key: value for key, value in body.items() if value is not None}
        params = {"on_conflict": "contacto_id"}
        try:
            resp = await self._request_service_role(
                "POST",
                "/rest/v1/clientes",
                params=params,
                json=body,
                prefer="resolution=merge-duplicates,return=representation",
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            if "clientes_contacto_org_fkey" not in str(exc).lower():
                raise
            raise CRMRepositoryError("cliente_conversion_contact_missing") from exc
        data = resp.json()
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError("convertir_lead_response_invalid")
        return data[0]

    async def create_cliente_document(
        self,
        *,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        request = (
            self._request_with_user(
                "POST",
                "/rest/v1/cliente_documentos",
                token=usuario_token,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "POST",
                "/rest/v1/cliente_documentos",
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("documento_not_created")
        return row

    async def update_cliente_document(
        self,
        *,
        cliente_id: UUID,
        documento_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{documento_id}", "cliente_id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/cliente_documentos",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/cliente_documentos",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("documento_not_found")
        return row

    async def create_cliente_responsable(
        self,
        *,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        request = (
            self._request_with_user(
                "POST",
                "/rest/v1/cliente_responsables",
                token=usuario_token,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "POST",
                "/rest/v1/cliente_responsables",
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("responsable_not_created")
        return row

    async def update_cliente_responsable(
        self,
        *,
        cliente_id: UUID,
        responsable_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{responsable_id}", "cliente_id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/cliente_responsables",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/cliente_responsables",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("responsable_not_found")
        return row

    async def create_portal_token(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/cliente_portal_tokens",
            token=usuario_token,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("portal_token_create_failed")
        return row

    async def get_portal_token(
        self,
        *,
        portal_token: str,
        include_relations: bool = True,
    ) -> dict[str, Any] | None:
        params = {
            "token": f"eq.{portal_token}",
            "select": (
                self._PORTAL_TOKEN_SELECT if include_relations else self._PORTAL_TOKEN_MIN_SELECT
            ),
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/cliente_portal_tokens",
            params=params,
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            return None
        cliente = row.get("cliente")
        if isinstance(cliente, dict):
            org_value = cliente.get("organizacion_id") or row.get("organizacion_id")
            try:
                org_uuid = _coerce_uuid(str(org_value), field="organizacion_id") if org_value else None
            except Exception:
                org_uuid = None
            if org_uuid:
                await self._attach_contact_rows(
                    organizacion_id=org_uuid,
                    rows=[cliente],
                    source_fields=("contacto_id",),
                )
        return row

    async def touch_portal_token(
        self,
        *,
        token_id: UUID,
        usos: int,
        ip: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "usos": usos,
            "ultimo_acceso_en": datetime.now(timezone.utc).isoformat(),
        }
        if ip:
            payload["ultimo_acceso_ip"] = ip
        await self._request(
            "PATCH",
            "/rest/v1/cliente_portal_tokens",
            params={"id": f"eq.{token_id}"},
            json=payload,
        )

    async def create_prospeccion_busqueda(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> Any:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/crear_busqueda",
            token=usuario_token,
            json=payload,
        )
        try:
            return resp.json()
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("crear_busqueda_response_invalid") from exc

    async def update_prospeccion_busqueda_total(
        self,
        *,
        usuario_token: str,
        busqueda_id: UUID,
        total_encontrados: int,
    ) -> None:
        payload = {"total_encontrados": total_encontrados}
        await self._request_with_user(
            "PATCH",
            "/rest/v1/busquedas",
            token=usuario_token,
            params={"id": f"eq.{busqueda_id}"},
            json=payload,
        )

    async def get_prospeccion_busqueda(
        self,
        *,
        busqueda_id: UUID,
        select: str | None = "organizacion_id",
    ) -> dict[str, Any] | None:
        params: dict[str, str] = {
            "id": f"eq.{busqueda_id}",
            "limit": "1",
        }
        if select:
            params["select"] = select
        resp = await self._request("GET", "/rest/v1/busquedas", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"busqueda_get_invalid:{data!r}")
        row = data[0] if data else None
        return row if isinstance(row, dict) else None

    async def upsert_prospeccion_resultados(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
        organizacion_id: UUID | None = None,
    ) -> Any:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/upsert_resultados_lote",
            token=usuario_token,
            json=payload,
            organizacion_id=organizacion_id,
        )
        try:
            return resp.json()
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("upsert_resultados_invalid_response") from exc

    async def list_prospeccion_busquedas(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
    ) -> tuple[list[dict[str, Any]], int | None]:
        try:
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/busquedas",
                token=usuario_token,
                params=params,
            )
        except CRMRepositoryError as exc:
            # PostgREST devuelve 416 cuando el offset queda fuera del rango disponible.
            # Para paginación lo tratamos como página vacía.
            if "error 416" in str(exc).lower():
                return [], 0
            raise
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar búsquedas: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        return data, total

    async def delete_prospeccion_busqueda(
        self,
        *,
        busqueda_id: UUID,
        fuente: str,
    ) -> int:
        params = {
            "id": f"eq.{busqueda_id}",
            "fuente": f"eq.{fuente}",
        }
        payload = {
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/busquedas",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al eliminar búsqueda: {data!r}")
        return len(data)

    async def worker_purge_deleted_busquedas(
        self,
        *,
        batch_size: int = 1,
        row_chunk_size: int = 500,
        purge_after_days: int = 7,
    ) -> dict[str, Any]:
        payload = {
            "p_batch_size": max(1, int(batch_size)),
            "p_row_chunk_size": max(1, int(row_chunk_size)),
            "p_purge_after_days": max(1, int(purge_after_days)),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/purge_soft_deleted_busquedas",
            json=payload,
        )
        try:
            data = resp.json() or {}
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("worker_purge_deleted_busquedas_invalid_response") from exc
        if not isinstance(data, dict):
            raise CRMRepositoryError(f"worker_purge_deleted_busquedas_invalid:{data!r}")
        return data

    async def list_prospeccion_resultados(
        self,
        *,
        usuario_token: str,
        path: str,
        params: dict[str, str],
        count_exact: bool = False,
    ) -> tuple[list[dict[str, Any]], int | None]:
        resp = await self._request_with_user(
            "GET",
            path,
            token=usuario_token,
            params=params,
            prefer="count=exact" if count_exact else "count=planned",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar resultados: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        return data, total

    async def denue_resultados_list(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista resultados DENUE con filtros globales (RPC) y devuelve total exacto."""
        requested_limit = max(1, int(payload.get("p_limit") or 250))
        requested_offset = max(0, int(payload.get("p_offset") or 0))
        chunk_size = 1000

        rows: list[dict[str, Any]] = []
        total = 0
        remaining = requested_limit
        current_offset = requested_offset

        while remaining > 0:
            current_payload = dict(payload)
            current_payload["p_limit"] = min(chunk_size, remaining)
            current_payload["p_offset"] = current_offset
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/denue_resultados_list",
                token=usuario_token,
                json=current_payload,
            )
            try:
                data = resp.json() or []
            except ValueError as exc:  # pragma: no cover
                raise CRMRepositoryError("denue_resultados_list_invalid_response") from exc
            if not isinstance(data, list):
                raise CRMRepositoryError(f"denue_resultados_list_invalid:{data!r}")
            if not data:
                break

            first = data[0]
            if isinstance(first, dict):
                total = int(first.get("total_count") or total or 0)

            page_rows: list[dict[str, Any]] = []
            for row in data:
                if not isinstance(row, dict):
                    continue
                row.pop("total_count", None)
                page_rows.append(row)
            if not page_rows:
                break

            rows.extend(page_rows)
            fetched = len(page_rows)
            remaining -= fetched
            current_offset += fetched

            if fetched < int(current_payload["p_limit"]):
                break

        return rows, total

    async def get_prospeccion_commercial_context(
        self,
        *,
        organizacion_id: UUID,
        now: datetime,
    ) -> dict[str, Any]:
        entitlement_keys = (
            "limit.prospeccion.credits_month",
            "limit.prospeccion.denue_raw_results_month",
        )

        async def _rows(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
            response = await self._request_service_role(
                "GET", path, params=params, organizacion_id=organizacion_id
            )
            data = response.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError("prospeccion_commercial_context_invalid")
            return [row for row in data if isinstance(row, dict)]

        billing_rows = await _rows(
            "/rest/v1/tenant_billing_accounts",
            {"tenant_id": f"eq.{organizacion_id}", "select": "*", "limit": "1"},
        )
        billing = billing_rows[0] if billing_rows else None
        plan = None
        entitlements: list[dict[str, Any]] = []
        if billing and billing.get("plan_id"):
            plan_rows = await _rows(
                "/rest/v1/commercial_plans",
                {"id": f"eq.{billing['plan_id']}", "select": "id,code,name,active", "limit": "1"},
            )
            plan = plan_rows[0] if plan_rows else None
            entitlements = await _rows(
                "/rest/v1/commercial_plan_entitlements",
                {
                    "plan_id": f"eq.{billing['plan_id']}",
                    "entitlement_key": f"in.({','.join(entitlement_keys)})",
                    "select": "entitlement_key,enabled,limit_value,limit_unit,scope",
                },
            )
        policy_rows = await _rows(
            "/rest/v1/tenant_prospeccion_policies",
            {"tenant_id": f"eq.{organizacion_id}", "select": "required_contact_mode", "limit": "1"},
        )
        now_iso = now.isoformat()
        overrides = await _rows(
            "/rest/v1/tenant_plan_overrides",
            {
                "tenant_id": f"eq.{organizacion_id}",
                "override_key": f"in.({','.join(entitlement_keys)})",
                "select": "override_key,override_value,value_type,starts_at,ends_at,created_at",
                "order": "created_at.desc",
            },
        )

        def _active_override(row: dict[str, Any]) -> bool:
            try:
                starts_at = (
                    datetime.fromisoformat(str(row["starts_at"]).replace("Z", "+00:00"))
                    if row.get("starts_at")
                    else None
                )
                ends_at = (
                    datetime.fromisoformat(str(row["ends_at"]).replace("Z", "+00:00"))
                    if row.get("ends_at")
                    else None
                )
            except ValueError as exc:
                raise CRMRepositoryError("prospeccion_override_datetime_invalid") from exc
            if starts_at and starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=timezone.utc)
            if ends_at and ends_at.tzinfo is None:
                ends_at = ends_at.replace(tzinfo=timezone.utc)
            return (starts_at is None or starts_at <= now) and (ends_at is None or now < ends_at)

        overrides = [row for row in overrides if _active_override(row)]
        period_rows = await _rows(
            "/rest/v1/tenant_prospeccion_usage_periods",
            {
                "tenant_id": f"eq.{organizacion_id}",
                "period_start": f"lte.{now_iso}",
                "period_end": f"gt.{now_iso}",
                "select": "*",
                "limit": "1",
            },
        )
        return {
            "billing": billing,
            "plan": plan,
            "entitlements": entitlements,
            "policy": policy_rows[0] if policy_rows else None,
            "overrides": overrides,
            "usage_period": period_rows[0] if period_rows else None,
        }

    async def save_denue_prospectos_transactional(
        self,
        *,
        organizacion_id: UUID,
        created_by: UUID | None,
        operation_id: UUID,
        resultado_ids: list[UUID],
        segmento: str | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """Guarda un lote DENUE y consume créditos mediante una única RPC."""

        payload = {
            "p_tenant_id": str(organizacion_id),
            "p_created_by": str(created_by) if created_by else None,
            "p_operation_id": str(operation_id),
            "p_resultado_ids": [str(value) for value in resultado_ids],
            "p_segmento": segmento,
            "p_metadata": metadata,
        }
        try:
            response = await self._request_service_role(
                "POST",
                "/rest/v1/rpc/prospeccion_guardar_denue_transaccional",
                json=payload,
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raw_error = str(exc)
            known_codes = (
                "prospeccion_access_blocked",
                "prospeccion_actor_not_allowed",
                "prospeccion_credits_not_configured",
                "prospeccion_metadata_invalid",
                "prospeccion_operation_incomplete",
                "prospeccion_operation_payload_conflict",
                "prospeccion_plan_not_configured",
                "prospeccion_request_invalid",
                "prospeccion_result_ids_invalid",
                "prospeccion_results_not_owned",
                "prospeccion_segment_invalid",
                "prospeccion_usage_period_invalid",
            )
            for code in known_codes:
                if code in raw_error:
                    raise CRMRepositoryError(code) from exc
            raise CRMRepositoryError("prospeccion_transaction_failed") from exc
        data = response.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError("prospeccion_transaction_invalid_response")
        return data

    async def record_denue_raw_results(
        self,
        *,
        organizacion_id: UUID,
        busqueda_id: UUID,
    ) -> dict[str, Any]:
        """Contabiliza una sola vez los resultados persistidos de una búsqueda DENUE."""

        try:
            response = await self._request_service_role(
                "POST",
                "/rest/v1/rpc/prospeccion_registrar_resultados_denue",
                json={
                    "p_tenant_id": str(organizacion_id),
                    "p_busqueda_id": str(busqueda_id),
                },
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            raw_error = str(exc)
            known_codes = (
                "prospeccion_access_blocked",
                "prospeccion_credits_not_configured",
                "prospeccion_plan_not_configured",
                "prospeccion_request_invalid",
                "prospeccion_search_not_owned",
                "prospeccion_usage_period_invalid",
            )
            for code in known_codes:
                if code in raw_error:
                    raise CRMRepositoryError(code) from exc
            raise CRMRepositoryError("prospeccion_raw_usage_failed") from exc
        data = response.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError("prospeccion_raw_usage_invalid_response")
        return data

    async def denue_resultados_map(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/denue_resultados_map",
            token=usuario_token,
            json=payload,
        )
        try:
            data = resp.json() or []
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("denue_resultados_map_invalid_response") from exc
        if not isinstance(data, list):
            raise CRMRepositoryError(f"denue_resultados_map_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def denue_resultados_bounds(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/denue_resultados_bounds",
            token=usuario_token,
            json=payload,
        )
        try:
            data = resp.json() or []
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("denue_resultados_bounds_invalid_response") from exc
        if not isinstance(data, list):
            raise CRMRepositoryError(f"denue_resultados_bounds_invalid:{data!r}")
        row = data[0] if data else None
        return row if isinstance(row, dict) else None

    async def google_resultados_map(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/google_resultados_map",
            token=usuario_token,
            json=payload,
        )
        try:
            data = resp.json() or []
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("google_resultados_map_invalid_response") from exc
        if not isinstance(data, list):
            raise CRMRepositoryError(f"google_resultados_map_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def google_resultados_bounds(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/google_resultados_bounds",
            token=usuario_token,
            json=payload,
        )
        try:
            data = resp.json() or []
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("google_resultados_bounds_invalid_response") from exc
        if not isinstance(data, list):
            raise CRMRepositoryError(f"google_resultados_bounds_invalid:{data!r}")
        row = data[0] if data else None
        return row if isinstance(row, dict) else None

    async def denue_resultados_actividades(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> list[str]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/denue_resultados_actividades",
            token=usuario_token,
            json=payload,
        )
        try:
            data = resp.json() or []
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("denue_resultados_actividades_invalid_response") from exc
        if not isinstance(data, list):
            raise CRMRepositoryError(f"denue_resultados_actividades_invalid:{data!r}")
        items: list[str] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            value = row.get("actividad")
            if isinstance(value, str) and value.strip():
                items.append(value.strip())
        return items

    async def delete_prospeccion_resultados(
        self,
        *,
        ids: list[UUID],
        fuente: str,
        busqueda_id: UUID | None = None,
    ) -> int:
        ids_param = ",".join(str(value) for value in ids)
        if busqueda_id is not None:
            params = {
                "resultado_id": f"in.({ids_param})",
                "busqueda_id": f"eq.{busqueda_id}",
                "fuente": f"eq.{fuente}",
            }
            resp = await self._request(
                "DELETE",
                "/rest/v1/prospeccion_resultado_apariciones",
                params=params,
                prefer="return=representation",
            )
            if resp.status_code == 204:
                data: list[dict[str, Any]] = []
            else:
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"Respuesta inesperada al eliminar resultados: {data!r}")
            if data:
                return len(data)
            params = {
                "id": f"in.({ids_param})",
                "fuente": f"eq.{fuente}",
            }
            resp = await self._request(
                "DELETE",
                "/rest/v1/resultados",
                params=params,
                prefer="return=representation",
            )
        else:
            params = {
                "id": f"in.({ids_param})",
                "fuente": f"eq.{fuente}",
            }
            resp = await self._request(
                "DELETE",
                "/rest/v1/resultados",
                params=params,
                prefer="return=representation",
            )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al eliminar resultados: {data!r}")
        return len(data)

    async def list_contactables_by_ids(
        self,
        *,
        usuario_token: str,
        fuente: str,
        resultado_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene filas de vistas contactables filtradas por resultado_id."""

        if not resultado_ids:
            return []
        ids_order = [str(value) for value in resultado_ids]
        rows_by_id: dict[str, dict[str, Any]] = {}
        if fuente == "google_places":
            path = "/rest/v1/v_google_places_contactables"
            chunk_size = 200
            base_select = ["*"]
            query_builder = self._request_with_user
        elif fuente == "denue":
            path = "/rest/v1/resultados"
            chunk_size = 500
            base_select = [
                "id",
                "busqueda_id",
                "fuente",
                "external_id",
                "name",
                "razon_social",
                "actividad",
                "estrato",
                "phone",
                "phone_e164",
                "correo_principal",
                "correo_secundario",
                "telefono_principal_e164",
                "telefono_principal_tipo_linea",
                "telefono_principal_extension",
                "telefono_movil_1_e164",
                "telefono_movil_1_tipo_linea",
                "email",
                "website",
                "address",
                "address_full",
                "tipo_vialidad",
                "nombre_vialidad",
                "numero_exterior",
                "numero_interior",
                "colonia",
                "codigo_postal",
                "estado_cve",
                "estado_nombre",
                "municipio_cve",
                "municipio_nombre",
                "localidad_cve",
                "localidad",
                "asentamiento",
                "entre_calles",
                "referencia",
                "lat",
                "lng",
                "maps_url",
                "first_seen_at",
                "busqueda:busquedas!inner(fuente,query,radio_m,lat,lng,centro,total_encontrados,meta,creado_en,creado_por)",
            ]
            query_builder = self._request_with_user
        else:
            raise CRMRepositoryError(f"fuente_contactable_desconocida:{fuente}")
        for start in range(0, len(ids_order), chunk_size):
            chunk = ids_order[start : start + chunk_size]
            if fuente == "denue":
                params = {
                    "select": ",".join(base_select),
                    "id": f"in.({','.join(chunk)})",
                    "fuente": "eq.denue",
                }
            else:
                params = {
                    "select": ",".join(base_select),
                    "resultado_id": _postgrest_in_clause(chunk),
                }
            resp = await query_builder(
                "GET",
                path,
                token=usuario_token,
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar contactables: {data!r}")
            for row in data:
                if not isinstance(row, dict):
                    continue
                if fuente == "denue":
                    resultado_id = row.get("id")
                    busqueda_value = row.get("busqueda") if isinstance(row.get("busqueda"), dict) else {}
                    if isinstance(busqueda_value, dict):
                        row["resultado_id"] = resultado_id
                        row["fuente_resultado"] = row.get("fuente")
                        row["fuente_busqueda"] = busqueda_value.get("fuente")
                        row["busqueda_meta"] = busqueda_value.get("meta")
                        row["distancia_m"] = None
                        row["display_name"] = row.get("name") or row.get("razon_social") or row.get("external_id") or "Prospecto"
                        row["nombre_comercial"] = row.get("display_name")
                        row["resultado_creado_en"] = row.get("first_seen_at") or row.get("creado_en")
                else:
                    resultado_id = row.get("resultado_id")
                if resultado_id is None:
                    continue
                rows_by_id[str(resultado_id)] = row
        return [rows_by_id[item_id] for item_id in ids_order if item_id in rows_by_id]

    async def list_scian_clase_titles(self, *, codes: list[str]) -> dict[str, str]:
        """Devuelve un mapa codigo -> titulo para clases SCIAN."""

        if not codes:
            return {}
        params: dict[str, Any] = {
            "select": "codigo,titulo",
            "codigo": _postgrest_in_clause(codes),
        }
        resp = await self._request("GET", "/rest/v1/scian_clase", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar clases SCIAN: {data!r}")
        mapping: dict[str, str] = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            code = row.get("codigo")
            title = row.get("titulo")
            if isinstance(code, str) and isinstance(title, str):
                mapping[code] = title
        return mapping

    async def list_scian_titles(self, *, codes: list[str]) -> dict[str, str]:
        """Devuelve un mapa codigo -> titulo para cualquier nivel SCIAN."""

        if not codes:
            return {}
        normalized_codes = sorted({str(code).strip() for code in codes if str(code or "").strip()})
        if not normalized_codes:
            return {}

        params: dict[str, Any] = {
            "select": "codigo,titulo",
            "codigo": _postgrest_in_clause(normalized_codes),
        }
        mapping: dict[str, str] = {}
        for table in ("scian_sector", "scian_subsector", "scian_rama", "scian_subrama", "scian_clase"):
            resp = await self._request("GET", f"/rest/v1/{table}", params=params)
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar catálogo SCIAN {table}: {data!r}")
            for row in data:
                if not isinstance(row, dict):
                    continue
                code = row.get("codigo")
                title = row.get("titulo")
                if isinstance(code, str) and isinstance(title, str) and title.strip():
                    mapping[code] = title.strip()
        return mapping

    async def list_scian_catalogs(self) -> dict[str, list[dict[str, Any]]]:
        """Consulta los catálogos SCIAN (sector → clase) desde Supabase."""

        return {
            "sector": await self._list_scian_table(table="scian_sector"),
            "subsector": await self._list_scian_table(table="scian_subsector"),
            "rama": await self._list_scian_table(table="scian_rama"),
            "subrama": await self._list_scian_table(table="scian_subrama"),
            "clase": await self._list_scian_table(table="scian_clase"),
        }

    async def list_scian_clase_indice(
        self,
        *,
        codigo_clase: str,
        limit: int | None = None,
        offset: int | None = None,
        prefix: bool = False,
    ) -> list[dict[str, Any]]:
        """Obtiene los ítems de índice para una clase específica."""

        params: dict[str, Any] = {
            "select": "id,codigo_clase,item",
            "codigo_clase": f"{'like' if prefix else 'eq'}.{codigo_clase}{'%' if prefix else ''}",
            "order": "item.asc",
        }
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        resp = await self._request("GET", "/rest/v1/scian_clase_indice", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar índice SCIAN: {data!r}")
        return data

    async def upsert_prospeccion_prospectos(
        self,
        *,
        usuario_token: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Inserta o actualiza prospectos seleccionados desde resultados."""

        if not items:
            return []
        # Evita recortes en algunos entornos PostgREST/Supabase cuando el payload masivo
        # supera los límites prácticos de request/response.
        chunk_size = 200
        external_items: list[dict[str, Any]] = []
        fallback_items: list[dict[str, Any]] = []
        for item in items:
            if item.get("fuente") in {"denue", "google_places"} and item.get("external_id"):
                external_items.append(item)
            else:
                fallback_items.append(item)

        upserted_by_resultado: dict[str, dict[str, Any]] = {}
        upserted_by_external: dict[str, dict[str, Any]] = {}

        async def _run_upsert(batch: list[dict[str, Any]], *, on_conflict: str) -> None:
            if not batch:
                return
            for start in range(0, len(batch), chunk_size):
                chunk = batch[start : start + chunk_size]
                resp = await self._request_with_user(
                    "POST",
                    "/rest/v1/prospeccion_prospectos",
                    token=usuario_token,
                    params={"on_conflict": on_conflict},
                    json=chunk,
                    prefer="return=representation,resolution=merge-duplicates",
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"Respuesta inválida al upsert prospectos: {data!r}")
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    resultado_id = row.get("resultado_id")
                    if resultado_id is not None:
                        upserted_by_resultado[str(resultado_id)] = row
                    external_id = row.get("external_id")
                    if isinstance(external_id, str) and external_id:
                        upserted_by_external[external_id] = row

        await _run_upsert(external_items, on_conflict="organizacion_id,fuente,external_id")
        await _run_upsert(fallback_items, on_conflict="resultado_id")

        ordered_rows: list[dict[str, Any]] = []
        for item in items:
            if item.get("fuente") in {"denue", "google_places"} and item.get("external_id"):
                row = upserted_by_external.get(str(item.get("external_id")))
            else:
                resultado_id = item.get("resultado_id")
                row = upserted_by_resultado.get(str(resultado_id)) if resultado_id is not None else None
            if row:
                ordered_rows.append(row)
        return ordered_rows

    async def create_prospecto_manual(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
        usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Inserta un prospecto manual etiquetado como fuente usuario."""

        body = dict(payload)
        if usuario_id:
            org_id = await self._get_usuario_organizacion_id(usuario_id=usuario_id)
            if org_id:
                body.setdefault("organizacion_id", str(org_id))

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            json=[body],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospecto_manual_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"prospecto_manual_invalid:{row!r}")
        return row

    async def list_prospectos_by_ids(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        prospecto_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene prospectos filtrando por su identificador."""

        if not prospecto_ids:
            return []
        ids_param = ",".join(str(value) for value in prospecto_ids)
        params = {"id": f"in.({ids_param})"}
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                params=params,
                organizacion_id=organizacion_id,
            )
        else:
            if not usuario_token:
                raise CRMRepositoryError("prospectos_by_ids_missing_token")
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=params,
            )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos: {data!r}")
        return data

    async def list_prospectos(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
        fuente: str | None = None,
        lookup_status: str | None = None,
        email_lookup_status: str | None = None,
        website_lookup_status: str | None = None,
        email_domain_relation: str | None = None,
        segmento: str | None = None,
        carrier_type: str | None = None,
        order: str | None = None,
        stage: str | None = None,
        whatsapp_permitido: bool | None = None,
        llamada_permitida: bool | None = None,
        phone_present: bool | None = None,
        email_present: bool | None = None,
        website_present: bool | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        geo_estado: str | None = None,
        geo_municipio: str | None = None,
        min_rating: float | None = None,
        estrato_group: str | None = None,
        metadata_queries: list[str] | None = None,
        actividades: list[str] | None = None,
        campana_id: UUID | None = None,
        con_envio: bool | None = None,
        con_envio_canales: Sequence[str] | None = None,
        con_scraper: bool | None = None,
        envios_correo_min: int | None = None,
        envios_correo_max: int | None = None,
        envios_whatsapp_min: int | None = None,
        envios_whatsapp_max: int | None = None,
        envios_voz_min: int | None = None,
        envios_voz_max: int | None = None,
        timezone_name: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista prospectos con filtros de búsqueda y totalizador."""

        params: dict[str, str] = {
            "select": ",".join(
                [
                    "id",
                    "fuente",
                    "fuente_busqueda",
                    "display_name",
                    "nombre_comercial",
                    "titulo",
                    "nombre",
                    "primer_apellido",
                    "segundo_apellido",
                    "actividad",
                    "estrato",
                    "busqueda_ref",
                    "phone",
                    "phone_e164",
                    "telefono_principal_e164",
                    "telefono_principal_tipo_linea",
                    "telefono_principal_extension",
                    "telefono_movil_1_e164",
                    "telefono_movil_1_tipo_linea",
                    "carrier_type",
                    "email",
                    "correo_principal",
                    "correo_secundario",
                    "website",
                    "address",
                    "address_full",
                    "tipo_vialidad",
                    "nombre_vialidad",
                    "numero_exterior",
                    "numero_interior",
                    "colonia",
                    "codigo_postal",
                    "estado_cve",
                    "estado_nombre",
                    "municipio_cve",
                    "municipio_nombre",
                    "localidad_cve",
                    "localidad",
                    "asentamiento",
                    "entre_calles",
                    "referencia",
                    "rating",
                    "whatsapp_permitido",
                    "llamada_permitida",
                    "lookup_status",
                    "segmento",
                    "google_primary_type",
                    "google_primary_type_display_name",
                    "google_types",
                    "metadata",
                    "creado_en",
                    "email_lookup_status",
                    "email_risk_score",
                    "email_recommendation",
                    "website_lookup_status",
                    "website_http_status",
                ]
            ),
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        and_filters: list[str] = []

        if fuente:
            params["fuente"] = f"eq.{fuente}"
        if lookup_status:
            params["lookup_status"] = f"eq.{lookup_status}"
        if email_lookup_status:
            params["email_lookup_status"] = f"eq.{email_lookup_status}"
        if website_lookup_status:
            params["website_lookup_status"] = f"eq.{website_lookup_status}"
        if email_domain_relation:
            params["email_domain_relation"] = f"eq.{email_domain_relation}"
        if segmento:
            params["segmento"] = f"eq.{segmento}"
        if carrier_type:
            params["carrier_type"] = f"eq.{carrier_type}"
        if stage:
            params["stage"] = f"eq.{stage}"
        if whatsapp_permitido is not None:
            params["whatsapp_permitido"] = f"eq.{str(whatsapp_permitido).lower()}"
        if llamada_permitida is not None:
            params["llamada_permitida"] = f"eq.{str(llamada_permitida).lower()}"
        contact_phone_fields = ("phone", "phone_e164", "telefono_principal_e164", "telefono_movil_1_e164")
        contact_email_fields = ("email", "correo_principal", "correo_secundario")
        contact_website_fields = ("website",)
        if phone_present is True:
            and_filters.append(_postgrest_presence_clause(contact_phone_fields, True))
        elif phone_present is False:
            and_filters.append(_postgrest_presence_clause(contact_phone_fields, False))
        if email_present is True:
            and_filters.append(_postgrest_presence_clause(contact_email_fields, True))
        elif email_present is False:
            and_filters.append(_postgrest_presence_clause(contact_email_fields, False))
        if website_present is True:
            and_filters.append(_postgrest_presence_clause(contact_website_fields, True))
        elif website_present is False:
            and_filters.append(_postgrest_presence_clause(contact_website_fields, False))
        # `creado_en` is a timestamptz. The UI sends dates (YYYY-MM-DD) in the user's local
        # timezone; we convert those local-day boundaries into UTC instants so filtering by
        # "Hoy" behaves as expected (e.g. America/Mexico_City vs UTC).
        if date_from or date_to:
            zone = _resolve_timezone_zone(timezone_name)
            if date_from:
                start_local = datetime.combine(date_from, datetime.min.time(), tzinfo=zone)
                start_utc = start_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.gte.{start_utc}")
            if date_to:
                end_local = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=zone)
                end_utc = end_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.lt.{end_utc}")

        if min_rating is not None:
            params["rating"] = f"gte.{min_rating}"

        envio_count_filters = (
            ("envios_correo_total", envios_correo_min, envios_correo_max),
            ("envios_whatsapp_total", envios_whatsapp_min, envios_whatsapp_max),
            ("envios_voz_total", envios_voz_min, envios_voz_max),
        )
        for column_name, minimum, maximum in envio_count_filters:
            if minimum is not None:
                and_filters.append(f"{column_name}.gte.{int(minimum)}")
            if maximum is not None:
                and_filters.append(f"{column_name}.lte.{int(maximum)}")

        if estrato_group:
            normalized_estrato_group = str(estrato_group).strip().lower()
            if normalized_estrato_group:
                estrato_pattern: str
                if normalized_estrato_group == "micro":
                    estrato_pattern = "*micro*"
                elif normalized_estrato_group == "pequena":
                    estrato_pattern = "*peque*"
                elif normalized_estrato_group == "mediana":
                    estrato_pattern = "*mediana*"
                elif normalized_estrato_group == "grande":
                    estrato_pattern = "*grande*"
                else:
                    sanitized = normalized_estrato_group
                    for char in "(),*":
                        sanitized = sanitized.replace(char, " ")
                    sanitized = " ".join(sanitized.split())
                    if sanitized:
                        estrato_pattern = f"*{sanitized}*"
                    else:
                        estrato_pattern = ""
                if estrato_pattern:
                    and_filters.append(f"estrato.ilike.{estrato_pattern}")

        if search:
            sanitized = search.strip()
            for char in "(),*":
                sanitized = sanitized.replace(char, " ")
            pattern = f"*{sanitized}*"
            or_filters = ",".join(
                [
                    f"display_name.ilike.{pattern}",
                    f"nombre_comercial.ilike.{pattern}",
                    f"titulo.ilike.{pattern}",
                    f"nombre.ilike.{pattern}",
                    f"primer_apellido.ilike.{pattern}",
                    f"segundo_apellido.ilike.{pattern}",
                    f"actividad.ilike.{pattern}",
                    f"phone.ilike.{pattern}",
                    f"phone_e164.ilike.{pattern}",
                    f"telefono_principal_e164.ilike.{pattern}",
                    f"telefono_movil_1_e164.ilike.{pattern}",
                    f"email.ilike.{pattern}",
                    f"correo_principal.ilike.{pattern}",
                    f"correo_secundario.ilike.{pattern}",
                    f"website.ilike.{pattern}",
                    f"address.ilike.{pattern}",
                    f"address_full.ilike.{pattern}",
                    f"tipo_vialidad.ilike.{pattern}",
                    f"nombre_vialidad.ilike.{pattern}",
                    f"numero_exterior.ilike.{pattern}",
                    f"colonia.ilike.{pattern}",
                    f"codigo_postal.ilike.{pattern}",
                    f"estado_nombre.ilike.{pattern}",
                    f"municipio_nombre.ilike.{pattern}",
                    f"localidad.ilike.{pattern}",
                ]
            )
            and_filters.append(f"or({or_filters})")

        if metadata_queries:
            unique_queries: list[str] = []
            seen_queries: set[str] = set()
            for value in metadata_queries:
                candidate = str(value or "").strip()
                if not candidate or candidate in seen_queries:
                    continue
                seen_queries.add(candidate)
                unique_queries.append(candidate)
            if unique_queries:
                query_in_clause = _postgrest_in_clause(sorted(unique_queries))
                and_filters.append(
                    f"or(query_sort.{query_in_clause},busqueda_ref.{query_in_clause})"
                )

        if actividades:
            unique_activities = []
            seen_acts: set[str] = set()
            for activity in actividades:
                candidate = str(activity or "").strip()
                if not candidate or candidate in seen_acts:
                    continue
                seen_acts.add(candidate)
                unique_activities.append(candidate)
            if unique_activities:
                params["actividad"] = _postgrest_in_clause(unique_activities)

        geo_filters_pushed = False
        geo_postgrest_filters = _build_geo_postgrest_filters(
            geo_estado=geo_estado,
            geo_municipio=geo_municipio,
        )
        if geo_postgrest_filters:
            and_filters.extend(geo_postgrest_filters)
            geo_filters_pushed = True

        if and_filters:
            params["and"] = "(" + ",".join(and_filters) + ")"

        include_ids: set[str] | None = None
        exclude_ids: set[str] = set()
        normalized_con_envio_canales = sorted(
            {
                str(value or "").strip().lower()
                for value in (con_envio_canales or [])
                if str(value or "").strip().lower() in {"correo", "whatsapp", "llamada"}
            }
        )

        envio_prospecto_ids: set[str] | None = None
        if campana_id is not None or con_envio is not None or normalized_con_envio_canales:
            envio_prospecto_ids = await self._list_prospecto_ids_with_contact_envios(
                usuario_token=usuario_token,
                organizacion_id=organizacion_id,
                campana_id=campana_id,
                canales=normalized_con_envio_canales or None,
            )
        if campana_id is not None:
            if con_envio is False:
                return [], 0
            if not envio_prospecto_ids:
                return [], 0
            include_ids = set(envio_prospecto_ids)
        elif con_envio is True:
            if not envio_prospecto_ids:
                return [], 0
            include_ids = set(envio_prospecto_ids)
        elif con_envio is False:
            if envio_prospecto_ids:
                exclude_ids.update(envio_prospecto_ids)
        elif normalized_con_envio_canales:
            if not envio_prospecto_ids:
                return [], 0
            include_ids = set(envio_prospecto_ids)

        if con_scraper is not None:
            scraper_prospecto_ids = await self._list_prospecto_ids_with_scraper_jobs(
                usuario_token=usuario_token,
                organizacion_id=organizacion_id,
            )
            if con_scraper:
                if not scraper_prospecto_ids:
                    return [], 0
                if include_ids is None:
                    include_ids = set(scraper_prospecto_ids)
                else:
                    include_ids &= scraper_prospecto_ids
            elif scraper_prospecto_ids:
                exclude_ids.update(scraper_prospecto_ids)

        if include_ids is not None:
            if exclude_ids:
                include_ids -= exclude_ids
            if not include_ids:
                return [], 0
            # Avoid extremely long URLs with id=in(...) when ID set is large.
            # Use backend scan mode to keep all other filters intact.
            if len(include_ids) > 400:
                return await self._list_prospectos_matching_ids(
                    usuario_token=usuario_token,
                    params=params,
                    included_ids=include_ids,
                    limit=limit,
                    offset=offset,
                    geo_estado=geo_estado,
                    geo_municipio=geo_municipio,
                )
            params["id"] = _postgrest_in_clause(sorted(include_ids))
        elif exclude_ids:
            return await self._list_prospectos_excluding_ids(
                usuario_token=usuario_token,
                params=params,
                excluded_ids=exclude_ids,
                limit=limit,
                offset=offset,
                geo_estado=geo_estado,
                geo_municipio=geo_municipio,
            )

        if (geo_estado or geo_municipio) and not geo_filters_pushed:
            return await self._list_prospectos_with_geo_scan(
                usuario_token=usuario_token,
                params=params,
                limit=limit,
                offset=offset,
                geo_estado=geo_estado,
                geo_municipio=geo_municipio,
            )

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos: {data!r}")
        total_from_header = self._extract_total_count(resp.headers.get("content-range"))
        if total_from_header is not None:
            total = total_from_header
        else:
            total = len(data)
            # Fallback: algunos entornos no regresan content-range total con filtros complejos.
            # Si la página viene llena, primero intentamos count exacto ligero (HEAD/GET limit=1)
            # y solo al final caemos a escaneo paginado.
            if len(data) >= limit:
                exact_total = await self._count_prospectos_exact(
                    usuario_token=usuario_token,
                    params=params,
                )
                if exact_total is not None:
                    total = exact_total
                else:
                    total = await self._count_prospectos_scan(
                        usuario_token=usuario_token,
                        params=params,
                    )
        return data, total

    async def _list_prospectos_with_query_scan(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
        limit: int,
        offset: int,
        query_filters: Sequence[str],
        geo_estado: str | None = None,
        geo_municipio: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Escanea prospectos filtrando grupos por huellas históricas de consulta."""

        if limit <= 0:
            return [], 0
        filtered_rows: list[dict[str, Any]] = []
        filtered_total = 0
        scan_offset = 0
        page_size = max(500, min(1000, limit * 2))
        max_scan_rows = 200_000
        normalized_filters = [str(value or "").strip() for value in query_filters if str(value or "").strip()]
        if not normalized_filters:
            return [], 0

        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
                prefer="count=exact",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (query scan): {data!r}")
            if not data:
                break

            for row in data:
                if not isinstance(row, dict):
                    continue
                if not _row_matches_query_filters(row, query_filters=normalized_filters):
                    continue
                if not _row_matches_geo_filters(
                    row,
                    geo_estado=geo_estado,
                    geo_municipio=geo_municipio,
                ):
                    continue
                if filtered_total >= offset and len(filtered_rows) < limit:
                    filtered_rows.append(row)
                filtered_total += 1

            scan_offset += len(data)

        return filtered_rows, filtered_total

    async def _count_prospectos_exact(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
    ) -> int | None:
        """Try exact count via PostgREST headers without scanning all rows."""

        count_params = dict(params)
        count_params["select"] = "id"
        count_params["limit"] = "1"
        count_params["offset"] = "0"
        count_params.pop("order", None)

        try:
            head_resp = await self._request_with_user(
                "HEAD",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=count_params,
                prefer="count=exact",
            )
            total = self._extract_total_count(head_resp.headers.get("content-range"))
            if total is not None:
                return total
        except CRMRepositoryError:
            pass

        try:
            get_resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=count_params,
                prefer="count=exact",
            )
            total = self._extract_total_count(get_resp.headers.get("content-range"))
            if total is not None:
                return total
        except CRMRepositoryError:
            return None

        return None

    async def _count_prospectos_scan(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
    ) -> int:
        """Cuenta filas reales por escaneo cuando PostgREST no devuelve total en content-range."""

        total = 0
        scan_offset = 0
        page_size = 1000
        max_scan_rows = 200_000

        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
            )
            page = resp.json() or []
            if not isinstance(page, list):
                raise CRMRepositoryError(f"Respuesta inesperada al contar prospectos (scan): {page!r}")
            if not page:
                break
            total += len(page)
            scan_offset += len(page)

        return total

    async def _list_prospectos_excluding_ids(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
        excluded_ids: set[str],
        limit: int,
        offset: int,
        geo_estado: str | None = None,
        geo_municipio: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Aplica exclusión por IDs en backend para evitar URLs enormes con not.in(...)."""

        if limit <= 0:
            return [], 0
        if not geo_estado and not geo_municipio and len(excluded_ids) <= 120:
            optimized_params = dict(params)
            optimized_params["id"] = f"not.{_postgrest_in_clause(sorted(excluded_ids))}"
            optimized_params["limit"] = str(limit)
            optimized_params["offset"] = str(offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=optimized_params,
                prefer="count=exact",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (exclude direct): {data!r}")
            total = self._extract_total_count(resp.headers.get("content-range"))
            if total is None:
                count_params = dict(optimized_params)
                count_params.pop("limit", None)
                count_params.pop("offset", None)
                exact_total = await self._count_prospectos_exact(
                    usuario_token=usuario_token,
                    params=count_params,
                )
                total = (
                    exact_total
                    if exact_total is not None
                    else await self._count_prospectos_scan(
                        usuario_token=usuario_token,
                        params=count_params,
                    )
                )
            return data, total
        if not geo_estado and not geo_municipio and excluded_ids:
            base_params = dict(params)
            base_params.pop("id", None)
            base_params.pop("limit", None)
            base_params.pop("offset", None)

            filtered_rows: list[dict[str, Any]] = []
            accepted_seen = 0
            scan_offset = 0
            # Mantener la pagina dentro del limite practico de PostgREST evita
            # que una primera respuesta parcial se confunda con "ultima pagina".
            page_size = 1000
            max_scan_rows = 200_000
            target_seen = offset + limit
            must_scan_full_for_exact_total = True

            while scan_offset < max_scan_rows and (must_scan_full_for_exact_total or len(filtered_rows) < limit):
                page_params = dict(base_params)
                page_params["limit"] = str(page_size)
                page_params["offset"] = str(scan_offset)
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    token=usuario_token,
                    params=page_params,
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (exclude paged): {data!r}")
                if not data:
                    break

                for row in data:
                    if not isinstance(row, dict):
                        continue
                    row_id = row.get("id")
                    if row_id is None or str(row_id) in excluded_ids:
                        continue
                    accepted_seen += 1
                    if accepted_seen <= offset:
                        continue
                    if len(filtered_rows) < limit:
                        filtered_rows.append(row)
                    if (
                        not must_scan_full_for_exact_total
                        and accepted_seen >= target_seen
                        and len(filtered_rows) >= limit
                    ):
                        break

                scan_offset += len(data)
                if len(data) < page_size:
                    break

            effective_total = accepted_seen
            return filtered_rows, effective_total

        filtered_rows: list[dict[str, Any]] = []
        filtered_total = 0
        scan_offset = 0
        page_size = max(500, min(1000, limit * 2))
        max_scan_rows = 200_000

        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
                prefer="count=exact",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (scan): {data!r}")
            if not data:
                break

            for row in data:
                if not isinstance(row, dict):
                    continue
                row_id = row.get("id")
                if row_id is None or str(row_id) in excluded_ids:
                    continue
                if not _row_matches_geo_filters(
                    row,
                    geo_estado=geo_estado,
                    geo_municipio=geo_municipio,
                ):
                    continue
                if filtered_total >= offset and len(filtered_rows) < limit:
                    filtered_rows.append(row)
                filtered_total += 1

            scan_offset += len(data)

        return filtered_rows, filtered_total

    async def _list_prospectos_matching_ids(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
        included_ids: set[str],
        limit: int,
        offset: int,
        geo_estado: str | None = None,
        geo_municipio: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Aplica inclusión por IDs en backend para evitar URLs grandes con in(...)."""

        if limit <= 0:
            return [], 0
        if not included_ids:
            return [], 0

        base_params = dict(params)
        base_params.pop("id", None)
        base_params.pop("limit", None)
        base_params.pop("offset", None)
        chunk_size = 120
        rows_by_id: dict[str, dict[str, Any]] = {}
        sorted_ids = sorted(included_ids)

        for start in range(0, len(sorted_ids), chunk_size):
            chunk = sorted_ids[start : start + chunk_size]
            scan_params = dict(base_params)
            scan_params["id"] = _postgrest_in_clause(chunk)
            scan_params["limit"] = str(len(chunk))
            scan_params["offset"] = "0"
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (chunk include): {data!r}")

            for row in data:
                if not isinstance(row, dict):
                    continue
                row_id = row.get("id")
                if row_id is None:
                    continue
                if not _row_matches_geo_filters(
                    row,
                    geo_estado=geo_estado,
                    geo_municipio=geo_municipio,
                ):
                    continue
                rows_by_id[str(row_id)] = row

        ordered_rows = _sort_prospect_rows(
            list(rows_by_id.values()),
            order=params.get("order"),
        )
        total = len(ordered_rows)
        return ordered_rows[offset : offset + limit], total

    async def _list_prospectos_with_geo_scan(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
        limit: int,
        offset: int,
        geo_estado: str | None = None,
        geo_municipio: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Filtra por estado/municipio en backend para soportar formatos de metadata heterogéneos."""

        if limit <= 0:
            return [], 0
        filtered_rows: list[dict[str, Any]] = []
        filtered_total = 0
        scan_offset = 0
        page_size = max(500, min(1000, limit * 2))
        max_scan_rows = 200_000

        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
                prefer="count=exact",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos (geo scan): {data!r}")
            if not data:
                break

            for row in data:
                if not isinstance(row, dict):
                    continue
                if not _row_matches_geo_filters(
                    row,
                    geo_estado=geo_estado,
                    geo_municipio=geo_municipio,
                ):
                    continue
                if filtered_total >= offset and len(filtered_rows) < limit:
                    filtered_rows.append(row)
                filtered_total += 1

            scan_offset += len(data)

        return filtered_rows, filtered_total

    async def _list_prospecto_ids_with_contact_envios(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        campana_id: UUID | None = None,
        canales: Sequence[str] | None = None,
    ) -> set[str]:
        def _normalize_envio_channel(value: str | None) -> str | None:
            normalized = str(value or "").strip().lower()
            if not normalized:
                return None
            if "whatsapp" in normalized or "whastapp" in normalized or normalized == "wa":
                return "whatsapp"
            if "correo" in normalized or "email" in normalized or "mail" in normalized or normalized == "manual":
                return "correo"
            if "llamada" in normalized or "voz" in normalized or "call" in normalized or "phone" in normalized:
                return "llamada"
            return normalized

        normalized_canales_set: set[str] = set()
        for raw in canales or []:
            value = _normalize_envio_channel(str(raw or ""))
            if not value:
                continue
            normalized_canales_set.add(value)
        normalized_canales = sorted(normalized_canales_set)
        canales_key = ",".join(normalized_canales) if normalized_canales else "__all_canales__"
        cache_key = _build_prospectos_ids_cache_key(
            usuario_token=usuario_token,
            organizacion_id=organizacion_id,
            suffix=f"envios:{str(campana_id) if campana_id else '__all__'}:{canales_key}",
        )
        cached_ids = _read_prospectos_ids_cache(
            _PROSPECTOS_ENVIO_IDS_CACHE,
            key=cache_key,
            ttl_seconds=PROSPECTOS_ENVIO_IDS_CACHE_TTL_SECONDS,
        )
        if cached_ids is not None:
            return cached_ids

        ids: set[str] = set()
        batch_ids_filter: set[str] | None = None
        if campana_id is not None:
            batch_ids_filter = set()
            batch_offset = 0
            batch_page_size = 200
            while True:
                batch_rows, _ = await self.list_contact_batches(
                    usuario_token=usuario_token,
                    limit=batch_page_size,
                    offset=batch_offset,
                    campana_id=campana_id,
                )
                if not batch_rows:
                    break
                for row in batch_rows:
                    if not isinstance(row, dict):
                        continue
                    batch_id = row.get("id")
                    if batch_id is None:
                        continue
                    batch_ids_filter.add(str(batch_id))
                if len(batch_rows) < batch_page_size:
                    break
                batch_offset += len(batch_rows)
            if not batch_ids_filter:
                return ids

        if campana_id is None:
            page_size = 5000
            max_scan = 200000
            offset = 0
            while offset < max_scan:
                params: dict[str, str] = {
                    "select": "prospecto_id,canales,total_envios",
                    "limit": str(page_size),
                    "offset": str(offset),
                    "order": "prospecto_id.asc",
                    "total_envios": "gt.0",
                }
                if organizacion_id is not None:
                    params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/prospeccion_prospecto_contacto_stats",
                    token=usuario_token,
                    params=params,
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"contact_envio_ids_invalid:{data!r}")
                if not data:
                    break
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    prospecto_id = row.get("prospecto_id")
                    if prospecto_id is None:
                        continue
                    if normalized_canales:
                        canales_raw = row.get("canales")
                        if not isinstance(canales_raw, dict):
                            continue
                        matches_channel = False
                        for canal_key, detail in canales_raw.items():
                            canal_normalized = _normalize_envio_channel(canal_key)
                            if not canal_normalized or canal_normalized not in normalized_canales_set:
                                continue
                            total_value = 0
                            if isinstance(detail, dict):
                                total_value = int(detail.get("total") or 0)
                            elif isinstance(detail, (int, float, str)):
                                try:
                                    total_value = int(float(detail))
                                except (TypeError, ValueError):
                                    total_value = 0
                            if total_value > 0:
                                matches_channel = True
                                break
                        if not matches_channel:
                            continue
                    ids.add(str(prospecto_id))
                offset += len(data)
        else:
            batch_chunks: list[list[str]]
            if batch_ids_filter:
                batch_values = sorted(batch_ids_filter)
                chunk_size = 100
                batch_chunks = [
                    batch_values[index : index + chunk_size]
                    for index in range(0, len(batch_values), chunk_size)
                ]
            else:
                batch_chunks = [[]]

            page_size = 5000
            max_scan = 50000
            for batch_chunk in batch_chunks:
                offset = 0
                while offset < max_scan:
                    params = {
                        "select": "prospecto_id,canal",
                        "limit": str(page_size),
                        "offset": str(offset),
                        "estado": "neq.cancelado",
                    }
                    if organizacion_id is not None:
                        params["organizacion_id"] = f"eq.{organizacion_id}"
                    if batch_chunk:
                        params["batch_id"] = _postgrest_in_clause(batch_chunk)
                    resp = await self._request_with_user(
                        "GET",
                        "/rest/v1/prospeccion_contacto_envio",
                        token=usuario_token,
                        params=params,
                    )
                    data = resp.json() or []
                    if not isinstance(data, list):
                        raise CRMRepositoryError(f"contact_envio_ids_invalid:{data!r}")
                    if not data:
                        break
                    for row in data:
                        if not isinstance(row, dict):
                            continue
                        if normalized_canales:
                            row_canal = _normalize_envio_channel(row.get("canal"))
                            if not row_canal or row_canal not in normalized_canales_set:
                                continue
                        prospecto_id = row.get("prospecto_id")
                        if prospecto_id is None:
                            continue
                        ids.add(str(prospecto_id))
                    offset += len(data)
        _write_prospectos_ids_cache(
            _PROSPECTOS_ENVIO_IDS_CACHE,
            key=cache_key,
            values=ids,
        )
        return ids

    async def _list_prospecto_ids_with_scraper_jobs(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
    ) -> set[str]:
        cache_key = _build_prospectos_ids_cache_key(
            usuario_token=usuario_token,
            organizacion_id=organizacion_id,
            suffix="scraper",
        )
        cached_ids = _read_prospectos_ids_cache(
            _PROSPECTOS_SCRAPER_IDS_CACHE,
            key=cache_key,
            ttl_seconds=PROSPECTOS_SCRAPER_IDS_CACHE_TTL_SECONDS,
        )
        if cached_ids is not None:
            return cached_ids

        ids: set[str] = set()
        page_size = 5000
        max_scan = 50000
        offset = 0

        while offset < max_scan:
            params = {
                "select": "metadata",
                "metadata->>prospecto_id": "not.is.null",
                "limit": str(page_size),
                "offset": str(offset),
            }
            if organizacion_id is not None:
                params["organizacion_id"] = f"eq.{organizacion_id}"
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_buscador_jobs",
                token=usuario_token,
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"scraper_job_ids_invalid:{data!r}")
            if not data:
                break
            for row in data:
                if not isinstance(row, dict):
                    continue
                metadata = row.get("metadata")
                if not isinstance(metadata, dict):
                    continue
                prospecto_id = metadata.get("prospecto_id")
                if prospecto_id is None:
                    continue
                value = str(prospecto_id).strip()
                if value:
                    ids.add(value)
            offset += len(data)
        _write_prospectos_ids_cache(
            _PROSPECTOS_SCRAPER_IDS_CACHE,
            key=cache_key,
            values=ids,
        )
        return ids

    async def list_prospecto_query_metadata(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        query_filters: list[str] | None = None,
        fuente: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        timezone_name: str | None = None,
    ) -> dict[str, Any]:
        normalized_query_filters: list[str] | None = None
        if query_filters:
            normalized_values = sorted(
                {
                    str(value or "").strip()
                    for value in query_filters
                    if str(value or "").strip()
                }
            )
            normalized_query_filters = normalized_values or None

        zone = _resolve_timezone_zone(timezone_name)
        date_from_utc: str | None = None
        date_to_utc: str | None = None
        if date_from:
            start_local = datetime.combine(date_from, datetime.min.time(), tzinfo=zone)
            date_from_utc = start_local.astimezone(timezone.utc).isoformat()
        if date_to:
            end_local = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=zone)
            date_to_utc = end_local.astimezone(timezone.utc).isoformat()

        # Fast path: usamos RPCs agregados en DB para evitar scans masivos en Python.
        # Si algo falla (migración faltante o error puntual), se usa fallback legacy.
        try:
            query_payload: dict[str, Any] = {
                "p_query_filters": normalized_query_filters,
                "p_fuente": fuente or None,
                "p_date_from": date_from_utc,
                "p_date_to": date_to_utc,
            }
            queries_resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/prospeccion_queries_resumen",
                token=usuario_token,
                json=query_payload,
            )
            queries_data = queries_resp.json() or []
            if not isinstance(queries_data, list):
                raise CRMRepositoryError(f"prospecto_queries_resumen_invalid:{queries_data!r}")

            activities_resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/prospeccion_activities_resumen",
                token=usuario_token,
                json=query_payload,
            )
            activities_data = activities_resp.json() or []
            if not isinstance(activities_data, list):
                raise CRMRepositoryError(f"prospecto_activities_resumen_invalid:{activities_data!r}")
            segmentos_resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/prospeccion_segmentos_resumen",
                token=usuario_token,
                json=query_payload,
            )
            segmentos_data = segmentos_resp.json() or []
            if not isinstance(segmentos_data, list):
                raise CRMRepositoryError(f"prospecto_segmentos_resumen_invalid:{segmentos_data!r}")

            queries: list[dict[str, Any]] = []
            for row in queries_data:
                if not isinstance(row, dict):
                    continue
                value = str(row.get("value") or "").strip()
                if not value:
                    continue
                label = str(row.get("label") or value).strip() or value
                count_raw = row.get("count")
                try:
                    count_value = int(count_raw or 0)
                except (TypeError, ValueError):
                    count_value = 0
                created_at = row.get("created_at")
                estado_label = _format_query_geo_state_label(row.get("estado"))
                municipio_label = _format_query_geo_municipality_label(row.get("municipio"))
                queries.append(
                    {
                        "value": value,
                        "label": label,
                        "count": count_value,
                        "created_at": created_at if isinstance(created_at, str) else None,
                        "estado": estado_label,
                        "municipio": municipio_label,
                    }
                )

            query_values = {item["value"] for item in queries}
            if normalized_query_filters is not None:
                query_values = set(normalized_query_filters)
            activities = sorted(
                {
                    str(row.get("activity") or "").strip()
                    for row in activities_data
                    if isinstance(row, dict) and str(row.get("activity") or "").strip()
                }
            )
            segmentos = sorted(
                {
                    str(
                        row.get("segmento")
                        if isinstance(row, dict)
                        else row
                    ).strip()
                    for row in segmentos_data
                    if (
                        (isinstance(row, dict) and str(row.get("segmento") or "").strip())
                        or (isinstance(row, str) and row.strip())
                    )
                }
            )
            if normalized_query_filters is None:
                direct_taxonomy = await self._list_prospect_taxonomy(
                    usuario_token=usuario_token,
                    organizacion_id=organizacion_id,
                    fuente=fuente,
                    date_from=date_from,
                    date_to=date_to,
                    timezone_name=timezone_name,
                )
                activities = sorted(direct_taxonomy["activities"], key=lambda value: value.casefold())
                segmentos = sorted(direct_taxonomy["segmentos"], key=lambda value: value.casefold())
            if normalized_query_filters is not None:
                queries = [
                    {
                        "value": value,
                        "label": next(
                            (item["label"] for item in queries if item["value"] == value),
                            value,
                        ),
                        "count": next(
                            (item["count"] for item in queries if item["value"] == value),
                            0,
                        ),
                        "created_at": next(
                            (item["created_at"] for item in queries if item["value"] == value),
                            None,
                        ),
                        "estado": next(
                            (item["estado"] for item in queries if item["value"] == value),
                            None,
                        ),
                        "municipio": next(
                            (item["municipio"] for item in queries if item["value"] == value),
                            None,
                        ),
                    }
                    for value in sorted(query_values, key=lambda item: item.casefold())
                ]
            else:
                queries.sort(key=lambda item: item["label"].casefold())

            return {
                "queries": queries,
                "activities": activities,
                "segmentos": segmentos,
            }
        except CRMRepositoryError:
            pass

        params: dict[str, str] = {
            "select": "id,actividad,segmento,metadata,creado_en,busqueda_ref",
            # Orden estable para paginación con offset: evita duplicados/saltos entre páginas.
            "order": "query_sort.asc,actividad.asc,id.asc",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if fuente:
            params["fuente"] = f"eq.{fuente}"
        if date_from or date_to:
            and_filters: list[str] = []
            if date_from:
                start_local = datetime.combine(date_from, datetime.min.time(), tzinfo=zone)
                start_utc = start_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.gte.{start_utc}")
            if date_to:
                end_local = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=zone)
                end_utc = end_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.lt.{end_utc}")
            if and_filters:
                params["and"] = "(" + ",".join(and_filters) + ")"

        # Leemos en páginas para evitar recortes silenciosos en tenants con más de 5k prospectos.
        # Esta metadata alimenta los contadores por consulta/lote en UI y debe ser exacta.
        data: list[dict[str, Any]] = []
        seen_row_ids: set[str] = set()
        scan_offset = 0
        page_size = 1000
        max_scan_rows = 200_000
        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
            )
            page = resp.json() or []
            if not isinstance(page, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar metadata de prospectos: {page!r}")
            if not page:
                break
            for row in page:
                if not isinstance(row, dict):
                    continue
                row_id = row.get("id")
                if row_id is not None:
                    row_id_key = str(row_id)
                    if row_id_key in seen_row_ids:
                        continue
                    seen_row_ids.add(row_id_key)
                data.append(row)
            scan_offset += len(page)
        selected_queries: set[str] | None = None
        if normalized_query_filters:
            selected_queries = {value.casefold() for value in normalized_query_filters}

        activity_codes: set[str] = set()
        for row in data:
            metadata = row.get("metadata")
            if not isinstance(metadata, dict):
                continue
            busqueda_meta = metadata.get("busqueda_meta")
            if not isinstance(busqueda_meta, dict):
                continue
            advanced = busqueda_meta.get("advanced_filters")
            if not isinstance(advanced, dict):
                continue
            codes = advanced.get("actividad_codigos")
            if not isinstance(codes, list):
                continue
            for raw in codes:
                candidate = str(raw or "").strip()
                if candidate:
                    activity_codes.add(candidate)

        scian_titles: dict[str, str] = {}
        if activity_codes:
            scian_titles = await self.list_scian_titles(codes=sorted(activity_codes))

        query_labels: dict[str, str] = {}
        query_values: set[str] = set()
        query_counts: dict[str, int] = {}
        query_latest_created_at: dict[str, str] = {}
        query_state_labels: dict[str, str] = {}
        query_municipality_labels: dict[str, str] = {}
        activity_values: set[str] = set()
        segmento_values: set[str] = set()
        for row in data:
            metadata = row.get("metadata")
            row_queries: list[str] = []
            value: str | None = None
            label: str | None = None
            state_label: str | None = None
            municipality_label: str | None = None
            if isinstance(metadata, dict):
                busqueda_ref = row.get("busqueda_ref")
                busqueda_id = metadata.get("busqueda_id")
                busqueda_id_value = None
                if isinstance(busqueda_id, str) and busqueda_id.strip():
                    busqueda_id_value = busqueda_id.strip()
                busqueda_meta = metadata.get("busqueda_meta")
                advanced = busqueda_meta.get("advanced_filters") if isinstance(busqueda_meta, dict) else None
                texto_busqueda = None
                actividad_codigos: list[str] = []
                meta_query: str | None = None
                if isinstance(busqueda_meta, dict):
                    raw_meta_query = busqueda_meta.get("query")
                    if isinstance(raw_meta_query, str) and raw_meta_query.strip():
                        meta_query = raw_meta_query.strip()
                if isinstance(advanced, dict):
                    raw_texto = advanced.get("texto_busqueda")
                    if isinstance(raw_texto, str):
                        candidate = raw_texto.strip()
                        if candidate:
                            texto_busqueda = candidate
                    geo_estados_raw = advanced.get("geo_estados")
                    geo_municipios_raw = advanced.get("geo_municipios")
                    state_codes: list[str] = []
                    municipality_pairs: list[tuple[str | None, str | None]] = []
                    if isinstance(geo_estados_raw, list):
                        for raw_state in geo_estados_raw:
                            code_digits = "".join(ch for ch in str(raw_state or "") if ch.isdigit())
                            if code_digits:
                                state_codes.append(code_digits[-2:].zfill(2))
                    if isinstance(geo_municipios_raw, list):
                        for raw_pair in geo_municipios_raw:
                            parts = str(raw_pair or "").split("::")
                            state_part = "".join(ch for ch in (parts[0] if parts else "") if ch.isdigit())
                            muni_part = "".join(ch for ch in (parts[1] if len(parts) >= 2 else "") if ch.isdigit())
                            state_code = state_part[-2:].zfill(2) if state_part else None
                            muni_code = muni_part[-3:].zfill(3) if muni_part else None
                            if state_code:
                                state_codes.append(state_code)
                            municipality_pairs.append((state_code, muni_code))

                    unique_state_codes: list[str] = []
                    seen_state_codes: set[str] = set()
                    for code in state_codes:
                        if code in seen_state_codes:
                            continue
                        seen_state_codes.add(code)
                        unique_state_codes.append(code)
                    state_names = [
                        name
                        for name in (get_state_name(code) for code in unique_state_codes)
                        if isinstance(name, str) and name.strip()
                    ]
                    if len(state_names) == 1:
                        state_label = state_names[0]
                    elif len(state_names) > 1:
                        state_label = "Múltiples"

                    municipality_names: list[str] = []
                    seen_municipality_names: set[str] = set()
                    for state_code, municipality_code in municipality_pairs:
                        name = get_municipality_name(state_code, municipality_code)
                        if not isinstance(name, str) or not name.strip():
                            continue
                        normalized_name = name.strip().casefold()
                        if normalized_name in seen_municipality_names:
                            continue
                        seen_municipality_names.add(normalized_name)
                        municipality_names.append(name.strip())
                    if len(municipality_names) == 1:
                        municipality_label = municipality_names[0]
                    elif len(municipality_names) > 1:
                        municipality_label = "Múltiples"

                    raw_codes = advanced.get("actividad_codigos")
                    if isinstance(raw_codes, list):
                        actividad_codigos = [
                            str(code).strip() for code in raw_codes if str(code or "").strip()
                        ]

                busqueda_query = metadata.get("busqueda_query")
                raw_query = metadata.get("query") if isinstance(metadata.get("query"), str) else None
                if isinstance(busqueda_ref, str) and busqueda_ref.strip():
                    value = busqueda_ref.strip()
                elif busqueda_id_value:
                    value = busqueda_id_value
                elif isinstance(busqueda_query, str) and busqueda_query.strip():
                    value = busqueda_query.strip()
                elif isinstance(raw_query, str) and raw_query.strip():
                    value = raw_query.strip()
                elif meta_query:
                    value = meta_query
                if texto_busqueda:
                    label = texto_busqueda
                elif actividad_codigos:
                    names = [scian_titles.get(code, code) for code in actividad_codigos]
                    base = names[0] if names else ""
                    if base:
                        label = base if len(names) == 1 else f"{base} +{len(names) - 1}"
                if not label:
                    if isinstance(busqueda_query, str) and busqueda_query.strip():
                        label = busqueda_query.strip()
                    elif isinstance(raw_query, str) and raw_query.strip():
                        label = raw_query.strip()
                    else:
                        label = value

            if value:
                query_values.add(value)
                query_labels.setdefault(value, label or value)
                query_counts[value] = query_counts.get(value, 0) + 1
                if state_label and not query_state_labels.get(value):
                    query_state_labels[value] = state_label
                if municipality_label and not query_municipality_labels.get(value):
                    query_municipality_labels[value] = municipality_label
                created_at = row.get("creado_en")
                if isinstance(created_at, str) and created_at.strip():
                    current_latest = query_latest_created_at.get(value)
                    if current_latest is None or created_at > current_latest:
                        query_latest_created_at[value] = created_at
                row_queries.append(value)

            if selected_queries is not None:
                matched = False
                for candidate in row_queries:
                    if candidate.casefold() in selected_queries:
                        matched = True
                        break
                if not matched:
                    continue

            actividad = row.get("actividad")
            if isinstance(actividad, str):
                candidate = actividad.strip()
                if candidate:
                    activity_values.add(candidate)
            segmento = row.get("segmento")
            if isinstance(segmento, str):
                candidate = segmento.strip()
                if candidate:
                    segmento_values.add(candidate)

        if selected_queries is not None:
            query_values = {str(value).strip() for value in (normalized_query_filters or []) if str(value or "").strip()}
        queries = [
            {
                "value": value,
                "label": query_labels.get(value, value),
                "count": query_counts.get(value, 0),
                "created_at": query_latest_created_at.get(value),
                "estado": query_state_labels.get(value),
                "municipio": query_municipality_labels.get(value),
            }
            for value in query_values
        ]
        queries.sort(key=lambda item: item["label"].casefold())
        return {
            "queries": queries,
            "activities": sorted(activity_values),
            "segmentos": sorted(segmento_values, key=lambda value: value.casefold()),
        }

    async def _list_prospect_taxonomy(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        fuente: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        timezone_name: str | None = None,
    ) -> dict[str, set[str]]:
        zone = _resolve_timezone_zone(timezone_name)
        params: dict[str, str] = {
            "select": "id,actividad,segmento",
            "order": "id.asc",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if fuente:
            params["fuente"] = f"eq.{fuente}"
        if date_from or date_to:
            and_filters: list[str] = []
            if date_from:
                start_local = datetime.combine(date_from, datetime.min.time(), tzinfo=zone)
                start_utc = start_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.gte.{start_utc}")
            if date_to:
                end_local = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=zone)
                end_utc = end_local.astimezone(timezone.utc).isoformat()
                and_filters.append(f"creado_en.lt.{end_utc}")
            if and_filters:
                params["and"] = "(" + ",".join(and_filters) + ")"

        activities: set[str] = set()
        segmentos: set[str] = set()
        seen_row_ids: set[str] = set()
        scan_offset = 0
        page_size = 1000
        max_scan_rows = 200_000

        while scan_offset < max_scan_rows:
            scan_params = dict(params)
            scan_params["limit"] = str(page_size)
            scan_params["offset"] = str(scan_offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=scan_params,
            )
            page = resp.json() or []
            if not isinstance(page, list):
                raise CRMRepositoryError(f"Respuesta inesperada al listar taxonomía de prospectos: {page!r}")
            if not page:
                break
            for row in page:
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get("id") or "").strip()
                if row_id:
                    if row_id in seen_row_ids:
                        continue
                    seen_row_ids.add(row_id)
                actividad = row.get("actividad")
                if isinstance(actividad, str):
                    candidate = actividad.strip()
                    if candidate:
                        activities.add(candidate)
                segmento = row.get("segmento")
                if isinstance(segmento, str):
                    candidate = segmento.strip()
                    if candidate:
                        segmentos.add(candidate)
            scan_offset += len(page)

        return {
            "activities": activities,
            "segmentos": segmentos,
        }

    async def get_prospeccion_user_preference(
        self,
        *,
        usuario_token: str,
        modulo: str,
        clave: str,
    ) -> dict[str, Any] | None:
        """Obtiene una preferencia de prospección para el usuario autenticado."""

        params = {
            "select": "id,modulo,clave,valor,actualizado_en",
            "modulo": f"eq.{modulo}",
            "clave": f"eq.{clave}",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_user_preferences",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"preferencia_usuario_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"preferencia_usuario_row_invalid:{row!r}")
        return row

    async def upsert_prospeccion_user_preference(
        self,
        *,
        usuario_token: str,
        modulo: str,
        clave: str,
        valor: dict[str, Any],
    ) -> dict[str, Any]:
        """Crea o actualiza una preferencia de prospección para el usuario autenticado."""

        body = {
            "modulo": modulo,
            "clave": clave,
            "valor": valor,
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_user_preferences",
            token=usuario_token,
            params={"on_conflict": "organizacion_id,usuario_id,modulo,clave"},
            json=[body],
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("preferencia_usuario_upsert_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"preferencia_usuario_upsert_invalid:{row!r}")
        return row

    async def create_ui_notification(
        self,
        *,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        request = (
            self._request_with_user(
                "POST",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                json=[payload],
                prefer="return=representation,resolution=merge-duplicates",
            )
            if self._user_token
            else self._request(
                "POST",
                "/rest/v1/ui_notificaciones",
                json=[payload],
                prefer="return=representation,resolution=merge-duplicates",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("ui_notification_create_failed")
        return row

    async def list_ui_notifications(
        self,
        *,
        usuario_id: UUID,
        organizacion_id: UUID,
        limit: int = 20,
        offset: int = 0,
        unread_only: bool = False,
        tipos: Sequence[str] | None = None,
        niveles: Sequence[str] | None = None,
        include_hidden: bool = False,
    ) -> tuple[list[dict[str, Any]], int]:
        limit_value = max(1, min(limit, 200))
        offset_value = max(0, offset)
        params: dict[str, str] = {
            "usuario_id": f"eq.{usuario_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "created_at.desc",
            "limit": str(limit_value),
        }
        if offset_value:
            params["offset"] = str(offset_value)
        if unread_only:
            params["read_at"] = "is.null"
        if not include_hidden:
            params["hidden_at"] = "is.null"
        if tipos:
            normalized_tipos = [str(item).strip() for item in tipos if str(item).strip()]
            if normalized_tipos:
                params["tipo"] = _postgrest_in_clause(normalized_tipos)
        if niveles:
            normalized_niveles = [str(item).strip() for item in niveles if str(item).strip()]
            if normalized_niveles:
                params["nivel"] = _postgrest_in_clause(normalized_niveles)

        request = (
            self._request_with_user(
                "GET",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                params=params,
                prefer="count=exact",
            )
            if self._user_token
            else self._request(
                "GET",
                "/rest/v1/ui_notificaciones",
                params=params,
                prefer="count=exact",
            )
        )
        resp = await request
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"ui_notification_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        total_value = total if total is not None else len(data)
        return [row for row in data if isinstance(row, dict)], total_value

    async def count_ui_notifications_unread(
        self,
        *,
        usuario_id: UUID,
        organizacion_id: UUID,
    ) -> int:
        request = (
            self._request_with_user(
                "GET",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                params={
                    "select": "id",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "read_at": "is.null",
                    "hidden_at": "is.null",
                    "limit": "1",
                },
                prefer="count=exact",
            )
            if self._user_token
            else self._request(
                "GET",
                "/rest/v1/ui_notificaciones",
                params={
                    "select": "id",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "read_at": "is.null",
                    "hidden_at": "is.null",
                    "limit": "1",
                },
                prefer="count=exact",
            )
        )
        resp = await request
        total = self._extract_total_count(resp.headers.get("content-range"))
        return int(total or 0)

    async def mark_ui_notification_read(
        self,
        *,
        notification_id: UUID,
        usuario_id: UUID,
        organizacion_id: UUID,
        read_at: datetime | None = None,
    ) -> dict[str, Any] | None:
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                params={
                    "id": f"eq.{notification_id}",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                },
                json={"read_at": (read_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
            if self._user_token
            else self._request(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                params={
                    "id": f"eq.{notification_id}",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                },
                json={"read_at": (read_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"ui_notification_mark_read_invalid:{row!r}")
        return row

    async def mark_all_ui_notifications_read(
        self,
        *,
        usuario_id: UUID,
        organizacion_id: UUID,
        read_at: datetime | None = None,
    ) -> int:
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                params={
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "read_at": "is.null",
                    "hidden_at": "is.null",
                },
                json={"read_at": (read_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
            if self._user_token
            else self._request(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                params={
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "read_at": "is.null",
                    "hidden_at": "is.null",
                },
                json={"read_at": (read_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"ui_notification_mark_all_read_invalid:{data!r}")
        return len(data)

    async def hide_ui_notification(
        self,
        *,
        notification_id: UUID,
        usuario_id: UUID,
        organizacion_id: UUID,
        hidden_at: datetime | None = None,
    ) -> dict[str, Any] | None:
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                token=self._user_token,
                params={
                    "id": f"eq.{notification_id}",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                },
                json={"hidden_at": (hidden_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
            if self._user_token
            else self._request(
                "PATCH",
                "/rest/v1/ui_notificaciones",
                params={
                    "id": f"eq.{notification_id}",
                    "usuario_id": f"eq.{usuario_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                },
                json={"hidden_at": (hidden_at or datetime.now(timezone.utc)).isoformat()},
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"ui_notification_hide_invalid:{row!r}")
        return row

    async def worker_get_prospecto(
        self,
        *,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{prospecto_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_prospecto_invalid:{row!r}")
        return row

    async def worker_update_prospecto_metadata(
        self,
        *,
        prospecto_id: UUID,
        metadata: dict[str, Any],
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {"id": f"eq.{prospecto_id}"}
        payload: dict[str, Any] = {"metadata": metadata}
        if organizacion_id:
            params["organizacion_id"] = f"eq.{organizacion_id}"
            # Triggers multi-tenant de algunas tablas requieren tenant explícito también en el payload.
            payload["organizacion_id"] = str(organizacion_id)
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_prospectos",
            params=params,
            json=payload,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("worker_update_prospecto_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_update_prospecto_invalid:{row!r}")
        return row

    async def list_lookup_pending_prospectos(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Obtiene prospectos con verificación pendiente o con error."""

        params = {
            "select": "id,phone,phone_e164,lookup_status",
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 200))),
            "lookup_status": "in.(pendiente,error)",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"lookup_pending_invalid:{data!r}")
        return data

    async def list_scraper_pending_prospectos(
        self,
        *,
        usuario_token: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Regresa prospectos sin correo pero con sitio web para lanzar el scraper."""

        params = {
            "select": "id,display_name,website,correo_principal,correo_secundario,segmento,metadata",
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 20))),
        }
        params["and"] = "(" + ",".join(
            [
                _postgrest_presence_clause(("email", "correo_principal", "correo_secundario"), False),
                _postgrest_presence_clause(("website",), True),
            ]
        ) + ")"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"scraper_pending_invalid:{data!r}")
        return data

    async def list_scraper_status_by_prospectos(
        self,
        *,
        usuario_token: str,
        prospecto_ids: Sequence[str | UUID],
    ) -> dict[str, dict[str, Any]]:
        """Resume el último job de scraper encontrado por prospecto."""

        normalized_ids: list[str] = []
        seen_ids: set[str] = set()
        for value in prospecto_ids:
            candidate = str(value or "").strip()
            if not candidate or candidate in seen_ids:
                continue
            seen_ids.add(candidate)
            normalized_ids.append(candidate)
        if not normalized_ids:
            return {}

        def _parse_dt(value: Any) -> datetime | None:
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                trimmed = value.strip()
                if not trimmed:
                    return None
                if trimmed.endswith("Z"):
                    trimmed = trimmed[:-1] + "+00:00"
                try:
                    return datetime.fromisoformat(trimmed)
                except ValueError:
                    return None
            return None

        latest_by_prospecto: dict[str, dict[str, Any]] = {}
        chunk_size = 100
        page_size = 500

        for start in range(0, len(normalized_ids), chunk_size):
            chunk_ids = normalized_ids[start : start + chunk_size]
            offset = 0
            while True:
                params = {
                    "select": "metadata,status,created_at",
                    "metadata->>prospecto_id": _postgrest_in_clause(chunk_ids),
                    "order": "created_at.desc",
                    "limit": str(page_size),
                    "offset": str(offset),
                }
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/prospeccion_buscador_jobs",
                    token=usuario_token,
                    params=params,
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"scraper_status_invalid:{data!r}")
                if not data:
                    break

                for row in data:
                    if not isinstance(row, dict):
                        continue
                    metadata = row.get("metadata")
                    if not isinstance(metadata, dict):
                        continue
                    prospecto_id = str(metadata.get("prospecto_id") or "").strip()
                    if not prospecto_id:
                        continue
                    created_at = row.get("created_at")
                    created_dt = _parse_dt(created_at)
                    previous = latest_by_prospecto.get(prospecto_id)
                    if previous:
                        prev_dt = _parse_dt(previous.get("ultimo_en"))
                        if prev_dt and created_dt and created_dt <= prev_dt:
                            continue
                    latest_by_prospecto[prospecto_id] = {
                        "estado": str(row.get("status") or "pending"),
                        "ultimo_en": created_at,
                    }

                if len(data) < page_size:
                    break
                offset += len(data)

        return latest_by_prospecto

    async def update_prospecto(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Aplica actualizaciones parciales a un prospecto."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"id": f"eq.{prospecto_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospecto_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"prospecto_update_invalid:{row!r}")
        return row

    async def delete_prospecto(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
    ) -> None:
        """Elimina un prospecto y devuelve error si no existe."""

        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"id": f"eq.{prospecto_id}"},
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError("prospecto_delete_failed")
        if not data:
            raise CRMRepositoryError("prospecto_not_found")

    async def delete_prospectos(
        self,
        *,
        usuario_token: str,
        prospecto_ids: list[UUID],
    ) -> list[UUID]:
        """Elimina prospectos en bloque y devuelve los IDs eliminados."""

        if not prospecto_ids:
            return []
        ids = ",".join(str(value) for value in prospecto_ids)
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"id": f"in.({ids})"},
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError("prospectos_delete_failed")
        deleted_ids: list[UUID] = []
        for item in data:
            if isinstance(item, dict):
                item_id = item.get("id")
                if isinstance(item_id, str):
                    try:
                        deleted_ids.append(UUID(item_id))
                    except ValueError:
                        continue
        if not deleted_ids:
            raise CRMRepositoryError("prospectos_not_found")
        return deleted_ids

    async def insert_prospecto_logs(
        self,
        *,
        usuario_token: str,
        entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Registra eventos de contacto ejecutados sobre prospectos."""

        if not entries:
            return []
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            json=entries,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al registrar contactos: {data!r}")
        return data

    async def create_contact_batch(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Inserta un lote de contacto y devuelve el registro."""

        body = [payload]
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_batch_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_invalid:{row!r}")
        return row

    async def list_contact_batches(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        campana_id: UUID | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Obtiene lotes de contacto con filtros básicos."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        if campana_id:
            params["campana_id"] = f"eq.{campana_id}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_batch_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_contact_batches_by_ids(
        self,
        *,
        usuario_token: str,
        batch_ids: set[str],
    ) -> list[dict[str, Any]]:
        """Obtiene lotes por IDs exactos en chunks para evitar scans amplios."""

        if not batch_ids:
            return []
        rows: list[dict[str, Any]] = []
        chunk_size = 100
        sorted_ids = sorted({value for value in batch_ids if value})
        for start in range(0, len(sorted_ids), chunk_size):
            chunk = sorted_ids[start : start + chunk_size]
            params: dict[str, str] = {
                "select": "*",
                "id": _postgrest_in_clause(chunk),
                "limit": str(len(chunk)),
                "offset": "0",
            }
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_contacto_batch",
                token=usuario_token,
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"contact_batch_list_by_ids_invalid:{data!r}")
            rows.extend(item for item in data if isinstance(item, dict))
        return rows

    async def insert_contact_envios(
        self,
        *,
        usuario_token: str,
        entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Inserta envíos asociados a un lote."""

        if not entries:
            return []
        created: list[dict[str, Any]] = []
        chunk_size = 500
        for start in range(0, len(entries), chunk_size):
            chunk = entries[start : start + chunk_size]
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/prospeccion_contacto_envio",
                token=usuario_token,
                json=chunk,
                prefer="return=representation",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"contact_envio_insert_invalid:{data!r}")
            created.extend(data)
        return created

    async def list_contact_templates(
        self,
        *,
        usuario_token: str,
        canal: str | None = None,
    ) -> list[dict[str, Any]]:
        """Obtiene plantillas de contacto opcionalmente filtradas por canal."""

        params: dict[str, str] = {"select": "*"}
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params=params,
            prefer="order=nombre.asc",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_templates_invalid:{data!r}")
        return data

    async def list_contact_template_images(
        self,
        *,
        usuario_token: str,
        template_ids: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Lista asignaciones explícitas de imágenes para plantillas."""

        normalized_ids = [str(value).strip() for value in template_ids if str(value).strip()]
        if not normalized_ids:
            return []
        params = {
            "select": (
                "id,organizacion_id,template_id,logo_id,variable_clave,"
                "logo:logos!prospeccion_contacto_template_imagenes_logo_fkey(id,nombre,file_url)"
            ),
            "template_id": f"in.({','.join(normalized_ids)})",
            "order": "variable_clave.asc",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_template_imagenes",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_template_images_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def replace_contact_template_images(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
        images: Sequence[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Reemplaza las posiciones de imagen de una plantilla."""

        requested_logo_ids = {
            str(row.get("logo_id") or "").strip()
            for row in images
            if str(row.get("logo_id") or "").strip()
        }
        if requested_logo_ids:
            validation_resp = await self._request_with_user(
                "GET",
                "/rest/v1/logos",
                token=usuario_token,
                params={
                    "select": "id",
                    "id": f"in.({','.join(sorted(requested_logo_ids))})",
                },
            )
            validation_data = validation_resp.json() or []
            visible_logo_ids = {
                str(row.get("id") or "").strip()
                for row in validation_data
                if isinstance(row, dict)
            }
            if visible_logo_ids != requested_logo_ids:
                raise CRMRepositoryError("contact_template_image_not_available")
        await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_template_imagenes",
            token=usuario_token,
            params={"template_id": f"eq.{template_id}"},
        )
        if not images:
            return []
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_template_imagenes",
            token=usuario_token,
            json=list(images),
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_template_images_replace_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_contact_template_image_context(
        self,
        *,
        organizacion_id: UUID,
        template_id: UUID,
    ) -> dict[str, str]:
        """Resuelve variables de imagen para el worker de correo."""

        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_template_imagenes",
            params={
                "select": (
                    "variable_clave,"
                    "logo:logos!prospeccion_contacto_template_imagenes_logo_fkey(file_url)"
                ),
                "organizacion_id": f"eq.{organizacion_id}",
                "template_id": f"eq.{template_id}",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_template_image_context_invalid:{data!r}")
        context: dict[str, str] = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            key = str(row.get("variable_clave") or "").strip()
            logo = row.get("logo") if isinstance(row.get("logo"), dict) else {}
            url = str(logo.get("file_url") or "").strip()
            if key and url:
                context[key] = url
        return context

    async def list_whats_prosp_templates(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        active: bool | None = None,
        template_status: str | None = None,
        meta_category: str | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        params: dict[str, str] = {
            "select": "*",
            "organizacion_id": f"eq.{organizacion_id}",
            "canal": "eq.whatsapp",
            "provider": "eq.meta",
            "usage_scope": "eq.whats_prosp",
            "order": "nombre.asc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if active is not None:
            params["activo"] = f"eq.{str(active).lower()}"
        if template_status:
            params["template_status"] = f"eq.{template_status}"
        if meta_category:
            params["meta_category"] = f"eq.{meta_category}"
        if search:
            sanitized = search.strip()
            for char in "(),*":
                sanitized = sanitized.replace(char, " ")
            pattern = f"*{sanitized}*"
            params["or"] = (
                f"(nombre.ilike.{pattern},slug.ilike.{pattern},descripcion.ilike.{pattern},"
                f"template_name.ilike.{pattern},language_code.ilike.{pattern})"
            )
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whats_prosp_templates_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def get_whats_prosp_template(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        template_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={
                "id": f"eq.{template_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "canal": "eq.whatsapp",
                "provider": "eq.meta",
                "usage_scope": "eq.whats_prosp",
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whats_prosp_template_invalid:{row!r}")
        return row

    async def create_whats_prosp_template(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/prospeccion_contacto_templates",
                token=usuario_token,
                json=[payload],
                prefer="return=representation",
            )
        except CRMRepositoryError as exc:
            if _is_whats_prosp_template_duplicate_error(exc):
                raise CRMRepositoryError("whats_prosp_template_duplicate") from exc
            raise
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("whats_prosp_template_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whats_prosp_template_create_invalid:{row!r}")
        return row

    async def update_whats_prosp_template(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        template_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            resp = await self._request_with_user(
                "PATCH",
                "/rest/v1/prospeccion_contacto_templates",
                token=usuario_token,
                params={
                    "id": f"eq.{template_id}",
                    "organizacion_id": f"eq.{organizacion_id}",
                    "canal": "eq.whatsapp",
                    "provider": "eq.meta",
                    "usage_scope": "eq.whats_prosp",
                },
                json=payload,
                prefer="return=representation",
            )
        except CRMRepositoryError as exc:
            if _is_whats_prosp_template_duplicate_error(exc):
                raise CRMRepositoryError("whats_prosp_template_duplicate") from exc
            raise
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("whats_prosp_template_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whats_prosp_template_update_invalid:{row!r}")
        return row

    async def delete_whats_prosp_template(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        template_id: UUID,
    ) -> None:
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={
                "id": f"eq.{template_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "canal": "eq.whatsapp",
                "provider": "eq.meta",
                "usage_scope": "eq.whats_prosp",
            },
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("whats_prosp_template_not_found")

    async def get_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_invalid:{row!r}")
        return row

    async def create_contact_template(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_template_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_create_invalid:{row!r}")
        return row

    async def update_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_template_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_update_invalid:{row!r}")
        return row

    async def delete_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
    ) -> None:
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}"},
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("contact_template_not_found")

    async def list_contact_lists(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Obtiene listas inteligentes de prospección."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": "creado_en.desc",
        }
        if search:
            sanitized = search.strip()
            for char in "(),*":
                sanitized = sanitized.replace(char, " ")
            pattern = f"*{sanitized}*"
            params["or"] = f"(nombre.ilike.{pattern},descripcion.ilike.{pattern})"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_lists_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def get_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_invalid:{row!r}")
        return row

    async def create_contact_list(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_list_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_create_invalid:{row!r}")
        return row

    async def update_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_list_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_update_invalid:{row!r}")
        return row

    async def delete_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
    ) -> None:
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}"},
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("contact_list_not_found")
        if isinstance(data, list) and not data:
            return

    async def list_contact_envios(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        batch_id: UUID | None = None,
        prospecto_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista envíos filtrando por lote o prospecto."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if batch_id:
            params["batch_id"] = f"eq.{batch_id}"
        if prospecto_id:
            params["prospecto_id"] = f"eq.{prospecto_id}"
        if canal:
            params["canal"] = f"eq.{canal}"
        if estado:
            params["estado"] = f"eq.{estado}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_contact_envios_for_batches(
        self,
        *,
        usuario_token: str,
        batch_ids: Sequence[UUID],
        canal: str | None = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Lista envíos para un conjunto de lotes en una sola consulta."""

        if not batch_ids:
            return []
        params: dict[str, str] = {
            "select": "id,batch_id,canal,estado,creado_en,programado_en,procesado_en",
            "batch_id": _postgrest_in_clause([str(value) for value in batch_ids]),
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 20000))),
            "offset": str(max(0, int(offset))),
        }
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_batches_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_prospeccion_envio_sesiones_utm(
        self,
        *,
        organizacion_id: UUID,
        envio_ids: list[UUID],
    ) -> dict[str, int]:
        """Devuelve sesiones UTM por envío para correos de prospección."""

        if not envio_ids:
            return {}
        payload = {"p_envio_ids": [str(value) for value in envio_ids]}
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/rpc/prospeccion_envio_sesiones_utm",
            json=payload,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_envio_sesiones_utm_invalid:{data!r}")
        result: dict[str, int] = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            envio_id = row.get("envio_id")
            if not envio_id:
                continue
            try:
                result[str(envio_id)] = int(row.get("sesiones_utm") or 0)
            except (TypeError, ValueError):
                result[str(envio_id)] = 0
        return result

    async def list_contact_logs(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        batch_id: UUID | None = None,
        envio_id: UUID | None = None,
        prospecto_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista eventos registrados en la bitácora de contactos."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if batch_id:
            params["batch_id"] = f"eq.{batch_id}"
        if envio_id:
            params["envio_id"] = f"eq.{envio_id}"
        if prospecto_id:
            params["prospecto_id"] = f"eq.{prospecto_id}"
        if canal:
            params["canal"] = f"eq.{canal}"
        if estado:
            params["estado"] = f"eq.{estado}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_log_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_contact_logs_for_batches(
        self,
        *,
        usuario_token: str,
        batch_ids: Sequence[UUID],
        canal: str | None = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Lista logs de contacto para un conjunto de lotes en una sola consulta."""

        if not batch_ids:
            return []
        params: dict[str, str] = {
            "select": "id,batch_id,envio_id,canal,accion,creado_en",
            "batch_id": _postgrest_in_clause([str(value) for value in batch_ids]),
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 20000))),
            "offset": str(max(0, int(offset))),
        }
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_logs_batches_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_contact_logs_for_prospectos(
        self,
        *,
        usuario_token: str,
        prospecto_ids: Sequence[UUID],
        canal: str | None = None,
        limit: int = 20000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Lista logs de contacto para un conjunto de prospectos en una sola consulta."""

        if not prospecto_ids:
            return []
        params: dict[str, str] = {
            "select": "id,prospecto_id,canal,estado,detalle,creado_en",
            "prospecto_id": _postgrest_in_clause([str(value) for value in prospecto_ids]),
            "order": "creado_en.desc",
            "limit": str(max(1, min(limit, 20000))),
            "offset": str(max(0, int(offset))),
        }
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_logs_prospectos_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_contact_suppressions(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        canal: str | None = None,
        activo: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista suppressions/opt-out de prospección."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(max(1, min(limit, 500))),
            "offset": str(max(0, offset)),
            "order": "actualizado_en.desc,creado_en.desc",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        if activo is not None:
            params["activo"] = f"eq.{str(activo).lower()}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_suppressions",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_suppressions_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_whatsapp_atribucion_reglas(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        canal_publicitario: str | None = None,
        activo: bool | None = None,
        search: str | None = None,
        include_historial: bool = False,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista reglas de atribución publicitaria para WhatsApp."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(max(1, min(limit, 500))),
            "offset": str(max(0, offset)),
            "order": "prioridad.asc,creado_en.asc",
        }
        if canal_publicitario:
            literal = _postgrest_eq_literal(canal_publicitario.strip())
            params["canal_publicitario"] = f"eq.{literal}"
        if activo is not None:
            params["activo"] = f"eq.{str(activo).lower()}"
        if not include_historial:
            params["vigente_hasta"] = "is.null"
        search_pattern = _sanitize_search_pattern(search)
        if search_pattern:
            ilike = _postgrest_ilike_literal(search_pattern)
            params["or"] = (
                f"(nombre_regla.ilike.{ilike},frase_objetivo.ilike.{ilike},"
                f"canal_publicitario.ilike.{ilike},campana_publicitaria.ilike.{ilike})"
            )
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_reglas_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def get_whatsapp_atribucion_regla_by_id(
        self,
        *,
        usuario_token: str,
        regla_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene una regla de atribución por ID."""

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            token=usuario_token,
            params={
                "select": "*",
                "id": f"eq.{regla_id}",
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_regla_get_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_atribucion_regla_get_row_invalid:{row!r}")
        return row

    async def create_whatsapp_atribucion_regla(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Crea una regla de atribución publicitaria para WhatsApp."""

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("whatsapp_atribucion_regla_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_atribucion_regla_create_invalid:{row!r}")
        return row

    async def update_whatsapp_atribucion_regla(
        self,
        *,
        usuario_token: str,
        regla_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza una regla de atribución publicitaria para WhatsApp."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            token=usuario_token,
            params={"id": f"eq.{regla_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("whatsapp_atribucion_regla_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_atribucion_regla_update_invalid:{row!r}")
        return row

    async def delete_whatsapp_atribucion_regla(
        self,
        *,
        usuario_token: str,
        regla_id: UUID,
    ) -> None:
        """Elimina una regla de atribución publicitaria para WhatsApp."""

        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            token=usuario_token,
            params={"id": f"eq.{regla_id}"},
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("whatsapp_atribucion_regla_not_found")

    async def list_active_whatsapp_atribucion_reglas(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        """Carga reglas activas de atribución para el tenant (service-role)."""

        resp = await self._request_service_role(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            params={
                "select": "*",
                "organizacion_id": f"eq.{organizacion_id}",
                "activo": "eq.true",
                "vigente_hasta": "is.null",
                "order": "prioridad.asc,creado_en.asc",
                "limit": "500",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_reglas_active_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def worker_get_recent_whatsapp_atribucion_event_for_persona(
        self,
        *,
        organizacion_id: UUID,
        persona_id: UUID,
        since_iso: str,
        legacy_contact_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Devuelve el evento de atribución más reciente por persona en una ventana."""

        params: dict[str, str] = {
            "select": "id,conversacion_id,persona_id,contacto_id,regla_id,canal_publicitario,creado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "creado_en": f"gte.{since_iso}",
            "order": "creado_en.desc",
            "limit": "1",
        }
        if legacy_contact_id and legacy_contact_id != persona_id:
            params["or"] = f"(persona_id.eq.{persona_id},contacto_id.eq.{legacy_contact_id})"
        else:
            params["persona_id"] = f"eq.{persona_id}"

        resp = await self._request_service_role(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_eventos",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_atribucion_event_recent_invalid:{row!r}")
        if not row.get("persona_id") and row.get("contacto_id"):
            row["persona_id"] = row.get("contacto_id")
        return row

    async def worker_get_recent_whatsapp_atribucion_event_for_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        since_iso: str,
    ) -> dict[str, Any] | None:
        """Alias de compatibilidad para el contrato legacy."""
        return await self.worker_get_recent_whatsapp_atribucion_event_for_persona(
            organizacion_id=organizacion_id,
            persona_id=contacto_id,
            since_iso=since_iso,
        )

    async def worker_create_whatsapp_atribucion_event(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Crea un evento de atribución; ignora duplicado por conversación."""

        persona_id = str(payload.get("persona_id") or "").strip()
        contacto_id = str(payload.get("contacto_id") or "").strip()
        resolved_persona_id = persona_id or contacto_id
        if not resolved_persona_id:
            raise CRMRepositoryError("whatsapp_atribucion_persona_id_required")
        normalized_payload = dict(payload)
        normalized_payload["persona_id"] = resolved_persona_id
        # `personas.id` is the canonical identity after the contacts refactor.
        # The legacy FK is nullable and cannot be filled with persona_id: the
        # shadow row in `contactos` may not exist yet, or may not exist at all.
        # A canonical persona is sufficient. Do not send a historical
        # contacto_id alongside it because metadata may point to a deleted
        # legacy row and the nullable FK must never block attribution.
        if persona_id:
            normalized_payload.pop("contacto_id", None)
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/prospeccion_whatsapp_atribucion_eventos",
            params={"on_conflict": "organizacion_id,conversacion_id"},
            json=[normalized_payload],
            prefer="resolution=ignore-duplicates,return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_event_create_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_atribucion_event_create_invalid_row:{row!r}")
        return row

    async def worker_list_whatsapp_atribucion_events_by_conversations(
        self,
        *,
        organizacion_id: UUID,
        conversation_ids: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Consulta eventos de atribución para un conjunto de conversaciones."""

        if not conversation_ids:
            return []
        safe_ids = [value.strip() for value in conversation_ids if isinstance(value, str) and value.strip()]
        if not safe_ids:
            return []
        params = {
            "select": "conversacion_id,persona_id,contacto_id,regla_id,canal_publicitario,campana_publicitaria,adset,anuncio,creado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "conversacion_id": _postgrest_in_clause(safe_ids),
            "order": "creado_en.desc",
            "limit": str(min(len(safe_ids) * 3, 1000)),
        }
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_eventos",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_events_by_conversation_invalid:{data!r}")
        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            if not row.get("persona_id") and row.get("contacto_id"):
                row["persona_id"] = row.get("contacto_id")
            rows.append(row)
        return rows

    async def worker_list_whatsapp_atribucion_reglas_by_ids(
        self,
        *,
        organizacion_id: UUID,
        regla_ids: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Consulta reglas de atribución por IDs."""

        if not regla_ids:
            return []
        safe_ids = [value.strip() for value in regla_ids if isinstance(value, str) and value.strip()]
        if not safe_ids:
            return []
        params = {
            "select": "id,nombre_regla,frase_objetivo,canal_publicitario,campana_publicitaria",
            "organizacion_id": f"eq.{organizacion_id}",
            "id": _postgrest_in_clause(safe_ids),
            "limit": str(min(len(safe_ids), 500)),
        }
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_reglas",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_reglas_by_ids_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def worker_get_message_by_id(
        self,
        *,
        organizacion_id: UUID,
        message_id: str,
    ) -> dict[str, Any] | None:
        message_key = str(message_id or "").strip()
        if not message_key:
            return None
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/mensajes",
            params={
                "select": "id,datos,conversacion_id",
                "id": f"eq.{message_key}",
                "limit": "1",
            },
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"message_by_id_invalid:{row!r}")
        return row

    async def worker_get_attachment_by_id(
        self,
        *,
        attachment_id: str,
    ) -> dict[str, Any] | None:
        attachment_key = str(attachment_id or "").strip()
        if not attachment_key:
            return None
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/adjuntos",
            params={
                "select": "id,mensaje_id,organizacion_id,url,mime,tamano_bytes,size_bytes,proveedor_id,nombre,path",
                "id": f"eq.{attachment_key}",
                "limit": "1",
            },
            organizacion_id=None,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"attachment_by_id_invalid:{row!r}")
        return row

    async def worker_update_message_datos(
        self,
        *,
        organizacion_id: UUID,
        message_id: str,
        datos: dict[str, Any],
    ) -> dict[str, Any] | None:
        message_key = str(message_id or "").strip()
        if not message_key:
            return None
        resp = await self._request_service_role(
            "PATCH",
            "/rest/v1/mensajes",
            params={"id": f"eq.{message_key}"},
            json={"datos": datos},
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"message_update_invalid:{row!r}")
        return row

    async def list_whatsapp_atribucion_eventos_for_metrics(
        self,
        *,
        usuario_token: str,
        limit: int = 5000,
        offset: int = 0,
        date_from_iso: str | None = None,
        date_to_iso: str | None = None,
        canal_publicitario: str | None = None,
        campana_publicitaria: str | None = None,
        regla_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Lista eventos de atribución WhatsApp para tablero de métricas."""

        params: dict[str, str] = {
            "select": (
                "id,regla_id,conversacion_id,persona_id,contacto_id,canal_publicitario,"
                "campana_publicitaria,adset,anuncio,creado_en"
            ),
            "order": "creado_en.desc",
            "limit": str(max(1, min(limit, 10000))),
            "offset": str(max(0, int(offset))),
        }
        and_filters: list[str] = []
        if date_from_iso:
            and_filters.append(f"creado_en.gte.{date_from_iso}")
        if date_to_iso:
            and_filters.append(f"creado_en.lte.{date_to_iso}")
        if and_filters:
            params["and"] = "(" + ",".join(and_filters) + ")"
        if canal_publicitario:
            literal = _postgrest_eq_literal(canal_publicitario.strip())
            params["canal_publicitario"] = f"eq.{literal}"
        if campana_publicitaria:
            literal = _postgrest_eq_literal(campana_publicitaria.strip())
            params["campana_publicitaria"] = f"eq.{literal}"
        if regla_id:
            params["regla_id"] = f"eq.{regla_id}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_whatsapp_atribucion_eventos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"whatsapp_atribucion_eventos_metrics_invalid:{data!r}")
        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            if not row.get("persona_id") and row.get("contacto_id"):
                row["persona_id"] = row.get("contacto_id")
            rows.append(row)
        return rows

    async def list_opportunities_by_conversation_ids(
        self,
        *,
        organizacion_id: UUID,
        conversation_ids: Sequence[str],
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Obtiene oportunidades ligadas por metadata a conversation_id/conversacion_id."""

        if not conversation_ids:
            return []
        safe_ids = [value.strip() for value in conversation_ids if isinstance(value, str) and value.strip()]
        if not safe_ids:
            return []
        effective_limit = (
            max(1, min(int(limit), 5000))
            if isinstance(limit, int)
            else min(max(len(safe_ids) * 5, 200), 5000)
        )
        in_clause = _postgrest_in_clause(safe_ids)
        params = {
            "select": "id,monto_estimado,metadata,creado_en,asignado_a_usuario_id",
            "organizacion_id": f"eq.{organizacion_id}",
            "or": f"(metadata->>conversation_id.{in_clause},metadata->>conversacion_id.{in_clause})",
            "order": "creado_en.desc",
            "limit": str(effective_limit),
            "offset": str(max(0, int(offset))),
        }
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"opportunities_by_conversation_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def create_contact_suppression(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Crea una suppression/opt-out."""

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_suppressions",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_suppression_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_suppression_create_invalid:{row!r}")
        return row

    async def update_contact_suppression(
        self,
        *,
        usuario_token: str,
        suppression_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza una suppression/opt-out."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_suppressions",
            token=usuario_token,
            params={"id": f"eq.{suppression_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_suppression_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_suppression_update_invalid:{row!r}")
        return row

    async def list_active_contact_suppressions_for_prospectos(
        self,
        *,
        usuario_token: str,
        prospecto_ids: Sequence[UUID],
        canales: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Obtiene suppressions activas por prospecto/canal."""

        if not prospecto_ids or not canales:
            return []
        ids_param = ",".join(str(value) for value in prospecto_ids)
        canal_values = sorted(
            {
                value.strip().lower()
                for value in canales
                if isinstance(value, str) and value.strip()
            }
        )
        if not canal_values:
            return []
        canal_values.append("all")
        params = {
            "select": "id,prospecto_id,canal,motivo,origen,metadata",
            "activo": "eq.true",
            "prospecto_id": f"in.({ids_param})",
            "canal": _postgrest_in_clause(canal_values),
            "limit": "5000",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_suppressions",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_suppression_by_prospect_invalid:{data!r}")
        return data

    async def list_prospecto_contact_indicators(
        self,
        *,
        usuario_token: str,
        prospecto_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene indicadores agregados por prospecto/canal."""

        if not prospecto_ids:
            return []
        # Fuente de verdad para UI: vista materializada por query en tiempo real.
        # Evitamos el RPC cacheado aquí porque puede quedar desfasado por canal.
        ids_param = ",".join(str(value) for value in prospecto_ids)
        params = {
            "select": "prospecto_id,canales,total_envios,ultimo_contacto_en,total_respuestas,respondio,ultima_respuesta_en",
            "prospecto_id": f"in.({ids_param})",
            "order": "prospecto_id.asc",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospecto_contacto_stats",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_indicator_list_invalid:{data!r}")
        return data

    async def list_prospecto_audit(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params = {
            "prospecto_id": f"eq.{prospecto_id}",
            "order": "realizado_en.desc",
            "limit": str(max(1, min(limit, 200))),
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos_audit",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospecto_audit_invalid:{data!r}")
        return data

    async def list_latest_prospectos_audit_by_ids(
        self,
        *,
        organizacion_id: UUID,
        prospecto_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene la auditoria mas reciente de prospectos eliminados o historicos."""

        if not prospecto_ids:
            return []
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "prospecto_id": _postgrest_in_clause([str(value) for value in prospecto_ids]),
            "select": "prospecto_id,accion,cambios,realizado_en",
            "order": "realizado_en.desc",
            "limit": str(max(1, min(len(prospecto_ids) * 5, 1000))),
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_prospectos_audit",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospectos_audit_by_ids_invalid:{data!r}")
        latest_by_id: dict[str, dict[str, Any]] = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            prospecto_id = str(row.get("prospecto_id") or "").strip()
            if prospecto_id and prospecto_id not in latest_by_id:
                latest_by_id[prospecto_id] = row
        return list(latest_by_id.values())

    async def update_contact_envio(
        self,
        *,
        usuario_token: str,
        envio_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza un envío individual."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params={"id": f"eq.{envio_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(envio_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_envio_update_invalid:{row!r}")
        return row

    async def get_contact_envio(
        self,
        *,
        usuario_token: str,
        envio_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene un envío individual."""

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params={"id": f"eq.{envio_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_envio_get_invalid:{row!r}")
        return row

    async def update_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza metadatos del lote."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params={"id": f"eq.{batch_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(batch_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_update_invalid:{row!r}")
        return row

    async def get_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene un lote específico."""

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params={"id": f"eq.{batch_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_get_invalid:{row!r}")
        return row

    async def summarize_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
    ) -> list[dict[str, Any]]:
        """Regresa el total de envíos agrupados por estado."""

        params = {
            "batch_id": f"eq.{batch_id}",
            "select": "estado",
            "limit": "2000",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_batch_summary_invalid:{data!r}")
        counts: dict[str, int] = {}
        for row in data:
            estado = str(row.get("estado") or "pendiente").strip() or "pendiente"
            counts[estado] = counts.get(estado, 0) + 1
        return [{"estado": estado, "count": total} for estado, total in counts.items()]

    async def summarize_envios_por_batches(
        self,
        *,
        usuario_token: str,
        batch_ids: Sequence[UUID],
    ) -> dict[str, dict[str, int]]:
        """Agrupa estados por lote en una sola consulta."""

        if not batch_ids:
            return {}
        payload = {"batch_ids": [str(value) for value in batch_ids]}
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_contacto_envio_resumen",
            token=usuario_token,
            json=payload,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_group_invalid:{data!r}")
        resultado: dict[str, dict[str, int]] = {}
        for row in data:
            batch_id = str(row.get("batch_id"))
            estado = str(row.get("estado") or "pendiente").strip() or "pendiente"
            try:
                count_value = int(row.get("total"))
            except (TypeError, ValueError):
                count_value = 0
            bucket = resultado.setdefault(batch_id, {})
            bucket[estado] = bucket.get(estado, 0) + count_value
        return resultado

    async def get_prospeccion_conversion_fuente(
        self,
        *,
        usuario_token: str,
    ) -> list[dict[str, Any]]:
        """Obtiene métricas de conversión por fuente de prospectos."""

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_conversion_fuente",
            token=usuario_token,
            json={},
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_conversion_fuente_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_prospeccion_brevo_eventos_resumen(
        self,
        *,
        usuario_token: str,
    ) -> list[dict[str, Any]]:
        """Obtiene resumen de eventos Brevo registrados en logs de prospección."""

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_brevo_eventos_resumen",
            token=usuario_token,
            json={},
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_brevo_eventos_resumen_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_prospeccion_campana_template_atribucion(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        campana_id: UUID | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Resumen persistente de atribución por campaña/plantilla."""

        payload: dict[str, Any] = {"p_limit": max(1, min(limit, 1000))}
        if campana_id is not None:
            payload["p_campana_id"] = str(campana_id)
        # Use service-role for this RPC so attribution is resolved strictly by tenant header
        # and does not depend on auth.uid() mapping of the current access token.
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/rpc/prospeccion_campana_template_atribucion",
            json=payload,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_campana_template_atribucion_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_prospeccion_campana_template_atribucion_rango(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        campana_id: UUID | None = None,
        date_from_iso: str | None = None,
        date_to_iso: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Resumen de atribución por campaña/plantilla con filtro por rango y SID."""

        payload: dict[str, Any] = {"p_limit": max(1, min(limit, 1000))}
        payload["p_offset"] = max(0, int(offset))
        if campana_id is not None:
            payload["p_campana_id"] = str(campana_id)
        if date_from_iso:
            payload["p_date_from"] = date_from_iso
        if date_to_iso:
            payload["p_date_to"] = date_to_iso
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/rpc/prospeccion_campana_template_atribucion_rango",
            json=payload,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_campana_template_atribucion_rango_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_prospeccion_campana_whatsapp_metricas_rango(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID | None = None,
        campana_id: UUID | None = None,
        date_from_iso: str | None = None,
        date_to_iso: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Resumen de métricas de campañas WhatsApp con enfoque operacional."""

        payload: dict[str, Any] = {
            "p_limit": max(1, min(limit, 1000)),
            "p_offset": max(0, int(offset)),
        }
        if campana_id is not None:
            payload["p_campana_id"] = str(campana_id)
        if date_from_iso:
            payload["p_date_from"] = date_from_iso
        if date_to_iso:
            payload["p_date_to"] = date_to_iso
        resp = await self._request_service_role(
            "POST",
            "/rest/v1/rpc/prospeccion_campana_whatsapp_metricas_rango",
            json=payload,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospeccion_campana_whatsapp_metricas_rango_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def cancel_pending_envios(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
        motivo: str,
    ) -> list[dict[str, Any]]:
        """Marca como cancelados los envíos pendientes/procesando de un lote."""

        now_iso = datetime.now(timezone.utc).isoformat()
        params = {
            "batch_id": f"eq.{batch_id}",
            "estado": "in.(pendiente,procesando)",
        }
        payload = {
            "estado": "cancelado",
            "error": motivo,
            "procesado_en": now_iso,
        }
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_cancel_invalid:{data!r}")
        return data

    async def worker_list_pending_envios(
        self,
        *,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Obtiene envíos pendientes listos para procesarse (service role)."""

        effective_limit = max(limit, 1)
        now_iso = datetime.now(timezone.utc).isoformat()
        params = {
            "select": "*",
            "estado": "eq.pendiente",
            "programado_en": f"lte.{now_iso}",
            "order": "programado_en.asc",
            "limit": str(effective_limit),
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_pending_envios_invalid:{data!r}")
        return data

    async def worker_count_ready_or_processing_envios(self) -> int:
        """Cuenta backlog operativo para envíos (pendiente listo + procesando)."""

        now_iso = datetime.now(timezone.utc).isoformat()

        pending_params = {
            "select": "id",
            "estado": "eq.pendiente",
            "programado_en": f"lte.{now_iso}",
            "limit": "1",
        }
        pending_resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=pending_params,
            prefer="count=exact",
        )
        pending_count = self._extract_total_count(pending_resp.headers.get("content-range")) or 0

        processing_params = {
            "select": "id",
            "estado": "eq.procesando",
            "limit": "1",
        }
        processing_resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=processing_params,
            prefer="count=exact",
        )
        processing_count = self._extract_total_count(processing_resp.headers.get("content-range")) or 0

        return int(pending_count) + int(processing_count)

    async def worker_mark_envio_processing(
        self,
        *,
        envio_id: UUID,
        attempt: int,
    ) -> bool:
        """Intenta marcar un envío como procesando; devuelve False si ya no está pendiente."""

        params = {
            "id": f"eq.{envio_id}",
            "estado": "eq.pendiente",
        }
        payload = {
            "estado": "procesando",
            "intento_actual": attempt,
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        return isinstance(data, list) and bool(data)

    async def worker_complete_envio(
        self,
        *,
        envio_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza un envío después de procesarlo (service role)."""

        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            params={"id": f"eq.{envio_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(envio_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_complete_envio_invalid:{row!r}")
        return row

    async def worker_get_envio_by_mensaje(
        self,
        *,
        mensaje_id: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene un envío buscando por su mensaje/call SID."""

        trimmed = mensaje_id.strip() if mensaje_id else ""
        if not trimmed:
            return None
        normalized = trimmed.strip("<> ").strip()
        candidates = [trimmed]
        if normalized and normalized != trimmed:
            candidates.insert(0, normalized)
        params = {
            "limit": "1",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        for candidate in candidates:
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_contacto_envio",
                params={**params, "mensaje_id": f"eq.{candidate}"},
            )
            data = resp.json() or []
            if not isinstance(data, list) or not data:
                continue
            row = data[0]
            if not isinstance(row, dict):
                raise CRMRepositoryError(f"worker_get_envio_invalid:{row!r}")
            return row
        for candidate in candidates:
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_contacto_envio",
                params={**params, "mensaje_id_interno": f"eq.{candidate}"},
            )
            data = resp.json() or []
            if not isinstance(data, list) or not data:
                continue
            row = data[0]
            if not isinstance(row, dict):
                raise CRMRepositoryError(f"worker_get_envio_invalid:{row!r}")
            return row
        return None

    async def worker_get_envio_by_id(
        self,
        *,
        envio_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene un envío por id usando service role."""

        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params={
                "id": f"eq.{envio_id}",
                "select": "id,organizacion_id,detalle",
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_envio_by_id_invalid:{row!r}")
        return row

    async def worker_has_brevo_log_event(
        self,
        *,
        envio_id: UUID,
        estado: str,
        message_id: str,
        event_name: str,
        event_date: str | None = None,
    ) -> bool:
        """Verifica si ya existe un log equivalente de webhook Brevo para deduplicar."""

        trimmed_message_id = message_id.strip()
        trimmed_event_name = event_name.strip().lower()
        if not trimmed_message_id or not trimmed_event_name:
            return False
        params: dict[str, str] = {
            "select": "id",
            "envio_id": f"eq.{envio_id}",
            "canal": "eq.correo",
            "estado": f"eq.{_postgrest_eq_literal(estado.strip().lower())}",
            "detalle->>message_id": f"eq.{_postgrest_eq_literal(trimmed_message_id)}",
            "detalle->>event": f"eq.{_postgrest_eq_literal(trimmed_event_name)}",
            "limit": "1",
        }
        trimmed_date = event_date.strip() if isinstance(event_date, str) else ""
        if trimmed_date:
            params["detalle->>date"] = f"eq.{_postgrest_eq_literal(trimmed_date)}"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contactos_log",
            params=params,
        )
        data = resp.json() or []
        return isinstance(data, list) and bool(data)

    async def worker_find_prospecto_by_contacto(
        self,
        *,
        contacto_id: UUID,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Resuelve un prospecto asociado al contacto CRM guardado en metadata."""

        params = {
            "metadata->>crm_contacto_id": f"eq.{contacto_id}",
            "order": "actualizado_en.desc.nullslast,creado_en.desc",
            "limit": "1",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_find_prospecto_by_contacto_invalid:{row!r}")
        return row

    async def worker_find_latest_prospecto_by_phone(
        self,
        *,
        phone: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Resuelve un prospecto por teléfono normalizado."""

        trimmed = phone.strip() if isinstance(phone, str) else ""
        if not trimmed:
            return None
        order_clause = "actualizado_en.desc.nullslast,creado_en.desc"
        lookups: tuple[dict[str, str], ...] = (
            {
                "phone": f"eq.{trimmed}",
                "order": order_clause,
                "limit": "1",
            },
            {
                "phone_e164": f"eq.{trimmed}",
                "order": order_clause,
                "limit": "1",
            },
        )
        for params in lookups:
            if organizacion_id is not None:
                params["organizacion_id"] = f"eq.{organizacion_id}"
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list) or not data:
                continue
            row = data[0]
            if not isinstance(row, dict):
                raise CRMRepositoryError(f"worker_find_latest_prospecto_by_phone_invalid:{row!r}")
            return row
        return None

    async def worker_get_latest_prospectos_by_phones(
        self,
        *,
        phone_values: set[str],
        organizacion_id: UUID | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Obtiene el prospecto más reciente para un conjunto de telefonos."""

        normalized_phones = sorted(
            {
                str(value or "").strip()
                for value in phone_values
                if str(value or "").strip()
            }
        )
        if not normalized_phones:
            return {}

        resolved: dict[str, dict[str, Any]] = {}
        chunk_size = 100
        order_clause = "actualizado_en.desc.nullslast,creado_en.desc"
        select_clause = "id,organizacion_id,phone,phone_e164,actualizado_en,creado_en"

        for start in range(0, len(normalized_phones), chunk_size):
            chunk = normalized_phones[start : start + chunk_size]
            for field_name in ("phone", "phone_e164"):
                params: dict[str, str] = {
                    "select": select_clause,
                    field_name: _postgrest_in_clause(chunk),
                    "order": order_clause,
                    "limit": str(max(200, min(1000, len(chunk) * 6))),
                }
                if organizacion_id is not None:
                    params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    params=params,
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(
                        f"worker_get_latest_prospectos_by_phones_invalid:{data!r}"
                    )
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    for candidate_field in ("phone", "phone_e164"):
                        candidate = str(row.get(candidate_field) or "").strip()
                        if not candidate or candidate not in chunk or candidate in resolved:
                            continue
                        resolved[candidate] = row
        return resolved

    async def worker_get_latest_envio_for_prospecto(
        self,
        *,
        prospecto_id: UUID,
        canal: str | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene el envío más reciente del prospecto, opcionalmente filtrado por canal."""

        params: dict[str, str] = {
            "prospecto_id": f"eq.{prospecto_id}",
            "order": "procesado_en.desc.nullslast,creado_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_latest_envio_for_prospecto_invalid:{row!r}")
        return row

    async def worker_get_latest_envio_by_phone(
        self,
        *,
        phone_e164: str,
        canal: str | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene el envío más reciente buscando por teléfono persistido en detalle->phone."""

        trimmed = phone_e164.strip() if isinstance(phone_e164, str) else ""
        if not trimmed:
            return None
        params: dict[str, str] = {
            "detalle->>phone": f"eq.{trimmed}",
            "order": "procesado_en.desc.nullslast,creado_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_latest_envio_by_phone_invalid:{row!r}")
        return row

    async def worker_get_latest_envios_by_phones(
        self,
        *,
        phone_values: set[str],
        canal: str | None = None,
        organizacion_id: UUID | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Obtiene el envío más reciente por teléfono para un conjunto de números."""

        normalized_phones = sorted(
            {
                str(value or "").strip()
                for value in phone_values
                if str(value or "").strip()
            }
        )
        if not normalized_phones:
            return {}

        cache_key = json.dumps(
            {
                "phones": normalized_phones,
                "canal": (canal or "").strip().lower() or None,
                "organizacion_id": str(organizacion_id) if organizacion_id is not None else None,
            },
            sort_keys=True,
        )
        now = time.monotonic()
        async with _LATEST_ENVIOS_BY_PHONES_CACHE_LOCK:
            cached_entry = _LATEST_ENVIOS_BY_PHONES_CACHE.get(cache_key)
            if cached_entry is not None:
                expires_at, cached_value = cached_entry
                if expires_at > now:
                    return json.loads(json.dumps(cached_value, default=str))
                _LATEST_ENVIOS_BY_PHONES_CACHE.pop(cache_key, None)

        # Ruta principal: resolver en SQL (1 RPC por chunk) y evitar escaneo paginado
        # de PostgREST para cada bloque de telefonos.
        resolved: dict[str, dict[str, Any]] = {}
        rpc_chunk_size = 400
        rpc_canal = canal.strip().lower() if isinstance(canal, str) and canal.strip() else None

        try:
            for start in range(0, len(normalized_phones), rpc_chunk_size):
                chunk = normalized_phones[start : start + rpc_chunk_size]
                data = await self._rpc(
                    "prospeccion_latest_envios_by_phones",
                    {
                        "p_phone_values": chunk,
                        "p_canal": rpc_canal,
                        # Fuerza la firma RPC de 3 argumentos y evita ambiguedad
                        # cuando existen overloads de Postgres/PostgREST.
                        "p_organizacion_id": (
                            str(organizacion_id) if organizacion_id is not None else None
                        ),
                    },
                )
                if not isinstance(data, list):
                    raise CRMRepositoryError(
                        f"worker_get_latest_envios_by_phones_rpc_invalid:{data!r}"
                    )
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    phone = str(row.get("phone") or "").strip()
                    if not phone:
                        detalle = row.get("detalle") if isinstance(row.get("detalle"), dict) else {}
                        phone = str(detalle.get("phone") or "").strip()
                    if not phone:
                        continue
                    resolved[phone] = row
            safe_value = json.loads(json.dumps(resolved, default=str))
            async with _LATEST_ENVIOS_BY_PHONES_CACHE_LOCK:
                _LATEST_ENVIOS_BY_PHONES_CACHE[cache_key] = (
                    now + LATEST_ENVIOS_BY_PHONES_CACHE_TTL_SECONDS,
                    safe_value,
                )
                while len(_LATEST_ENVIOS_BY_PHONES_CACHE) > LATEST_ENVIOS_BY_PHONES_CACHE_MAX_ENTRIES:
                    oldest_key = next(iter(_LATEST_ENVIOS_BY_PHONES_CACHE), None)
                    if not oldest_key:
                        break
                    _LATEST_ENVIOS_BY_PHONES_CACHE.pop(oldest_key, None)
            return resolved
        except CRMRepositoryError:
            # Fallback defensivo legacy para mantener compatibilidad si la RPC no existe
            # o falla temporalmente.
            pass

        legacy_resolved = await self._worker_get_latest_envios_by_phones_legacy(
            normalized_phones=normalized_phones,
            canal=canal,
            organizacion_id=organizacion_id,
        )
        safe_value = json.loads(json.dumps(legacy_resolved, default=str))
        async with _LATEST_ENVIOS_BY_PHONES_CACHE_LOCK:
            _LATEST_ENVIOS_BY_PHONES_CACHE[cache_key] = (
                now + LATEST_ENVIOS_BY_PHONES_CACHE_TTL_SECONDS,
                safe_value,
            )
            while len(_LATEST_ENVIOS_BY_PHONES_CACHE) > LATEST_ENVIOS_BY_PHONES_CACHE_MAX_ENTRIES:
                oldest_key = next(iter(_LATEST_ENVIOS_BY_PHONES_CACHE), None)
                if not oldest_key:
                    break
                _LATEST_ENVIOS_BY_PHONES_CACHE.pop(oldest_key, None)
        return legacy_resolved

    async def _worker_get_latest_envios_by_phones_legacy(
        self,
        *,
        normalized_phones: list[str],
        canal: str | None = None,
        organizacion_id: UUID | None = None,
    ) -> dict[str, dict[str, Any]]:
        resolved: dict[str, dict[str, Any]] = {}
        chunk_size = 100
        max_scan_rows = 5000

        for start in range(0, len(normalized_phones), chunk_size):
            chunk = normalized_phones[start : start + chunk_size]
            unresolved_chunk = set(chunk)
            offset = 0
            page_size = max(200, min(1000, max(len(chunk) * 6, 300)))

            while unresolved_chunk and offset < max_scan_rows:
                params: dict[str, str] = {
                    "select": "id,batch_id,payload,detalle,procesado_en,creado_en,canal",
                    "detalle->>phone": _postgrest_in_clause(chunk),
                    "order": "procesado_en.desc.nullslast,creado_en.desc",
                    "limit": str(page_size),
                    "offset": str(offset),
                }
                if canal:
                    params["canal"] = f"eq.{canal.strip().lower()}"
                if organizacion_id is not None:
                    params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request(
                    "GET",
                    "/rest/v1/prospeccion_contacto_envio",
                    params=params,
                )
                data = resp.json() or []
                if not isinstance(data, list):
                    raise CRMRepositoryError(f"worker_get_latest_envios_by_phones_invalid:{data!r}")
                if not data:
                    break

                for row in data:
                    if not isinstance(row, dict):
                        continue
                    detalle = row.get("detalle") if isinstance(row.get("detalle"), dict) else {}
                    phone = str(detalle.get("phone") or "").strip()
                    if not phone or phone not in unresolved_chunk:
                        continue
                    resolved[phone] = row
                    unresolved_chunk.discard(phone)
                    if not unresolved_chunk:
                        break

                fetched = len(data)
                offset += fetched
                if fetched < page_size:
                    break

        return resolved

    async def worker_get_latest_envio_by_email(
        self,
        *,
        email: str,
        canal: str | None = None,
        organizacion_id: UUID | None = None,
        before_iso: str | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene el envío más reciente buscando por correo persistido en detalle->email."""

        trimmed = email.strip().lower() if isinstance(email, str) else ""
        if not trimmed:
            return None
        params: dict[str, str] = {
            "detalle->>email": f"eq.{trimmed}",
            "order": "procesado_en.desc.nullslast,creado_en.desc",
            "limit": "1",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        if canal:
            params["canal"] = f"eq.{canal.strip().lower()}"
        trimmed_before = before_iso.strip() if isinstance(before_iso, str) else ""
        if trimmed_before:
            params["creado_en"] = f"lte.{trimmed_before}"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_latest_envio_by_email_invalid:{row!r}")
        return row

    async def worker_find_active_contact_suppression(
        self,
        *,
        organizacion_id: UUID,
        canal: str,
        prospecto_id: UUID | None = None,
        email: str | None = None,
        phone_e164: str | None = None,
    ) -> dict[str, Any] | None:
        """Busca una suppression activa para el objetivo/canal indicado."""

        canal_norm = canal.strip().lower()
        canal_match = f"(canal.eq.{canal_norm},canal.eq.all)"
        base_params = {
            "select": "id,canal,motivo,origen,metadata",
            "organizacion_id": f"eq.{organizacion_id}",
            "activo": "eq.true",
            "or": canal_match,
            "order": "actualizado_en.desc,creado_en.desc",
            "limit": "1",
        }
        checks: list[dict[str, str]] = []
        if prospecto_id:
            checks.append({**base_params, "prospecto_id": f"eq.{prospecto_id}"})
        if email:
            checks.append({**base_params, "email": f"eq.{email.strip().lower()}"})
        if phone_e164:
            checks.append({**base_params, "phone_e164": f"eq.{phone_e164.strip()}"})

        for params in checks:
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_contacto_suppressions",
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list) or not data:
                continue
            row = data[0]
            if not isinstance(row, dict):
                raise CRMRepositoryError(f"worker_contact_suppression_invalid:{row!r}")
            return row
        return None

    async def worker_create_contact_suppression(
        self,
        *,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Crea una suppression usando service-role."""

        resp = await self._request(
            "POST",
            "/rest/v1/prospeccion_contacto_suppressions",
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("worker_contact_suppression_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_contact_suppression_create_invalid:{row!r}")
        return row

    async def worker_insert_contact_logs(self, entries: Sequence[dict[str, Any]]) -> None:
        """Inserta registros en la bitácora usando service role."""

        if not entries:
            return
        resp = await self._request(
            "POST",
            "/rest/v1/prospeccion_contactos_log",
            json=list(entries),
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_insert_log_invalid:{data!r}")

    async def worker_enqueue_sales_notification_job(
        self,
        *,
        organizacion_id: UUID,
        channel: str,
        trigger: str,
        conversation_id: UUID,
        contact_id: UUID,
        opportunity_id: UUID | None,
        payload: dict[str, Any],
        max_attempts: int,
    ) -> dict[str, Any]:
        """Encola una notificación crítica para vendedor."""

        channel_value = str(channel or "webchat").strip().lower() or "webchat"
        trigger_value = str(trigger or "").strip()
        if not trigger_value:
            raise CRMRepositoryError("worker_sales_notification_trigger_required")
        row_payload = {
            "organizacion_id": str(organizacion_id),
            "channel": channel_value,
            "trigger": trigger_value,
            "conversation_id": str(conversation_id),
            "contact_id": str(contact_id),
            "opportunity_id": str(opportunity_id) if opportunity_id else None,
            "payload": payload,
            "state": "pending",
            "available_at": datetime.now(timezone.utc).isoformat(),
            "max_attempts": max(1, int(max_attempts)),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/sales_notification_jobs",
            json=[row_payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"worker_sales_notification_enqueue_invalid:{data!r}")
        return data[0]

    async def worker_requeue_expired_sales_notification_jobs(self, *, limit: int = 100) -> int:
        """Regresa a pending jobs en processing cuyo lease expiró."""

        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/sales_notification_jobs",
            params={
                "state": "eq.processing",
                "lease_until": f"lt.{now_iso}",
                "limit": str(max(1, int(limit))),
            },
            json={
                "state": "pending",
                "lease_until": None,
                "available_at": now_iso,
                "updated_at": now_iso,
                "last_error": "lease_expired_auto_requeue",
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_sales_notification_requeue_invalid:{data!r}")
        return len(data)

    async def worker_list_ready_sales_notification_jobs(
        self,
        *,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Lista jobs pendientes listos para intentar."""

        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "GET",
            "/rest/v1/sales_notification_jobs",
            params={
                "select": "*",
                "state": "eq.pending",
                "available_at": f"lte.{now_iso}",
                "order": "available_at.asc,created_at.asc",
                "limit": str(max(1, int(limit))),
            },
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_sales_notification_list_invalid:{data!r}")
        output: list[dict[str, Any]] = []
        for row in data:
            if isinstance(row, dict):
                output.append(row)
        return output

    async def worker_claim_sales_notification_job(
        self,
        *,
        job_id: UUID,
        expected_attempt_count: int,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        """Intenta reclamar un job pendiente para procesamiento exclusivo."""

        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        lease_until = (now_dt + timedelta(seconds=max(30, int(lease_seconds)))).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/sales_notification_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.pending",
                "attempt_count": f"eq.{max(0, int(expected_attempt_count))}",
                "available_at": f"lte.{now_iso}",
            },
            json={
                "state": "processing",
                "attempt_count": max(0, int(expected_attempt_count)) + 1,
                "lease_until": lease_until,
                "updated_at": now_iso,
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_sales_notification_claim_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_sales_notification_claim_row_invalid:{row!r}")
        return row

    async def worker_mark_sales_notification_done(
        self,
        *,
        job_id: UUID,
        result: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Marca un job como completado."""

        now_iso = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "state": "done",
            "lease_until": None,
            "processed_at": now_iso,
            "updated_at": now_iso,
            "last_error": None,
        }
        if isinstance(result, dict) and result:
            payload["payload"] = result
        resp = await self._request(
            "PATCH",
            "/rest/v1/sales_notification_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.processing",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_sales_notification_done_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_sales_notification_done_row_invalid:{row!r}")
        return row

    async def worker_mark_sales_notification_retry_or_failed(
        self,
        *,
        job_id: UUID,
        attempt_count: int,
        max_attempts: int,
        error: str,
        retry_delay_seconds: int,
    ) -> dict[str, Any] | None:
        """Reagenda retry o marca fallo definitivo según intentos."""

        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        attempts_done = max(0, int(attempt_count))
        attempts_allowed = max(1, int(max_attempts))
        error_text = str(error or "unknown_error").strip()[:1000] or "unknown_error"
        should_retry = attempts_done < attempts_allowed
        if should_retry:
            next_available = (
                now_dt + timedelta(seconds=max(5, int(retry_delay_seconds)))
            ).isoformat()
            payload = {
                "state": "pending",
                "available_at": next_available,
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": error_text,
            }
        else:
            payload = {
                "state": "failed",
                "processed_at": now_iso,
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": error_text,
            }
        resp = await self._request(
            "PATCH",
            "/rest/v1/sales_notification_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.processing",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_sales_notification_retry_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_sales_notification_retry_row_invalid:{row!r}")
        return row

    async def worker_enqueue_whatsapp_followup_job(
        self,
        *,
        organizacion_id: UUID,
        conversation_id: UUID,
        persona_id: UUID,
        opportunity_id: UUID | None,
        due_at: datetime,
        next_action: str,
        scheduled_reason: str,
        max_attempts: int,
    ) -> dict[str, Any]:
        row_payload = {
            "organizacion_id": str(organizacion_id),
            "conversation_id": str(conversation_id),
            "persona_id": str(persona_id),
            "opportunity_id": str(opportunity_id) if opportunity_id else None,
            "due_at": due_at.astimezone(timezone.utc).isoformat(),
            "next_action": str(next_action or "reengage").strip().lower() or "reengage",
            "scheduled_reason": str(scheduled_reason or "outbound_message").strip() or "outbound_message",
            "state": "pending",
            "max_attempts": max(1, int(max_attempts)),
        }
        resp = await self._request(
            "POST",
            "/rest/v1/whatsapp_followup_jobs",
            json=[row_payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise CRMRepositoryError(f"worker_whatsapp_followup_enqueue_invalid:{data!r}")
        return data[0]

    async def worker_cancel_active_whatsapp_followup_jobs(
        self,
        *,
        conversation_id: UUID,
        reason: str,
    ) -> int:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "conversation_id": f"eq.{conversation_id}",
                "state": "in.(pending,processing)",
            },
            json={
                "state": "canceled",
                "cancel_reason": str(reason or "canceled").strip()[:255] or "canceled",
                "lease_until": None,
                "processed_at": now_iso,
                "updated_at": now_iso,
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_cancel_invalid:{data!r}")
        return len(data)

    async def worker_requeue_expired_whatsapp_followup_jobs(self, *, limit: int = 100) -> int:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "state": "eq.processing",
                "lease_until": f"lt.{now_iso}",
                "limit": str(max(1, int(limit))),
            },
            json={
                "state": "pending",
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": "lease_expired_auto_requeue",
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_requeue_invalid:{data!r}")
        return len(data)

    async def worker_list_ready_whatsapp_followup_jobs(self, *, limit: int = 25) -> list[dict[str, Any]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "GET",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "select": "*",
                "state": "eq.pending",
                "due_at": f"lte.{now_iso}",
                "order": "due_at.asc,created_at.asc",
                "limit": str(max(1, int(limit))),
            },
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_list_invalid:{data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def worker_claim_whatsapp_followup_job(
        self,
        *,
        job_id: UUID,
        expected_attempt_count: int,
        lease_seconds: int,
    ) -> dict[str, Any] | None:
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        lease_until = (now_dt + timedelta(seconds=max(30, int(lease_seconds)))).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.pending",
                "attempt_count": f"eq.{max(0, int(expected_attempt_count))}",
                "due_at": f"lte.{now_iso}",
            },
            json={
                "state": "processing",
                "attempt_count": max(0, int(expected_attempt_count)) + 1,
                "lease_until": lease_until,
                "updated_at": now_iso,
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_claim_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_whatsapp_followup_claim_row_invalid:{row!r}")
        return row

    async def worker_mark_whatsapp_followup_done(
        self,
        *,
        job_id: UUID,
        result: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        now_iso = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "state": "done",
            "lease_until": None,
            "processed_at": now_iso,
            "updated_at": now_iso,
            "last_error": None,
        }
        if isinstance(result, dict) and result:
            payload["scheduled_reason"] = str(result.get("scheduled_reason") or payload.get("scheduled_reason") or "processed")
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.processing",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_done_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_whatsapp_followup_done_row_invalid:{row!r}")
        return row

    async def worker_reschedule_whatsapp_followup_job(
        self,
        *,
        job_id: UUID,
        due_at: datetime,
        next_action: str,
        scheduled_reason: str,
    ) -> dict[str, Any] | None:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.processing",
            },
            json={
                "state": "pending",
                "due_at": due_at.astimezone(timezone.utc).isoformat(),
                "next_action": str(next_action or "reengage").strip().lower() or "reengage",
                "scheduled_reason": str(scheduled_reason or "rescheduled").strip() or "rescheduled",
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": None,
            },
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_reschedule_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_whatsapp_followup_reschedule_row_invalid:{row!r}")
        return row

    async def worker_mark_whatsapp_followup_retry_or_failed(
        self,
        *,
        job_id: UUID,
        attempt_count: int,
        max_attempts: int,
        error: str,
        retry_delay_seconds: int,
    ) -> dict[str, Any] | None:
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        attempts_done = max(0, int(attempt_count))
        attempts_allowed = max(1, int(max_attempts))
        error_text = str(error or "unknown_error").strip()[:1000] or "unknown_error"
        should_retry = attempts_done < attempts_allowed
        if should_retry:
            due_at = (now_dt + timedelta(seconds=max(5, int(retry_delay_seconds)))).isoformat()
            payload = {
                "state": "pending",
                "due_at": due_at,
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": error_text,
            }
        else:
            payload = {
                "state": "failed",
                "processed_at": now_iso,
                "lease_until": None,
                "updated_at": now_iso,
                "last_error": error_text,
            }
        resp = await self._request(
            "PATCH",
            "/rest/v1/whatsapp_followup_jobs",
            params={
                "id": f"eq.{job_id}",
                "state": "eq.processing",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_whatsapp_followup_retry_invalid:{data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_whatsapp_followup_retry_row_invalid:{row!r}")
        return row

    async def get_whatsapp_conversation_for_followup_job(self, *, conversation_id: UUID) -> dict[str, Any] | None:
        resp = await self._request(
            "GET",
            "/rest/v1/conversaciones",
            params={
                "id": f"eq.{conversation_id}",
                "canal": "eq.whatsapp",
                "select": (
                    "id,contacto_id,persona_id,organizacion_id,estado,ultimo_saliente_en,ultimo_entrante_en,inbox_context,"
                    "conversaciones_controles(manual_override)"
                ),
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"whatsapp_followup_conversation_invalid:{row!r}")
        return row

    async def worker_find_contact_by_prospecto(
        self,
        *,
        organizacion_id: UUID,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>prospecto_id": f"eq.{prospecto_id}",
            "select": (
                "id,organizacion_id,nombre,apellido_paterno,apellido_materno,nombre_completo,"
                "correo_principal,correo_secundario,correo_institucional,telefono_principal_e164,telefono_principal_extension,telefono_movil_1_e164,puesto,area,rol_decision,estado,"
                "origen,notas,metadata,persona_datos,propietario_usuario_id,creado_en,actualizado_en"
            ),
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/personas",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_find_contact_invalid:{row!r}")
        org_value = row.get("organizacion_id")
        if not org_value:
            return None
        try:
            org_uuid = _coerce_uuid(str(org_value), field="organizacion_id")
        except ValueError:
            return None
        return await self._persona_to_contact_row(persona=row, organizacion_id=org_uuid)

    async def worker_find_persona_by_prospecto(
        self,
        *,
        organizacion_id: UUID,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        return await self.worker_find_contact_by_prospecto(
            organizacion_id=organizacion_id,
            prospecto_id=prospecto_id,
        )

    async def worker_find_opportunity_by_prospecto(
        self,
        *,
        organizacion_id: UUID,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>prospecto_id": f"eq.{prospecto_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_find_opportunity_invalid:{row!r}")
        return row

    async def worker_sync_batch_status(self, *, batch_id: UUID) -> str | None:
        """Actualiza el estado del lote conforme avanza el procesamiento."""

        pending_total = await self._count_batch_envios(
            batch_id=batch_id,
            estados=("pendiente", "procesando"),
        )
        if pending_total > 0:
            await self._request(
                "PATCH",
                "/rest/v1/prospeccion_contacto_batch",
                params={"id": f"eq.{batch_id}"},
                json={"estado": "en_proceso"},
            )
            return "en_proceso"

        error_total = await self._count_batch_envios(
            batch_id=batch_id,
            estados=("error", "fallido"),
        )
        estado_final = "error" if error_total > 0 else "completado"
        payload = {
            "estado": estado_final,
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
        }
        await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_batch",
            params={"id": f"eq.{batch_id}"},
            json=payload,
        )
        return estado_final

    async def create_buscador_job(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = [dict(payload, organizacion_id=str(organizacion_id))]
        resp = await self._request(
            "POST",
            "/rest/v1/prospeccion_buscador_jobs",
            json=body,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("buscador_job_create_failed")
        return row

    async def list_buscador_jobs(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        limit_value = max(1, min(limit, 200))
        offset_value = max(0, offset)
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "created_at.desc",
            "limit": str(limit_value),
        }
        if offset_value:
            params["offset"] = str(offset_value)
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_buscador_jobs",
            params=params,
            prefer="count=exact",
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_job_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        total_value = total if total is not None else len(data)
        return data, total_value

    async def get_buscador_job(
        self,
        *,
        job_id: UUID,
        organizacion_id: UUID,
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{job_id}", "organizacion_id": f"eq.{organizacion_id}", "limit": "1"}
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_buscador_jobs",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"buscador_job_get_invalid:{row!r}")
        return row

    async def delete_buscador_job(
        self,
        *,
        job_id: UUID,
        organizacion_id: UUID,
    ) -> int:
        params = {
            "id": f"eq.{job_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/prospeccion_buscador_jobs",
            params=params,
            prefer="return=representation",
            organizacion_id=organizacion_id,
        )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_job_delete_invalid:{data!r}")
        return len(data)

    async def create_denue_job(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = [payload]
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_denue_jobs",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("denue_job_create_failed")
        return row

    async def get_denue_job(
        self,
        *,
        job_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{job_id}", "limit": "1"}
        request = (
            self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_denue_jobs",
                token=usuario_token or "",
                params=params,
            )
            if usuario_token
            else self._request(
                "GET",
                "/rest/v1/prospeccion_denue_jobs",
                params=params,
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"denue_job_get_invalid:{row!r}")
        return row

    async def worker_update_denue_job(
        self,
        *,
        job_id: UUID,
        payload: dict[str, Any],
        strict: bool = True,
        extra_filters: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {"id": f"eq.{job_id}"}
        if extra_filters:
            params.update(extra_filters)
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_denue_jobs",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            if strict:
                raise CRMRepositoryError(f"denue_job_update_invalid:{data!r}")
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"denue_job_update_invalid:{row!r}")
        return row

    async def list_buscador_resultados(
        self,
        *,
        organizacion_id: UUID,
        job_id: UUID,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        limit_value = limit if isinstance(limit, int) else 2000
        limit_value = max(1, min(limit_value, 2000))
        offset_value = max(offset or 0, 0)
        params = {
            "job_id": f"eq.{job_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.asc",
            "limit": str(limit_value),
        }
        if offset_value:
            params["offset"] = str(offset_value)
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_buscador_resultados",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_resultados_list_invalid:{data!r}")
        return data

    async def list_buscador_resultados_by_ids(
        self,
        *,
        organizacion_id: UUID,
        job_id: UUID,
        result_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        if not result_ids:
            return []
        ids_param = ",".join(str(value) for value in result_ids)
        params = {
            "job_id": f"eq.{job_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"in.({ids_param})",
            "limit": str(len(result_ids)),
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_buscador_resultados",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_resultados_by_ids_invalid:{data!r}")
        return data

    async def list_buscador_prospecto_result_ids(
        self,
        *,
        organizacion_id: UUID,
        job_id: UUID,
        chunk_size: int = 1000,
    ) -> set[str]:
        chunk_value = max(1, min(chunk_size, 2000))
        existing: set[str] = set()
        offset = 0
        while True:
            params: dict[str, str] = {
                "buscador_job_id": f"eq.{job_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "select": "buscador_result_id",
                "limit": str(chunk_value),
            }
            if offset:
                params["offset"] = str(offset)
            resp = await self._request(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                params=params,
                organizacion_id=organizacion_id,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"buscador_prospectos_list_invalid:{data!r}")
            if not data:
                break
            for row in data:
                value = row.get("buscador_result_id")
                if isinstance(value, str) and value:
                    existing.add(value)
            if len(data) < chunk_value:
                break
            offset += len(data)
        return existing

    async def list_prospectos_by_emails(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        emails: Sequence[str],
    ) -> list[dict[str, Any]]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in emails:
            value = str(item or "").strip().lower()
            if not value or value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        if not normalized:
            return []
        rows_by_id: dict[str, dict[str, Any]] = {}
        chunk_size = 200
        for start in range(0, len(normalized), chunk_size):
            chunk = normalized[start : start + chunk_size]
            in_clause = _postgrest_in_clause(chunk)
            params = {
                "select": "id,email,correo_principal,correo_secundario",
                "or": f"(email.{in_clause},correo_principal.{in_clause},correo_secundario.{in_clause})",
                "limit": str(len(chunk)),
            }
            if organizacion_id is not None:
                params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    params=params,
                    organizacion_id=organizacion_id,
                )
            else:
                if not usuario_token:
                    raise CRMRepositoryError("prospectos_by_emails_missing_token")
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    token=usuario_token,
                    params=params,
                )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"prospectos_by_emails_invalid:{data!r}")
            for row in data:
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get("id") or "").strip()
                if row_id and row_id not in rows_by_id:
                    rows_by_id[row_id] = row
        return list(rows_by_id.values())

    async def list_prospectos_by_phones(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        phones: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Obtiene prospectos que coinciden con alguno de los telefonos dados."""

        normalized: list[str] = []
        seen: set[str] = set()
        for item in phones:
            raw = str(item or "").strip()
            if not raw:
                continue
            candidates = {
                raw,
                normalize_phone(raw) or "",
                normalize_phone_digits(raw) or "",
            }
            for candidate in candidates:
                value = candidate.strip()
                if not value or value in seen:
                    continue
                seen.add(value)
                normalized.append(value)
        if not normalized:
            return []

        params_base = {
            "select": "id,email,correo_principal,correo_secundario,phone,phone_e164,telefono_principal_e164,telefono_movil_1_e164",
            "limit": str(max(1000, len(normalized) * 4)),
        }
        rows_by_id: dict[str, dict[str, Any]] = {}
        chunk_size = 200

        for start in range(0, len(normalized), chunk_size):
            chunk = normalized[start : start + chunk_size]
            in_clause = _postgrest_in_clause(chunk)
            params = dict(params_base)
            params["or"] = (
                f"(phone.{in_clause},phone_e164.{in_clause},"
                f"telefono_principal_e164.{in_clause},telefono_movil_1_e164.{in_clause})"
            )
            if organizacion_id is not None:
                params["organizacion_id"] = f"eq.{organizacion_id}"
                resp = await self._request(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    params=params,
                    organizacion_id=organizacion_id,
                )
            else:
                if not usuario_token:
                    raise CRMRepositoryError("prospectos_by_phones_missing_token")
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/prospeccion_prospectos",
                    token=usuario_token,
                    params=params,
                )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"prospectos_by_phones_invalid:{data!r}")
            for row in data:
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get("id") or "").strip()
                if row_id and row_id not in rows_by_id:
                    rows_by_id[row_id] = row
        return list(rows_by_id.values())

    async def worker_update_buscador_job(
        self,
        *,
        job_id: UUID,
        payload: dict[str, Any],
        strict: bool = True,
        extra_filters: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {"id": f"eq.{job_id}"}
        if extra_filters:
            params.update(extra_filters)
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_buscador_jobs",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            if strict:
                raise CRMRepositoryError(f"buscador_job_update_invalid:{data!r}")
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"buscador_job_update_invalid:{row!r}")
        return row

    async def worker_replace_buscador_results(
        self,
        *,
        job_id: UUID,
        organizacion_id: UUID | None,
        items: list[dict[str, Any]],
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/prospeccion_buscador_resultados",
            params={"job_id": f"eq.{job_id}"},
        )
        if not items:
            return
        chunk_size = 500
        for start in range(0, len(items), chunk_size):
            chunk = items[start : start + chunk_size]
            # Asegurar job_id/organizacion_id presentes
            for row in chunk:
                row.setdefault("job_id", str(job_id))
                if organizacion_id:
                    row.setdefault("organizacion_id", str(organizacion_id))
            await self._request(
                "POST",
                "/rest/v1/prospeccion_buscador_resultados",
                json=chunk,
                prefer="return=minimal",
            )

    async def worker_upsert_resultados(
        self,
        *,
        payload: dict[str, Any],
        organizacion_id: UUID | None = None,
    ) -> None:
        logger.info(
            "worker_upsert_resultados_start",
            extra={
                "organizacion_id": str(organizacion_id) if organizacion_id else None,
                "item_count": len(payload.get("p_items", [])) if isinstance(payload.get("p_items"), list) else None,
                "busqueda": payload.get("p_busqueda_id"),
            },
        )
        await self._request(
            "POST",
            "/rest/v1/rpc/upsert_resultados_lote",
            json=payload,
            prefer="return=minimal",
            organizacion_id=organizacion_id,
        )

    async def worker_update_busqueda(
        self,
        *,
        busqueda_id: UUID,
        payload: dict[str, Any],
    ) -> None:
        await self._request(
            "PATCH",
            "/rest/v1/busquedas",
            params={"id": f"eq.{busqueda_id}"},
            json=payload,
            prefer="return=minimal",
        )

    async def bulk_insert_prospectos(
        self,
        *,
        usuario_token: str | None = None,
        organizacion_id: UUID | None = None,
        items: Sequence[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not items:
            return []
        created: list[dict[str, Any]] = []
        chunk_size = 200
        for start in range(0, len(items), chunk_size):
            chunk = _align_postgrest_bulk_items(items[start : start + chunk_size])
            if organizacion_id is not None:
                for row in chunk:
                    row.setdefault("organizacion_id", str(organizacion_id))
                resp = await self._request(
                    "POST",
                    "/rest/v1/prospeccion_prospectos",
                    json=chunk,
                    prefer="return=representation",
                    organizacion_id=organizacion_id,
                )
            else:
                if not usuario_token:
                    raise CRMRepositoryError("prospecto_bulk_insert_missing_token")
                resp = await self._request_with_user(
                    "POST",
                    "/rest/v1/prospeccion_prospectos",
                    token=usuario_token,
                    json=chunk,
                    prefer="return=representation",
                )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"prospecto_bulk_insert_invalid:{data!r}")
            created.extend(data)
        return created

    async def get_prospeccion_stage_summary(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        last_exc: CRMRepositoryError | None = None
        for attempt in range(3):
            try:
                resp = await self._request_with_user(
                    "POST",
                    "/rest/v1/rpc/prospeccion_stage_resumen",
                    token=usuario_token,
                    json={},
                )
                data = resp.json()
                if not isinstance(data, dict):
                    raise CRMRepositoryError(f"stage_summary_invalid:{data!r}")
                return data
            except CRMRepositoryError as exc:
                last_exc = exc
                error_message = str(exc)
                retryable = (
                    "Error de red al llamar Supabase" in error_message
                    or "Supabase respondió error 502" in error_message
                    or "Supabase respondió error 503" in error_message
                    or "Supabase respondió error 504" in error_message
                )
                if not retryable or attempt >= 2:
                    raise
                logger.warning(
                    "crm.stage_summary_retry",
                    extra={"attempt": attempt + 1, "error": error_message},
                )
                await asyncio.sleep(0.2 * (attempt + 1))
        if last_exc:
            raise last_exc
        raise CRMRepositoryError("stage_summary_retry_exhausted")

    async def get_prospeccion_enriquecimiento_resumen(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        last_exc: CRMRepositoryError | None = None
        for attempt in range(3):
            try:
                resp = await self._request_with_user(
                    "POST",
                    "/rest/v1/rpc/prospeccion_enriquecimiento_resumen",
                    token=usuario_token,
                    json={},
                )
                data = resp.json()
                if not isinstance(data, dict):
                    raise CRMRepositoryError(f"enriquecimiento_resumen_invalid:{data!r}")
                return data
            except CRMRepositoryError as exc:
                last_exc = exc
                error_message = str(exc)
                retryable = (
                    "Error de red al llamar Supabase" in error_message
                    or "Supabase respondió error 502" in error_message
                    or "Supabase respondió error 503" in error_message
                    or "Supabase respondió error 504" in error_message
                )
                if not retryable or attempt >= 2:
                    raise
                logger.warning(
                    "crm.enriquecimiento_resumen_retry",
                    extra={"attempt": attempt + 1, "error": error_message},
                )
                await asyncio.sleep(0.2 * (attempt + 1))
        if last_exc:
            raise last_exc
        raise CRMRepositoryError("enriquecimiento_resumen_retry_exhausted")

    async def get_email_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "limit": "1",
        }
        if organizacion_id is not None:
            params["organizacion_id"] = f"eq.{organizacion_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/panel_email_templates",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener template de correo: {row!r}")
        return row

    async def upsert_email_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"slug": slug, "organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/panel_email_templates",
            params={"on_conflict": "organizacion_id,slug"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el template de correo actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar template de correo: {row!r}"
            )
        return row

    async def get_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/quote_templates",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener template de cotización: {row!r}"
            )
        return row

    async def upsert_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
        payload: dict[str, Any],
        updated_by: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "slug": slug,
            "organizacion_id": str(organizacion_id),
            **payload,
        }
        if updated_by:
            body["updated_by"] = str(updated_by)
        resp = await self._request(
            "POST",
            "/rest/v1/quote_templates",
            params={"on_conflict": "slug,organizacion_id"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el template de cotización actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar template de cotización: {row!r}"
            )
        return row

    async def get_calendar_settings(
        self,
        *,
        slug: str,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/panel_calendar_settings",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener settings del calendario: {row!r}"
            )
        return row

    async def upsert_calendar_settings(
        self,
        *,
        slug: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"slug": slug, **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/panel_calendar_settings",
            params={"on_conflict": "slug"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(
                "Supabase no devolvió los settings del calendario actualizados"
            )
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar settings del calendario: {row!r}"
            )
        return row

    async def list_calendar_resources(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": (
                "id,name,slug,timezone,slot_minutes,buffer_minutes,capacity_per_slot,"
                "max_holds_per_slot,max_days_visible,is_active,metadata,created_at,updated_at"
            ),
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "name.asc",
        }
        if not include_inactive:
            params["is_active"] = "eq.true"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_resources",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al listar calendar_resources: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def list_calendar_resources_by_organizacion(
        self,
        *,
        organizacion_id: UUID,
        include_inactive: bool = False,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": (
                "id,name,slug,timezone,slot_minutes,buffer_minutes,capacity_per_slot,"
                "max_holds_per_slot,max_days_visible,is_active,metadata,created_at,updated_at"
            ),
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "name.asc",
        }
        if not include_inactive:
            params["is_active"] = "eq.true"
        resp = await self._request(
            "GET",
            "/rest/v1/calendar_resources",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al listar calendar_resources: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_calendar_resource(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        resource_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "select": (
                "id,name,slug,timezone,slot_minutes,buffer_minutes,capacity_per_slot,"
                "max_holds_per_slot,max_days_visible,is_active,metadata,created_at,updated_at"
            ),
            "id": f"eq.{resource_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_resources",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_resources: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_resources: {row!r}")
        return row

    async def get_calendar_resource_by_organizacion(
        self,
        *,
        organizacion_id: UUID,
        resource_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "select": (
                "id,name,slug,timezone,slot_minutes,buffer_minutes,capacity_per_slot,"
                "max_holds_per_slot,max_days_visible,is_active,metadata,created_at,updated_at"
            ),
            "id": f"eq.{resource_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/calendar_resources",
            params=params,
            organizacion_id=organizacion_id,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_resources: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_resources: {row!r}")
        return row

    async def update_calendar_resource(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        resource_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not payload:
            raise CRMRepositoryError("resource_payload_required")
        params = {
            "id": f"eq.{resource_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/calendar_resources",
            token=usuario_token,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar calendar_resources: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar calendar_resources: {row!r}")
        return row

    async def list_calendar_exceptions(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        resource_id: UUID | None = None,
        kind: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
        exclude_exception_id: UUID | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "id,resource_id,kind,start_at,end_at,capacity,reason,metadata,created_at,updated_at",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "start_at.asc",
            "limit": str(max(1, min(limit, 500))),
        }
        if resource_id is not None:
            params["resource_id"] = f"eq.{resource_id}"
        if kind:
            params["kind"] = f"eq.{kind}"
        if exclude_exception_id is not None:
            params["id"] = f"neq.{exclude_exception_id}"
        if start_at is not None and end_at is not None:
            params["and"] = f"(start_at.lt.{end_at.isoformat()},end_at.gt.{start_at.isoformat()})"
        elif start_at is not None:
            params["end_at"] = f"gt.{start_at.isoformat()}"
        elif end_at is not None:
            params["start_at"] = f"lt.{end_at.isoformat()}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_exceptions",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al listar calendar_exceptions: {data!r}")
        return [row for row in data if isinstance(row, dict)]

    async def get_calendar_exception(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        exception_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,resource_id,kind,start_at,end_at,capacity,reason,metadata,created_at,updated_at",
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{exception_id}",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_exceptions",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_exception: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener calendar_exception: {row!r}")
        return row

    async def create_calendar_exception(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/calendar_exceptions",
            token=usuario_token,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la excepción creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear calendar_exceptions: {row!r}")
        return row

    async def update_calendar_exception(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        exception_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not payload:
            raise CRMRepositoryError("exception_payload_required")
        params = {
            "id": f"eq.{exception_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/calendar_exceptions",
            token=usuario_token,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar calendar_exceptions: {data!r}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar calendar_exceptions: {row!r}")
        return row

    async def delete_calendar_exception(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        exception_id: UUID,
    ) -> bool:
        params = {
            "id": f"eq.{exception_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/calendar_exceptions",
            token=usuario_token,
            params=params,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar calendar_exceptions: {data!r}")
        return bool(data)

    async def list_calendar_patterns(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        resource_id: UUID | None = None,
        weekday: int | None = None,
        include_inactive: bool = True,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": (
                "id,resource_id,weekday,start_time,end_time,start_date,end_date,capacity,"
                "priority,is_active,metadata,created_at,updated_at"
            ),
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "weekday.asc,start_time.asc,priority.desc",
            "limit": str(max(1, min(limit, 1000))),
        }
        if resource_id is not None:
            params["resource_id"] = f"eq.{resource_id}"
        if weekday is not None:
            params["weekday"] = f"eq.{weekday}"
        if not include_inactive:
            params["is_active"] = "eq.true"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_availability_patterns",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inválida al listar calendar_availability_patterns: {data!r}"
            )
        return [row for row in data if isinstance(row, dict)]

    async def get_calendar_pattern(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        pattern_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "select": (
                "id,resource_id,weekday,start_time,end_time,start_date,end_date,capacity,"
                "priority,is_active,metadata,created_at,updated_at"
            ),
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{pattern_id}",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_availability_patterns",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener calendar_availability_patterns: {data!r}"
            )
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener calendar_availability_patterns: {row!r}"
            )
        return row

    async def create_calendar_pattern(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/calendar_availability_patterns",
            token=usuario_token,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el patrón creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al crear calendar_availability_patterns: {row!r}"
            )
        return row

    async def update_calendar_pattern(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        pattern_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not payload:
            raise CRMRepositoryError("pattern_payload_required")
        params = {
            "id": f"eq.{pattern_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/calendar_availability_patterns",
            token=usuario_token,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar calendar_availability_patterns: {data!r}"
            )
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar calendar_availability_patterns: {row!r}"
            )
        return row

    async def delete_calendar_pattern(
        self,
        *,
        usuario_token: str,
        organizacion_id: UUID,
        pattern_id: UUID,
    ) -> bool:
        params = {
            "id": f"eq.{pattern_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/calendar_availability_patterns",
            token=usuario_token,
            params=params,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inválida al eliminar calendar_availability_patterns: {data!r}"
            )
        return bool(data)

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,config",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/organizaciones", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        config = row.get("config")
        return config if isinstance(config, dict) else ({} if config is None else None)

    async def set_organizacion_config(
        self,
        *,
        organizacion_id: UUID,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"config": config}
        resp = await self._request(
            "PATCH",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("organizacion_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar configuración de organización: {row!r}")
        return row

    @staticmethod
    def _extract_total_count(content_range: str | None) -> int | None:
        if not content_range or "/" not in content_range:
            return None
        _, total_str = content_range.split("/", 1)
        try:
            total_value = int(total_str)
        except ValueError:
            return None
        return total_value if total_value >= 0 else None

    @staticmethod
    def _first_row(data: Any) -> Any:
        if isinstance(data, list):
            return data[0] if data else None
        return data

    async def _count_batch_envios(
        self,
        *,
        batch_id: UUID,
        estados: Sequence[str],
    ) -> int:
        params: dict[str, str] = {
            "batch_id": f"eq.{batch_id}",
            "select": "id",
            "limit": "1",
        }
        if estados:
            or_filters = ",".join(f"estado.eq.{estado}" for estado in estados)
            params["or"] = f"({or_filters})"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def count_pending_email_envios_for_local_day(
        self,
        *,
        usuario_token: str,
        start_utc: datetime,
        end_utc_exclusive: datetime,
    ) -> int:
        """Cuenta envíos de correo pendientes/procesando programados para un día local."""

        params: dict[str, str] = {
            "select": "id",
            "limit": "1",
            "canal": "eq.correo",
            "estado": "in.(pendiente,procesando)",
            "and": (
                f"(programado_en.gte.{start_utc.isoformat()},"
                f"programado_en.lt.{end_utc_exclusive.isoformat()})"
            ),
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def _list_scian_table(self, *, table: str) -> list[dict[str, Any]]:
        """Helper que obtiene todas las filas de una tabla SCIAN ordenadas por código."""

        params = {"select": "*", "order": "codigo.asc"}
        resp = await self._request("GET", f"/rest/v1/{table}", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar {table}: {data!r}")
        return data

    async def _request(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        organizacion_id: UUID | None = None,
    ) -> httpx.Response:
        if self._user_token:
            return await self._request_with_user(
                method,
                path,
                token=self._user_token,
                params=params,
                json=json,
                prefer=prefer,
                organizacion_id=organizacion_id,
            )
        return await self._request_service_role(
            method,
            path,
            params=params,
            json=json,
            prefer=prefer,
            organizacion_id=organizacion_id,
        )

    async def _request_service_role(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        organizacion_id: UUID | None = None,
    ) -> httpx.Response:
        url = f"{self._base_url}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        if organizacion_id:
            headers["X-Organizacion-Id"] = str(organizacion_id)
        if prefer:
            headers["Prefer"] = prefer
        json_payload = _make_json_serializable(json) if json is not None else None
        logger.info(
            "crm_request_start",
            extra={
                "method": method,
                "path": path,
                "params": params,
                "json_keys": list(json_payload.keys()) if isinstance(json_payload, dict) else None,
                "organizacion_id": str(organizacion_id) if organizacion_id else None,
            },
        )
        retries = 2
        delay_seconds = 0.5
        last_exc: httpx.RequestError | None = None
        resp: httpx.Response | None = None
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.request(method, url, params=params, json=json_payload, headers=headers)
                if attempt > 0:
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_recovered",
                            "operation": f"{method} {path}",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                        }
                    )
                break
            except httpx.RequestError as exc:  # pragma: no cover - red de terceros
                last_exc = exc
                if attempt < retries and _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_retry_scheduled",
                            "operation": f"{method} {path}",
                            "attempt": attempt + 1,
                            "next_attempt": attempt + 2,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                    await asyncio.sleep(delay_seconds)
                    continue
                if _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_failure",
                            "operation": f"{method} {path}",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                raise CRMRepositoryError(f"Error de red al llamar Supabase: {exc}") from exc
        if resp is None and last_exc is not None:
            raise CRMRepositoryError(f"Error de red al llamar Supabase: {last_exc}") from last_exc
        logger.info(
            "crm_request_response",
            extra={"method": method, "path": path, "status": resp.status_code},
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en {path}: {resp.text}"
            )
        return resp

    async def read_shared_response_cache(
        self,
        *,
        cache_namespace: str,
        cache_key: str,
    ) -> dict[str, Any] | None:
        namespace = (cache_namespace or "").strip()
        key = (cache_key or "").strip()
        if not namespace or not key:
            return None
        resp = await self._request_service_role(
            "GET",
            "/rest/v1/crm_response_cache",
            params={
                "cache_namespace": f"eq.{namespace}",
                "cache_key": f"eq.{key}",
                "select": "expires_at,payload",
                "limit": "1",
            },
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        expires_at_raw = row.get("expires_at")
        if isinstance(expires_at_raw, str):
            try:
                expires_at = datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
            except ValueError:
                expires_at = None
            else:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at <= datetime.now(timezone.utc):
                    return None
        payload = row.get("payload")
        if isinstance(payload, dict):
            return payload
        if isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                return None
            if isinstance(parsed, dict):
                return parsed
        return None

    async def write_shared_response_cache(
        self,
        *,
        cache_namespace: str,
        cache_key: str,
        payload: dict[str, Any],
        ttl_seconds: int,
    ) -> None:
        namespace = (cache_namespace or "").strip()
        key = (cache_key or "").strip()
        if not namespace or not key or ttl_seconds <= 0:
            return
        now = datetime.now(timezone.utc)
        body = {
            "cache_namespace": namespace,
            "cache_key": key,
            "expires_at": (now + timedelta(seconds=ttl_seconds)).isoformat(),
            "payload": payload,
            "updated_at": now.isoformat(),
        }
        await self._request_service_role(
            "POST",
            "/rest/v1/crm_response_cache",
            json=body,
            params={"on_conflict": "cache_namespace,cache_key"},
            prefer="resolution=merge-duplicates,return=representation",
        )

    async def _upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        key = object_key.lstrip("/")
        if not key:
            raise CRMRepositoryError("object_key_required")
        url = f"{self._base_url}/storage/v1/object/{bucket_name}/{key}"
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": content_type or "application/octet-stream",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    url, headers=headers, content=content, params={"upsert": "true"}
                )
        except httpx.RequestError as exc:
            raise CRMRepositoryError(
                f"Error de red al subir objeto {bucket_name}/{key}: {exc}"
            ) from exc
        if resp.status_code >= 400:
            logger.error(
                "storage_upload_error",
                extra={
                    "bucket": bucket_name,
                    "key": key,
                    "status": resp.status_code,
                    "body": resp.text,
                },
            )
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al subir objeto {bucket_name}/{key}: {resp.text}"
            )
        public_path: str | None = None
        content_type_header = (resp.headers.get("content-type") or "").lower()
        if "application/json" in content_type_header:
            try:
                payload = resp.json()
            except ValueError:
                payload = {}
            if isinstance(payload, dict):
                public_path = payload.get("Key")
        if not public_path:
            prefix = f"{bucket_name}/"
            public_path = f"{prefix}{key}" if not key.startswith(prefix) else key
        return public_path

    async def delete_storage_object(
        self,
        *,
        bucket: str,
        object_path: str,
    ) -> None:
        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        normalized_path = object_path.strip().lstrip("/")
        if not normalized_path:
            raise CRMRepositoryError("object_key_required")

        candidate_paths: list[str] = []

        def add_candidate(value: str) -> None:
            candidate = value.strip().lstrip("/")
            if candidate and candidate not in candidate_paths:
                candidate_paths.append(candidate)

        add_candidate(normalized_path)

        stripped = normalized_path
        prefix = f"{bucket_name}/"
        while stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            add_candidate(stripped)

        if not normalized_path.startswith(prefix):
            add_candidate(f"{bucket_name}/{normalized_path}")

        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        for candidate in candidate_paths:
            url = f"{self._base_url}/storage/v1/object/{bucket_name}/{candidate}"
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.delete(url, headers=headers)
            except httpx.RequestError as exc:
                raise CRMRepositoryError(
                    f"Error de red al borrar objeto {bucket_name}/{candidate}: {exc}"
                ) from exc
            if resp.status_code < 400:
                return
            payload_text = resp.text or ""
            if "not_found" in payload_text.lower() or "object not found" in payload_text.lower():
                continue
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al borrar objeto {bucket_name}/{candidate}: {resp.text}"
            )

    async def download_storage_object(
        self,
        *,
        bucket: str,
        object_path: str,
    ) -> bytes:
        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        normalized_path = object_path.strip().lstrip("/")
        if not normalized_path:
            raise CRMRepositoryError("object_key_required")
        candidate_paths: list[str] = []

        def add_candidate(value: str) -> None:
            candidate = value.strip().lstrip("/")
            if candidate and candidate not in candidate_paths:
                candidate_paths.append(candidate)

        add_candidate(normalized_path)

        stripped = normalized_path
        prefix = f"{bucket_name}/"
        while stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            add_candidate(stripped)

        if not normalized_path.startswith(prefix):
            add_candidate(f"{bucket_name}/{normalized_path}")

        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        last_error: CRMRepositoryError | None = None
        for candidate in candidate_paths:
            url = f"{self._base_url}/storage/v1/object/{bucket_name}/{candidate}"
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(url, headers=headers)
            except httpx.RequestError as exc:
                raise CRMRepositoryError(
                    f"Error de red al descargar objeto {bucket_name}/{candidate}: {exc}"
                ) from exc
            if resp.status_code < 400:
                return resp.content
            payload_text = resp.text or ""
            if "not_found" in payload_text.lower() or "object not found" in payload_text.lower():
                last_error = CRMRepositoryError(payload_text)
                continue
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al descargar objeto {bucket_name}/{candidate}: {resp.text}"
            )
        raise last_error or CRMRepositoryError("object_not_found")

    async def create_signed_storage_url(
        self,
        *,
        bucket: str,
        object_path: str,
        expires_in: int = 300,
    ) -> str:
        """Genera un enlace firmado para un objeto de Storage."""

        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        if expires_in <= 0:
            raise CRMRepositoryError("expires_in_invalid")

        normalized_path = object_path.strip().lstrip("/")
        if not normalized_path:
            raise CRMRepositoryError("object_key_required")

        candidate_paths: list[str] = []

        def add_candidate(value: str) -> None:
            candidate = value.strip().lstrip("/")
            if candidate and candidate not in candidate_paths:
                candidate_paths.append(candidate)

        add_candidate(normalized_path)

        stripped = normalized_path
        prefix = f"{bucket_name}/"
        while stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            add_candidate(stripped)

        if not normalized_path.startswith(prefix):
            add_candidate(f"{bucket_name}/{normalized_path}")

        last_error: CRMRepositoryError | None = None
        for candidate in candidate_paths:
            if not candidate:
                continue
            for attempt in range(3):
                try:
                    resp = await self._request_service_role(
                        "POST",
                        f"/storage/v1/object/sign/{bucket_name}/{candidate}",
                        json={"expiresIn": expires_in},
                    )
                except CRMRepositoryError as exc:
                    payload_text = str(exc)
                    if "not_found" in payload_text.lower() or "object not found" in payload_text.lower():
                        last_error = CRMRepositoryError(payload_text)
                        if attempt < 2:
                            continue
                        break
                    raise
                if resp.status_code < 400:
                    data = resp.json()
                    if not isinstance(data, dict):
                        raise CRMRepositoryError("signed_url_invalid_response")
                    signed_fragment = data.get("signedURL") or data.get("signedUrl")
                    if not signed_fragment or not isinstance(signed_fragment, str):
                        raise CRMRepositoryError("signed_url_missing")
                    if signed_fragment.startswith("http://") or signed_fragment.startswith("https://"):
                        return signed_fragment

                    fragment = signed_fragment if signed_fragment.startswith("/") else f"/{signed_fragment}"
                    if not fragment.startswith("/storage/"):
                        fragment = f"/storage/v1{fragment}"

                    base = self._base_url.rstrip("/")
                    return f"{base}{fragment}"

                payload_text = resp.text or ""
                if "not_found" in payload_text.lower() or "object not found" in payload_text.lower():
                    last_error = CRMRepositoryError(payload_text)
                    if attempt < 2:
                        await asyncio.sleep(0.4 * (attempt + 1))
                        continue
                    break
                raise CRMRepositoryError(
                    f"Supabase respondió error {resp.status_code} al firmar objeto {bucket_name}/{candidate}: {resp.text}"
                )

        raise last_error or CRMRepositoryError("signed_url_missing")

    async def _rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        url = f"{self._base_url}/rest/v1/rpc/{function_name}"
        if self._user_token:
            resp = await self._request_with_user(
                "POST",
                f"/rest/v1/rpc/{function_name}",
                token=self._user_token,
                json=payload,
            )
            if resp.status_code == 204:
                return {}
            try:
                return resp.json()
            except ValueError as exc:
                raise CRMRepositoryError(f"Respuesta inválida de RPC {function_name}: {exc}") from exc
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
        }
        if function_name == "registrar_mensaje_whatsapp":
            logger.info(
                "crm.rpc_payload",
                extra={"function": function_name, "payload": payload},
            )
        retries = 2
        delay_seconds = 0.5
        last_exc: httpx.RequestError | None = None
        resp: httpx.Response | None = None
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                if attempt > 0:
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_recovered",
                            "operation": f"RPC {function_name}",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                        }
                    )
                break
            except httpx.RequestError as exc:
                last_exc = exc
                if attempt < retries and _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_retry_scheduled",
                            "operation": f"RPC {function_name}",
                            "attempt": attempt + 1,
                            "next_attempt": attempt + 2,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                    await asyncio.sleep(delay_seconds)
                    continue
                if _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_failure",
                            "operation": f"RPC {function_name}",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                raise CRMRepositoryError(f"Error de red al invocar RPC {function_name}: {exc}") from exc
        if resp is None and last_exc is not None:
            raise CRMRepositoryError(f"Error de red al invocar RPC {function_name}: {last_exc}") from last_exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en RPC {function_name}: {resp.text}"
            )
        if resp.status_code == 204:
            return {}
        try:
            return resp.json()
        except ValueError as exc:
            raise CRMRepositoryError(f"Respuesta inválida de RPC {function_name}: {exc}") from exc

    async def reprocess_lead(self, *, lead_id: UUID) -> None:
        await self._rpc("reprocesar_lead", {"p_lead": str(lead_id)})

    async def refresh_analytics_leads_por_dia(self) -> None:
        await self._rpc("api_refresh_analytics_leads_por_dia", {})

    async def refresh_inbox_conversation_snapshot_mv(self) -> None:
        await self._rpc("inbox_conversation_snapshot_mv_refresh", {})

    async def refresh_prospeccion_query_daily_mv(self) -> None:
        await self._rpc("prospeccion_query_daily_mv_refresh", {})

    async def _request_with_user(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        token: str,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        organizacion_id: UUID | None = None,
    ) -> httpx.Response:
        if not settings.supabase_url or not settings.supabase_anon:
            raise CRMRepositoryError("Supabase no está configurado (anon key)")
        url = f"{settings.supabase_url.rstrip('/')}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": settings.supabase_anon,
            "Authorization": f"Bearer {token}",
        }
        if organizacion_id:
            headers["X-Organizacion-Id"] = str(organizacion_id)
        if prefer:
            headers["Prefer"] = prefer
        json_payload = _make_json_serializable(json) if json is not None else None
        retries = 2
        delay_seconds = 0.5
        last_exc: httpx.RequestError | None = None
        resp: httpx.Response | None = None
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.request(
                        method,
                        url,
                        params=params,
                        json=json_payload,
                        headers=headers,
                    )
                if attempt > 0:
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_recovered",
                            "operation": f"{method} {path} (user)",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                        }
                    )
                break
            except httpx.RequestError as exc:
                last_exc = exc
                if attempt < retries and _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_retry_scheduled",
                            "operation": f"{method} {path} (user)",
                            "attempt": attempt + 1,
                            "next_attempt": attempt + 2,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                    await asyncio.sleep(delay_seconds)
                    continue
                if _is_transient_supabase_error_message(exc):
                    _append_supabase_connectivity_event(
                        {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "event_type": "transient_failure",
                            "operation": f"{method} {path} (user)",
                            "attempt": attempt + 1,
                            "retries_configured": retries,
                            "error": str(exc),
                        }
                    )
                raise CRMRepositoryError(f"Error de red al llamar Supabase (user): {exc}") from exc
        if resp is None and last_exc is not None:
            raise CRMRepositoryError(f"Error de red al llamar Supabase (user): {last_exc}") from last_exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en {path}: {resp.text}"
            )
        return resp

    async def get_usuario_organizacion_id(
        self,
        *,
        usuario_id: UUID,
    ) -> UUID | None:
        return await self._get_usuario_organizacion_id(usuario_id=usuario_id)

    async def _get_usuario_organizacion_id(
        self,
        *,
        usuario_id: UUID,
    ) -> UUID | None:
        params = {
            "id": f"eq.{usuario_id}",
            "select": "organizacion_id",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/usuarios", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        org_value = data[0].get("organizacion_id")
        if not org_value:
            return None
        try:
            return UUID(str(org_value))
        except (TypeError, ValueError):
            return None
logger = get_logger("app.repositories.crm")
