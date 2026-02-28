"""Funciones específicas del canal WhatsApp para resolver tool calls."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.webchat import service as webchat_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import send_email, storage, tenant_runtime
from app.services.calendar import CalendarError
from app.services.catalog_embeddings import CatalogEmbeddingService
from app.logging.catalog_debug import write_catalog_debug_entry
from app.services.scoring_contract import (
    build_profile_summary_text as shared_build_profile_summary_text,
)
from app.services.scoring_contract import (
    normalize_required_fields_for_answers as shared_normalize_required_fields_for_answers,
)
from app.services.sales_notifications import (
    build_booking_template_variables as shared_build_booking_template_variables,
)
from app.services.sales_notifications import (
    build_sales_template_variables as shared_build_sales_template_variables,
)
from app.services.sales_notifications import (
    compose_sales_notification_message as shared_compose_sales_notification_message,
)
from app.services.catalog_fraccionamientos import (
    list_catalog_fraccionamientos,
    list_catalog_modelos,
)
from app.services.catalog_item_lookup import lookup_catalog_items_sql_first
from app.services.email import EmailSendError
from app.services.storage import StorageError

logger = get_logger("app.channels.whatsapp.tools")

_SCHEDULE_PREFILTER_FIELDS: tuple[str, ...] = (
    "financing_type",
    "credit_preapproved",
    "budget_range",
    "down_payment_ready",
    "purchase_timeline",
    "hard_deadline",
    "requirements_defined",
    "comparison_mode",
    "visited_properties",
    "decision_authority",
    "buyer_type",
)

_DEFAULT_REQUIRED_CASE_A_FIELDS: tuple[str, ...] = (
    "financing_type",
    "budget_range",
    "purchase_timeline",
    "decision_authority",
)

_EVASIVE_TOKENS: tuple[str, ...] = (
    "no se",
    "no sé",
    "prefiero no",
    "no quiero decir",
    "no te puedo decir",
    "luego te digo",
    "despues te digo",
    "después te digo",
)

INFORMATION_EMAIL_TEMPLATE: dict[str, Any] = {
    "intro": "Gracias por tu interés en Tal-IA. Te comparto un resumen con la información que platicamos:",
    "highlights": [
        "Automatiza la atención 24/7 en webchat, WhatsApp y voz con un solo asistente.",
        "Califica prospectos y agenda demos o recordatorios sin cargar al equipo comercial.",
        "Centraliza conversaciones, métricas y tareas en el panel de Tal-IA para dar seguimiento inteligente.",
    ],
    "resources": [
        {"label": "Sitio de Tal-IA", "url": "https://talia.mx/"},
        {"label": "Geoactiv · Casos y soluciones", "url": "https://geoactiv.ai/"},
    ],
    "closing": "Cuando quieras, puedo ayudarte a agendar una demo personalizada o resolver cualquier duda por este medio.",
    "use_summary": True,
    "use_highlights": True,
    "use_resources": True,
}


def _require(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if value is None:
        raise ValueError(f"{key} requerido")
    text = str(value).strip()
    if not text:
        raise ValueError(f"{key} requerido")
    return text


def _optional_bool_argument(arguments: dict[str, Any], key: str) -> bool | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "si", "sí"}:
        return True
    if text in {"0", "false", "no"}:
        return False
    return None


def _optional_int_argument(arguments: dict[str, Any], key: str) -> int | None:
    if key not in arguments:
        return None
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return max(0, parsed)


def _close_json_structures(text: str) -> str:
    in_string = False
    escape = False
    brace_count = 0
    bracket_count = 0
    for ch in text:
        if in_string:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
            elif ch == "\"":
                in_string = False
            continue
        if ch == "\"":
            in_string = True
        elif ch == "{":
            brace_count += 1
        elif ch == "[":
            bracket_count += 1
        elif ch == "}" and brace_count > 0:
            brace_count -= 1
        elif ch == "]" and bracket_count > 0:
            bracket_count -= 1

    repaired = text
    if in_string:
        repaired += "\""
    if bracket_count > 0:
        repaired += "]" * bracket_count
    if brace_count > 0:
        repaired += "}" * brace_count
    return repaired


def _repair_truncated_json(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    start = text.find("{")
    if start == -1:
        return None
    text = text[start:]

    # Intenta recortar un sufijo corrupto y cerrar estructuras abiertas.
    max_trim = min(300, len(text))
    for trim in range(0, max_trim + 1):
        candidate = text[: len(text) - trim] if trim else text
        candidate = candidate.rstrip()
        while candidate and candidate[-1] in {",", ":"}:
            candidate = candidate[:-1].rstrip()
        if not candidate:
            continue
        repaired = _close_json_structures(candidate)
        try:
            json.loads(repaired)
        except json.JSONDecodeError:
            continue
        return repaired if repaired != text else None
    return None


def _extract_json_scalar(raw: str, key: str) -> Any | None:
    pattern = rf'"{re.escape(key)}"\s*:\s*(true|false|null|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*")'
    match = re.search(pattern, raw, flags=re.IGNORECASE)
    if not match:
        return None
    token = match.group(1)
    if token.startswith('"'):
        try:
            return json.loads(token)
        except json.JSONDecodeError:
            return token.strip('"')
    lowered = token.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    try:
        return int(token) if "." not in token else float(token)
    except ValueError:
        return None


def _salvage_tool_arguments(tool_name: str, raw: str) -> dict[str, Any] | None:
    keys_by_tool: dict[str, tuple[str, ...]] = {
        "close_lead": (
            "conversacion_id",
            "notes",
            "necesidad_proposito",
            "siguiente_accion",
            "budget_range",
            "financing_type",
            "purchase_timeline",
            "decision_authority",
            "credit_preapproved",
            "visited_properties",
        ),
        "schedule_demo": ("conversacion_id", "slot_id", "start_at", "notes"),
        "send_information_email": (
            "conversacion_id",
            "email",
            "full_name",
            "company_name",
            "summary",
        ),
    }
    keys = keys_by_tool.get(tool_name, ())
    if not keys:
        return None
    recovered: dict[str, Any] = {}
    for key in keys:
        value = _extract_json_scalar(raw, key)
        if value is not None:
            recovered[key] = value

    required_by_tool: dict[str, tuple[str, ...]] = {
        "close_lead": ("notes", "necesidad_proposito"),
        "schedule_demo": ("slot_id", "start_at"),
        "send_information_email": ("email",),
    }
    required = required_by_tool.get(tool_name, ())
    if required and any(not _has_text(recovered.get(field)) for field in required):
        return None
    return recovered or None


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


def _has_meaningful_scoring_answers(contact: Mapping[str, Any] | None) -> bool:
    if not contact:
        return False
    contact_data = _ensure_dict(contact.get("contacto_datos"))
    scoring_data = _ensure_dict(contact_data.get("lead_scoring"))
    answers = _ensure_dict(scoring_data.get("answers"))
    if not answers:
        return False
    for value in answers.values():
        if value not in (None, "", "unknown", "refused"):
            return True
    return False


def _has_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def _is_answered_scoring_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized not in {"", "unknown", "refused"}
    return True


def _extract_scoring_answers(
    *,
    contact: Mapping[str, Any] | None,
    opportunity_metadata: Mapping[str, Any],
) -> dict[str, Any]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    answers = _ensure_dict(scoring.get("answers"))
    if answers:
        return answers
    if not contact:
        return {}
    contact_data = _ensure_dict(contact.get("contacto_datos"))
    contact_scoring = _ensure_dict(contact_data.get("lead_scoring"))
    return _ensure_dict(contact_scoring.get("answers"))


def _extract_profiling_questions(
    *,
    opportunity_metadata: Mapping[str, Any],
    channel: str = "whatsapp",
) -> dict[str, Any]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    profiling_by_channel = _ensure_dict(scoring.get("profiling_by_channel"))
    channel_payload = _ensure_dict(profiling_by_channel.get(channel))
    if not channel_payload:
        channel_payload = _ensure_dict(scoring.get("profiling"))
    return _ensure_dict(channel_payload.get("questions"))


def _is_profile_field_answered(
    *,
    field: str,
    answers: Mapping[str, Any],
    profiling_questions: Mapping[str, Any] | None = None,
) -> bool:
    if _is_answered_scoring_value(answers.get(field)):
        return True
    profiling_questions = profiling_questions or {}
    field_payload = _ensure_dict(profiling_questions.get(field))
    status_value = str(field_payload.get("estado_respuesta") or "").strip().lower()
    return status_value in {"answered", "unknown", "refused", "skipped_max_retries"}


def _has_base_fields_for_case_a(contact: Mapping[str, Any] | None) -> bool:
    if not contact:
        return False
    has_contact = _has_text(contact.get("correo")) or _has_text(
        contact.get("telefono_e164") or contact.get("telefono")
    )
    has_context = _has_text(contact.get("necesidad_proposito")) or _has_text(contact.get("notes"))
    return has_contact and has_context


def _has_base_fields_for_case_b(contact: Mapping[str, Any] | None) -> bool:
    if not contact:
        return False
    has_contact = _has_text(contact.get("correo")) or _has_text(
        contact.get("telefono_e164") or contact.get("telefono")
    )
    return has_contact


def _extract_required_case_a_fields_from_metadata(
    *,
    opportunity_metadata: Mapping[str, Any],
) -> list[str]:
    scoring = _ensure_dict(opportunity_metadata.get("lead_scoring"))
    fields_raw = scoring.get("critical_fields")
    if not isinstance(fields_raw, list):
        return []
    fields: list[str] = []
    for item in fields_raw:
        field = str(item or "").strip()
        if field and field not in fields:
            fields.append(field)
    return fields


async def _load_required_case_a_questions(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: str,
) -> tuple[list[str], dict[str, str]]:
    profiling_enabled = await tenant_runtime.is_profiling_enabled(
        organizacion_id=organizacion_id,
        channel=channel if channel in {"whatsapp", "webchat"} else "whatsapp",
    )
    if not profiling_enabled:
        logger.warning(
            "profiling.mode.off",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "component": "whatsapp.prefilter",
            },
        )
        return [], {}

    required_fields: list[str] = []
    question_by_field: dict[str, str] = {}
    try:
        question_rows = await repo.list_scoring_questions(
            organizacion_id=organizacion_id,
            canal=channel if channel in {"whatsapp", "webchat"} else "whatsapp",
            include_inactive=False,
        )
    except (CRMRepositoryError, AttributeError):
        question_rows = []
    for row in question_rows:
        field_key = str(row.get("field_key") or "").strip()
        if not field_key:
            continue
        if bool(row.get("required_for_case_a")) and field_key not in required_fields:
            required_fields.append(field_key)
        question_text = str(row.get("question_text") or "").strip()
        if question_text:
            question_by_field[field_key] = question_text
    if not required_fields:
        logger.warning(
            "whatsapp.prefilter.required_fields_fallback_default",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "default_required_fields": list(_DEFAULT_REQUIRED_CASE_A_FIELDS),
            },
        )
        required_fields = list(_DEFAULT_REQUIRED_CASE_A_FIELDS)
    return required_fields, question_by_field


async def _has_minimum_profile_for_case_a(
    *,
    contact: Mapping[str, Any] | None,
    opportunity_metadata: Mapping[str, Any],
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: str,
) -> bool:
    if not await tenant_runtime.is_profiling_enabled(
        organizacion_id=organizacion_id,
        channel=channel if channel in {"whatsapp", "webchat"} else "whatsapp",
    ):
        return True

    answers = _extract_scoring_answers(contact=contact, opportunity_metadata=opportunity_metadata)
    profiling_questions = _extract_profiling_questions(opportunity_metadata=opportunity_metadata)
    required_fields = _extract_required_case_a_fields_from_metadata(
        opportunity_metadata=opportunity_metadata
    )
    if not required_fields:
        required_fields, _ = await _load_required_case_a_questions(
            repo=repo,
            organizacion_id=organizacion_id,
            channel=channel,
        )
    return all(
        _is_profile_field_answered(
            field=field,
            answers=answers,
            profiling_questions=profiling_questions,
        )
        for field in required_fields
    )


def _is_whatsapp_reengage_exhausted(
    *,
    opportunity_metadata: Mapping[str, Any],
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
) -> bool:
    followup_meta = _ensure_dict(opportunity_metadata.get("whatsapp_followup"))
    reengage_meta = _ensure_dict(followup_meta.get("reengage"))
    try:
        attempts = max(0, int(reengage_meta.get("attempts") or 0))
    except (TypeError, ValueError):
        attempts = 0
    return attempts >= max(1, int(whatsapp_settings.reengage_max_attempts))


def _is_webchat_reengage_exhausted(contact: Mapping[str, Any] | None) -> bool:
    if not contact:
        return False
    contact_data = _ensure_dict(contact.get("contacto_datos"))
    webchat_followup = _ensure_dict(contact_data.get("webchat_followup"))
    state = _ensure_dict(webchat_followup.get("state"))
    reengage = _ensure_dict(state.get("reengage"))
    try:
        attempts = max(0, int(reengage.get("attempts") or 0))
    except (TypeError, ValueError):
        attempts = 0
    return attempts >= max(1, int(settings.webchat_reengage_max_attempts))


def _get_primary_notification_by_channel(
    metadata: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    value = _ensure_dict(metadata.get("sales_primary_notifications"))
    out: dict[str, dict[str, Any]] = {}
    for channel, payload in value.items():
        out[str(channel)] = _ensure_dict(payload)
    return out


def _extract_user_prefilter_signals(messages: list[dict[str, Any]]) -> dict[str, bool]:
    inbound_texts: list[str] = []
    for row in messages:
        direction = str(row.get("direccion") or "").strip().lower()
        if direction != "entrante":
            continue
        text = str(row.get("texto") or "").strip().lower()
        if text:
            inbound_texts.append(text)

    # Evaluamos una ventana corta de mensajes recientes para capturar respuestas
    # fragmentadas (ej. primero "crédito mancomunado" y luego "1.3 millones en 6 meses")
    # sin arrastrar inferencias lejanas.
    joined = " ".join(inbound_texts[-3:]) if inbound_texts else ""
    has_budget = bool(
        re.search(r"\$\s*\d", joined)
        or re.search(r"\b\d+(\.\d+)?\s*(k|mil|miles|millon|millones)\b", joined)
        or re.search(r"\b(presupuesto|presup|hasta|maximo|máximo)\b", joined)
    )
    has_financing = bool(
        re.search(
            r"\b(contado|credito|crédito|hipotecario|hipoteca|infonavit|fovissste|ambas)\b",
            joined,
        )
    )
    has_timeline = bool(
        re.search(
            r"\b(inmediat|urgent|pronto|este mes|proximo mes|pr[oó]xim[oa] mes|semanas?|mes(es)?|a[ñn]o|explorando|explorar|a futuro|futuro)\b",
            joined,
        )
    )
    has_authority = bool(
        re.search(
            r"\b(yo decido|decido yo|solo yo|yo solo|con mi esposa|con mi esposo|con mi pareja|con mi familia|con mi socio|mi esposa y yo|mi esposo y yo|entre mi esposa y yo|entre mi esposo y yo|lo consulto)\b",
            joined,
        )
    )
    has_credit_status = bool(
        re.search(
            r"\b(en tramite|en trámite|tramitando|proceso|preaprobado|aprobado|sin credito|sin crédito|no tengo credito|no tengo crédito)\b",
            joined,
        )
    )
    has_visited = bool(
        re.search(
            r"\b(ya vi|ya visite|ya visité|ya fui|ya conoci|ya conoc[ií]|ya vimos|hemos visto|visitamos|visitado)\b",
            joined,
        )
        or re.search(r"\b(no he visitado|aun no|aún no|todavia no|todavía no)\b", joined)
    )
    has_evasive = any(token in joined for token in _EVASIVE_TOKENS)
    return {
        "financing_type": has_financing,
        "budget_range": has_budget,
        "purchase_timeline": has_timeline,
        "decision_authority": has_authority,
        "credit_preapproved": has_credit_status,
        "visited_properties": has_visited,
        "evasive": has_evasive,
    }


def _sanitize_scoring_answers_from_user_messages(
    *,
    scoring_answers: dict[str, Any],
    user_signals: Mapping[str, bool],
) -> dict[str, Any]:
    sanitized = dict(scoring_answers)
    for field, value in list(sanitized.items()):
        if field == "evasive" or field not in user_signals:
            continue
        if value is None:
            sanitized.pop(field, None)
            continue
        if isinstance(value, str) and not value.strip():
            sanitized.pop(field, None)
    return sanitized


def _sanitize_profiling_statuses_from_user_messages(
    *,
    profiling_statuses: dict[str, Any] | None,
    user_signals: Mapping[str, bool],
) -> dict[str, Any]:
    if not isinstance(profiling_statuses, dict):
        return {}
    sanitized: dict[str, Any] = {}
    for field, raw_value in profiling_statuses.items():
        key = str(field or "").strip()
        if not key:
            continue
        status = str(raw_value or "").strip().lower()
        if status:
            sanitized[key] = status
    return sanitized


def _infer_prefilter_answers_from_messages(
    messages: list[dict[str, Any]],
    *,
    missing_fields: list[str],
) -> dict[str, Any]:
    inbound_texts: list[str] = []
    for row in messages:
        direction = str(row.get("direccion") or "").strip().lower()
        if direction != "entrante":
            continue
        text = str(row.get("texto") or "").strip().lower()
        if text:
            inbound_texts.append(text)
    if not inbound_texts:
        return {}
    joined = " ".join(inbound_texts[-6:])
    inferred: dict[str, Any] = {}
    missing = {str(field).strip() for field in missing_fields if str(field).strip()}

    if "financing_type" in missing:
        if any(token in joined for token in ("contado", "efectivo")):
            inferred["financing_type"] = "contado"
        elif any(
            token in joined
            for token in ("cofinavit", "infonavit", "fovissste", "hipoteca", "credito", "crédito")
        ):
            inferred["financing_type"] = "credito"
        elif any(token in joined for token in ("mixto", "ambos", "combinado")):
            inferred["financing_type"] = "mixto"

    if "budget_range" in missing:
        if re.search(r"\b\d+(\.\d+)?\s*(k|mil|miles|millon|millones)\b", joined):
            inferred["budget_range"] = "captured"

    if "purchase_timeline" in missing:
        if re.search(r"\b(inmediat|ya|pronto|cuanto antes|lo mas pronto|lo más pronto)\b", joined):
            inferred["purchase_timeline"] = "immediate"
        elif re.search(r"\b(1|2|3)\s*mes", joined):
            inferred["purchase_timeline"] = "short_term"
        elif re.search(r"\b(4|5|6)\s*mes", joined):
            inferred["purchase_timeline"] = "medium_term"
        elif re.search(r"\b(7|8|9|10|11|12)\s*mes|a[nñ]o", joined):
            inferred["purchase_timeline"] = "long_term"

    if "decision_authority" in missing:
        if re.search(r"\b(yo decido|solo yo|yo solo|por mi cuenta)\b", joined):
            inferred["decision_authority"] = "self"
        elif re.search(r"\b(mi esposa y yo|mi esposo y yo|con mi pareja|con mi familia|entre los dos)\b", joined):
            inferred["decision_authority"] = "shared"

    if "credit_preapproved" in missing:
        if re.search(r"\b(en tramite|en trámite|tramitando|proceso)\b", joined):
            inferred["credit_preapproved"] = "in_process"
        elif re.search(r"\b(preaprobado|aprobado)\b", joined):
            inferred["credit_preapproved"] = "preapproved"
        elif re.search(r"\b(no tengo|sin credito|sin crédito)\b", joined):
            inferred["credit_preapproved"] = "none"

    if "visited_properties" in missing:
        if re.search(
            r"\b(ya vi|ya visite|ya visité|ya fui|ya conoci|ya conoc[ií]|ya vimos|hemos visto|visitamos|visitado)\b",
            joined,
        ):
            inferred["visited_properties"] = "yes"
        elif re.search(r"\b(no he visitado|aun no|aún no|todavia no|todavía no)\b", joined):
            inferred["visited_properties"] = "no"
        else:
            last_user_text = inbound_texts[-1].strip()
            yes_like = bool(
                re.search(
                    r"\b(si|sí|correcto|afirmativo)\b",
                    last_user_text,
                )
            )
            no_like = bool(
                re.search(
                    r"\b(no|aun no|aún no|todavia no|todavía no|no he)\b",
                    last_user_text,
                )
            )
            # Si el último mensaje es una respuesta corta y recientemente
            # se preguntó por visitas previas, infiere yes/no.
            assistant_text = " ".join(
                str(row.get("texto") or "").strip().lower()
                for row in messages[-8:]
                if str(row.get("direccion") or "").strip().lower() == "saliente"
            )
            if "visitado" in assistant_text or "propiedades similares" in assistant_text:
                if no_like:
                    inferred["visited_properties"] = "no"
                elif yes_like or "ya" in last_user_text:
                    inferred["visited_properties"] = "yes"

    # `captured` permite desbloquear cuando el usuario sí dio rango,
    # pero el modelo no envió el valor textual.
    if inferred.get("budget_range") == "captured":
        for text in reversed(inbound_texts):
            if re.search(r"\b\d+(\.\d+)?\s*(k|mil|miles|millon|millones)\b", text):
                inferred["budget_range"] = text[:120]
                break
        if inferred.get("budget_range") == "captured":
            inferred.pop("budget_range", None)

    return inferred


def _sanitize_profiling_reprompt_counts(
    *,
    profiling_counts: dict[str, Any] | None,
    profiling_statuses: Mapping[str, Any],
) -> dict[str, Any]:
    if not isinstance(profiling_counts, dict):
        return {}
    sanitized: dict[str, Any] = {}
    for field, raw_value in profiling_counts.items():
        key = str(field or "").strip()
        if not key or key not in profiling_statuses:
            continue
        try:
            sanitized[key] = max(0, int(raw_value))
        except (TypeError, ValueError):
            continue
    return sanitized


async def _has_prefilter_for_schedule(
    *,
    contact: Mapping[str, Any] | None,
    opportunity_id: str | None,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    channel = str((contact or {}).get("canal") or "whatsapp").strip().lower() or "whatsapp"
    repo = CRMRepository()
    required_fields: list[str] = list(_DEFAULT_REQUIRED_CASE_A_FIELDS)
    question_by_field: dict[str, str] = {}
    if not contact or not opportunity_id:
        return {"ready": False, "missing_fields": required_fields, "questions": question_by_field}
    notes = str(contact.get("notes") or "").strip()
    need = str(contact.get("necesidad_proposito") or "").strip()
    if not (notes and need):
        return {"ready": False, "missing_fields": required_fields, "questions": question_by_field}
    org_value = webchat_service._extract_contact_org(contact)
    org_uuid = webchat_service._resolve_org_uuid(org_value)
    if not org_uuid:
        return {"ready": False, "missing_fields": required_fields, "questions": question_by_field}
    if not await tenant_runtime.is_profiling_enabled(
        organizacion_id=UUID(org_uuid),
        channel=channel if channel in {"whatsapp", "webchat"} else "whatsapp",
    ):
        return {"ready": True, "missing_fields": [], "questions": {}}
    required_fields, question_by_field = await _load_required_case_a_questions(
        repo=repo,
        organizacion_id=UUID(org_uuid),
        channel=channel,
    )
    try:
        opp_uuid = UUID(str(opportunity_id))
    except (TypeError, ValueError):
        return {"ready": False, "missing_fields": required_fields, "questions": question_by_field}
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=UUID(org_uuid),
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError:
        return {"ready": False, "missing_fields": required_fields, "questions": question_by_field}
    metadata = _ensure_dict((opportunity or {}).get("metadata"))
    required_from_metadata = _extract_required_case_a_fields_from_metadata(
        opportunity_metadata=metadata
    )
    if required_from_metadata:
        required_fields = required_from_metadata
    scoring = _ensure_dict(metadata.get("lead_scoring"))
    answers = _ensure_dict(scoring.get("answers"))
    required_fields = shared_normalize_required_fields_for_answers(required_fields, answers)
    profiling_questions = _extract_profiling_questions(opportunity_metadata=metadata)

    def _is_completed(field: str, value: Any) -> bool:
        if value is None:
            return _is_profile_field_answered(
                field=field,
                answers=answers,
                profiling_questions=profiling_questions,
            )
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"", "unknown"}:
                return _is_profile_field_answered(
                    field=field,
                    answers=answers,
                    profiling_questions=profiling_questions,
                )
            return True
        return True

    completed_fields = {
        field
        for field in required_fields
        if _is_completed(field, answers.get(field))
    }
    if len(completed_fields) == len(required_fields):
        return {"ready": True, "missing_fields": [], "questions": {}}

    missing_fields = [
        field for field in required_fields if field not in completed_fields
    ]

    return {
        "ready": False,
        "missing_fields": missing_fields,
        "questions": question_by_field,
    }


def _build_schedule_prefilter_error_message(
    *,
    missing_fields: list[str],
    question_by_field: Mapping[str, str] | None = None,
) -> str:
    missing = [str(field).strip() for field in missing_fields if str(field).strip()]
    if not missing:
        return (
            "Antes de agendar la cita necesito completar una precalificación breve "
            "(necesidad principal y preguntas clave)."
        )
    field = missing[0]
    question_by_field = question_by_field or {}
    question_text = str(question_by_field.get(field) or "").strip()
    if not question_text:
        question_text = (
            f"Pregunta por el campo faltante '{field}' con una sola pregunta corta."
        )
    return (
        "Antes de agendar la cita falta completar la precalificación. "
        f"Campo faltante: {field}. "
        f"Haz una sola pregunta exacta al prospecto: {question_text} "
        "Cuando responda, vuelve a ejecutar schedule_demo con el mismo horario solicitado."
    )


def _is_prospeccion_opportunity(opportunity: dict[str, Any] | None) -> bool:
    if not isinstance(opportunity, dict):
        return False
    metadata = opportunity.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    if metadata.get("prospecto_id"):
        return True
    if metadata.get("prospeccion_canal"):
        return True
    source = str(metadata.get("source") or "").strip().lower()
    return "prospe" in source


def _missing_basic_contact_fields(contact: dict[str, Any] | None) -> list[str]:
    required_order: tuple[tuple[str, str], ...] = (
        ("full_name", "nombre_completo"),
        ("email", "correo"),
        ("company_name", "company_name"),
    )
    if not isinstance(contact, dict):
        return [field for field, _ in required_order]
    missing: list[str] = []
    for field, contact_key in required_order:
        if not str(contact.get(contact_key) or "").strip():
            missing.append(field)
    return missing


def _build_contact_required_guidance(missing_fields: list[str]) -> str:
    if not missing_fields:
        return (
            "Antes de agendar la demo falta un dato del contacto. "
            "Haz una sola pregunta corta y vuelve a ejecutar schedule_demo."
        )
    first = missing_fields[0]
    question_map = {
        "full_name": "¿Me compartes tu nombre completo para la invitación?",
        "email": "¿A qué correo te envío la invitación de la demo?",
        "company_name": "¿Cuál es el nombre de tu empresa?",
    }
    question_text = question_map.get(first, "¿Me compartes ese dato para continuar?")
    return (
        "Antes de agendar la demo en prospección faltan datos básicos del contacto. "
        f"Campo faltante: {first}. "
        f"Haz una sola pregunta exacta al prospecto: {question_text} "
        "Cuando responda, guarda el dato y vuelve a ejecutar schedule_demo con el mismo horario solicitado."
    )


async def _refresh_opportunity_context_from_contact(
    context: ToolRuntimeContext,
    *,
    reason: str,
    ensure_capture: bool = False,
) -> None:
    if ensure_capture:
        try:
            await storage.capture_opportunity_if_ready(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.contact_context.capture_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "reason": reason,
                    "error": str(exc),
                },
            )

    try:
        opportunity_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.contact_context.ensure_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "reason": reason,
                "error": str(exc),
            },
        )
        return

    contact = await _resolve_contact(context.contact_id)
    if not isinstance(contact, dict):
        return

    full_name = str(contact.get("nombre_completo") or "").strip()
    company_name = str(contact.get("company_name") or "").strip()
    notes = str(contact.get("notes") or "").strip()
    need = str(contact.get("necesidad_proposito") or "").strip()
    summary = notes or need
    intent = need or None

    if summary or intent:
        try:
            await storage.upsert_conversation_insights(
                conversation_id=context.conversation_id,
                resumen=summary or None,
                intencion=intent or None,
                siguiente_accion="continuar_conversacion",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.contact_context.insights_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "reason": reason,
                    "error": str(exc),
                },
            )

    try:
        await storage.maybe_auto_name_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            opportunity_id=str(opportunity_id),
            intent=intent,
            summary=summary or None,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.contact_context.auto_name_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "reason": reason,
                "error": str(exc),
            },
        )

    org_uuid_text = webchat_service._resolve_org_uuid(webchat_service._extract_contact_org(contact))
    if not org_uuid_text:
        return
    try:
        repo = CRMRepository()
        opportunity_row = await repo.get_pipeline_opportunity(
            organizacion_id=UUID(org_uuid_text),
            oportunidad_id=UUID(str(opportunity_id)),
        )
    except (CRMRepositoryError, ValueError) as exc:
        logger.warning(
            "whatsapp.contact_context.fetch_opportunity_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "reason": reason,
                "error": str(exc),
            },
        )
        return
    if not isinstance(opportunity_row, dict):
        return

    current_title = str(opportunity_row.get("titulo") or "").strip()
    current_description = str(opportunity_row.get("descripcion") or "").strip()
    label = company_name or full_name
    looks_generic = (
        not current_title
        or current_title.lower().startswith("conversación ")
        or current_title.lower().startswith("conversacion ")
        or (full_name and current_title.casefold() == full_name.casefold())
    )
    if not label and not summary:
        return
    patch_opp: dict[str, Any] = {}
    if looks_generic and label:
        patch_opp["titulo"] = f"Lead WhatsApp - {label}"[:120]
    if not current_description and summary:
        patch_opp["descripcion"] = summary[:1000]
    if not patch_opp:
        return
    try:
        await repo.update_opportunity(
            organizacion_id=UUID(org_uuid_text),
            oportunidad_id=UUID(str(opportunity_id)),
            payload=patch_opp,
        )
    except (CRMRepositoryError, ValueError) as exc:
        logger.warning(
            "whatsapp.contact_context.opportunity_patch_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "reason": reason,
                "error": str(exc),
            },
        )


async def _resolve_org_for_catalog(
    context: ToolRuntimeContext,
    arguments: dict[str, Any],
) -> UUID:
    """Resuelve organizacion_id de forma segura para tools de catálogo."""
    contact = await _resolve_contact(context.contact_id)
    if contact:
        org_value = webchat_service._extract_contact_org(contact)
        resolved = webchat_service._resolve_org_uuid(org_value)
        if resolved:
            return UUID(resolved)

    org_value = arguments.get("organizacion_id")
    if not org_value:
        raise ValueError("organizacion_id requerido para catálogo")
    resolved = webchat_service._resolve_org_uuid(str(org_value))
    if not resolved:
        raise ValueError("organizacion_id inválido")
    return UUID(resolved)


async def execute_tool(
    name: str | None, arguments: Any, context: ToolRuntimeContext
) -> dict[str, Any]:
    if not name:
        raise ValueError("Nombre de función ausente")

    if isinstance(arguments, str):
        raw_arguments = arguments
        try:
            arguments = json.loads(arguments)
        except json.JSONDecodeError as exc:  # type: ignore[name-defined]
            repaired = _repair_truncated_json(raw_arguments)
            if repaired is not None:
                try:
                    arguments = json.loads(repaired)
                except json.JSONDecodeError:
                    raise ValueError(f"Arguments inválidos: {raw_arguments!r}") from exc
                logger.warning(
                    "whatsapp.tool_arguments_repaired",
                    extra={
                        "tool": name,
                        "raw_preview": raw_arguments[:400],
                    },
                )
            else:
                salvaged = _salvage_tool_arguments(name.strip(), raw_arguments)
                if salvaged is None:
                    raise ValueError(f"Arguments inválidos: {raw_arguments!r}") from exc
                arguments = salvaged
                logger.warning(
                    "whatsapp.tool_arguments_salvaged",
                    extra={
                        "tool": name,
                        "keys": sorted(salvaged.keys()),
                        "raw_preview": raw_arguments[:400],
                    },
                )
    elif not isinstance(arguments, dict):
        raise ValueError(f"Tipo de argumentos no soportado: {type(arguments)!r}")

    func = name.strip()
    if func == "set_full_name":
        full_name = _require(arguments, "full_name")
        await storage.update_contact(context.contact_id, {"nombre_completo": full_name})
        await _refresh_opportunity_context_from_contact(
            context,
            reason="set_full_name",
            ensure_capture=True,
        )
        return {"status": "ok", "full_name": full_name}

    if func == "set_email":
        email = _require(arguments, "email").lower()
        await storage.update_contact(context.contact_id, {"correo": email})
        await _refresh_opportunity_context_from_contact(
            context,
            reason="set_email",
            ensure_capture=True,
        )
        return {"status": "ok", "email": email}

    if func == "set_phone_number":
        phone = _require(arguments, "phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone})
        await _refresh_opportunity_context_from_contact(
            context,
            reason="set_phone_number",
            ensure_capture=True,
        )
        return {"status": "ok", "phone_number": phone}

    if func == "set_company_name":
        company = _require(arguments, "company_name")
        await storage.update_contact(context.contact_id, {"company_name": company})
        await _refresh_opportunity_context_from_contact(
            context,
            reason="set_company_name",
            ensure_capture=True,
        )
        return {"status": "ok", "company_name": company}

    if func == "set_prospect_context":
        contact = await _resolve_contact(context.contact_id)
        giro = str(arguments.get("giro") or "").strip()
        necesidad = str(arguments.get("necesidad_principal") or "").strip()
        volumen = str(arguments.get("volumen_mensajes_aprox") or "").strip()
        herramienta = str(arguments.get("herramienta_actual") or "").strip()
        notes_parts: list[str] = []
        if giro:
            notes_parts.append(f"Giro: {giro}")
        if volumen:
            notes_parts.append(f"Volumen: {volumen}")
        if herramienta:
            notes_parts.append(f"Herramienta actual: {herramienta}")
        updates: dict[str, Any] = {}
        if notes_parts:
            current_notes = str((contact or {}).get("notes") or "").strip()
            merged_notes = " | ".join([part for part in [current_notes, "; ".join(notes_parts)] if part])
            updates["notes"] = merged_notes
        if necesidad:
            updates["necesidad_proposito"] = necesidad
        if updates:
            await storage.update_contact(context.contact_id, updates)
            await _refresh_opportunity_context_from_contact(
                context,
                reason="set_prospect_context",
                ensure_capture=True,
            )
        return {
            "status": "ok",
            "saved": {
                "giro": giro or None,
                "necesidad_principal": necesidad or None,
                "volumen_mensajes_aprox": volumen or None,
                "herramienta_actual": herramienta or None,
            },
        }

    if func == "send_information_email":
        return await _handle_information_email(arguments, context)

    if func == "close_lead":
        return await _handle_close_lead(arguments, context)

    if func == "restart_conversation_cycle":
        return await _handle_restart_cycle(arguments, context)

    if func == "list_demo_slots":
        return await _handle_list_demo_slots(arguments, context)

    if func == "schedule_demo":
        return await _handle_schedule_demo(arguments, context)

    if func == "reschedule_demo":
        return await _handle_reschedule_demo(arguments, context)

    if func == "cancel_demo":
        return await _handle_cancel_demo(arguments, context)

    if func == "create_followup_task":
        contact = await _resolve_contact(context.contact_id)
        org_value = webchat_service._extract_contact_org(contact)
        org_uuid_text = webchat_service._resolve_org_uuid(org_value)
        if not org_uuid_text:
            raise ValueError("No pude resolver la organización para crear la tarea")
        org_uuid = UUID(org_uuid_text)
        repo = CRMRepository()
        title = str(arguments.get("title") or "").strip() or "Seguimiento comercial"
        details = str(arguments.get("details") or "").strip() or None
        priority_raw = str(arguments.get("priority") or "").strip().lower()
        priority_map = {"alta": "alta", "high": "alta", "media": "media", "medium": "media", "baja": "baja", "low": "baja"}
        priority = priority_map.get(priority_raw, "media")
        due_at = arguments.get("due_at")
        payload: dict[str, Any] = {
            "tipo": "tarea",
            "canal": "whatsapp",
            "asunto": title,
            "descripcion": details,
            "estado": "pendiente",
            "prioridad": priority,
            "contacto_id": context.contact_id,
            "metadata": {
                "source": "prospeccion_whatsapp",
                "conversation_id": context.conversation_id,
            },
        }
        if isinstance(due_at, str) and due_at.strip():
            payload["fecha_vencimiento"] = due_at.strip()
        actividad = await repo.create_activity(
            organizacion_id=org_uuid,
            payload=payload,
        )
        return {"status": "ok", "task_id": actividad.get("id")}

    if func == "list_catalog_fraccionamientos":
        org_uuid = await _resolve_org_for_catalog(context, arguments)

        include_inactive_raw = arguments.get("include_inactive")
        if isinstance(include_inactive_raw, str):
            include_inactive = include_inactive_raw.strip().lower() in {
                "1",
                "true",
                "sí",
                "si",
                "yes",
            }
        else:
            include_inactive = bool(include_inactive_raw)

        prototipos_limit_raw = arguments.get("prototipos_limit")
        try:
            prototipos_limit = int(prototipos_limit_raw)
        except (TypeError, ValueError):
            prototipos_limit = 6
        prototipos_limit = max(1, min(20, prototipos_limit))

        repo = CRMRepository()
        try:
            rows = await list_catalog_fraccionamientos(
                repo,
                organizacion_id=org_uuid,
                include_inactive=include_inactive,
                prototipos_limit=prototipos_limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        write_catalog_debug_entry(
            {
                "source": "whatsapp.list_catalog_fraccionamientos",
                "conversation_id": conversation_id_value,
                "organizacion_id": str(org_uuid),
                "include_inactive": include_inactive,
                "prototipos_limit": prototipos_limit,
                "row_count": len(rows),
                "fraccionamientos": [
                    {
                        "nombre": row.get("nombre"),
                        "segmento": row.get("segmento"),
                        "linea": row.get("linea"),
                        "prototipos": row.get("prototipos"),
                    }
                    for row in rows
                ],
            }
        )
        return {"status": "ok", "fraccionamientos": rows}

    if func == "list_catalog_modelos":
        org_uuid = await _resolve_org_for_catalog(context, arguments)
        include_inactive_raw = arguments.get("include_inactive")
        if isinstance(include_inactive_raw, str):
            include_inactive = include_inactive_raw.strip().lower() in {
                "1",
                "true",
                "sí",
                "si",
                "yes",
            }
        else:
            include_inactive = bool(include_inactive_raw)
        limit_raw = arguments.get("limit")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 2000
        limit = max(500, min(5000, limit))
        repo = CRMRepository()
        try:
            result = await list_catalog_modelos(
                repo,
                organizacion_id=org_uuid,
                include_inactive=include_inactive,
                limit=limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        write_catalog_debug_entry(
            {
                "source": "whatsapp.list_catalog_modelos",
                "conversation_id": conversation_id_value,
                "organizacion_id": str(org_uuid),
                "include_inactive": include_inactive,
                "limit": limit,
                "familias_total": result.get("familias_total"),
                "modelos_total": result.get("modelos_total"),
                "lineas": [
                    {"nombre": linea.get("nombre"), "familias": len(linea.get("familias") or [])}
                    for linea in result.get("lineas", [])
                ],
            }
        )
        return {"status": "ok", **result}

    if func == "fetch_catalog_item_details":
        org_uuid = await _resolve_org_for_catalog(context, arguments)

        query = str(arguments.get("query") or "").strip()
        if not query:
            raise ValueError("query requerido para fetch_catalog_item_details")
        detail_level = str(arguments.get("detail_level") or "metadata").strip()
        if detail_level not in {"metadata", "overview"}:
            raise ValueError("detail_level inválido")
        limit_raw = arguments.get("limit")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 1
        limit = max(1, min(5, limit))

        repo = CRMRepository()
        conversation_id_value = (
            str(context.conversation_id) if context and context.conversation_id else None
        )
        log_base = {
            "source": "whatsapp.fetch_catalog_item_details",
            "conversation_id": conversation_id_value,
            "organizacion_id": str(org_uuid),
            "query": query,
            "detail_level": detail_level,
            "limit": limit,
        }
        try:
            sql_items = await lookup_catalog_items_sql_first(
                repo,
                organizacion_id=org_uuid,
                query=query,
                limit=limit,
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "catalog.item_details_sql_lookup_failed",
                extra={"organizacion_id": str(org_uuid), "error": str(exc)},
            )
            sql_items = []
        if sql_items:
            matches_log: list[dict[str, Any]] = []
            items: list[dict[str, Any]] = []
            for item_data in sql_items[:limit]:
                metadata_value = item_data.get("metadata") or item_data.get("metadatos")
                normalized_metadata = webchat_service._normalize_metadata_value(metadata_value)
                metadata: dict[str, Any] | Mapping[str, Any]
                metadata = normalized_metadata or (
                    metadata_value if isinstance(metadata_value, Mapping) else {}
                )
                if isinstance(metadata, Mapping):
                    metadata = {str(key): val for key, val in metadata.items()}
                metadata_keys = list(metadata.keys()) if isinstance(metadata, Mapping) else []
                matches_log.append(
                    {
                        "slug": item_data.get("slug"),
                        "similarity": None,
                        "metadata_keys": metadata_keys,
                        "metadata": metadata,
                        "fallback_used": True,
                        "strategy": "sql_direct",
                    }
                )
                items.append(
                    {
                        "nombre": item_data.get("nombre"),
                        "slug": item_data.get("slug"),
                        "tipo": item_data.get("tipo"),
                        "unidad": item_data.get("unidad"),
                        "precio_base": item_data.get("precio_base"),
                        "moneda": item_data.get("moneda"),
                        "activo": item_data.get("activo"),
                        "metadata": metadata,
                        "similarity": None,
                    }
                )
            write_catalog_debug_entry(
                {
                    **log_base,
                    "match_count": len(items),
                    "items_returned": len(items),
                    "matches": matches_log,
                    "strategy": "sql_first",
                    "vector_used": False,
                }
            )
            return {
                "status": "ok",
                "items": items,
                "detail_level": detail_level,
                "source": "catalog_sql_direct",
            }

        service = CatalogEmbeddingService(repo)
        try:
            matches = await service.query_documents(
                org_uuid,
                query=query,
                limit=limit,
                reason="fetch_catalog_item_details_fallback",
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        matches_log: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        for match in matches:
            slug = match.metadata.get("slug")
            item_data: dict[str, Any] | None = None
            if isinstance(slug, str) and slug.strip():
                try:
                    item_data = await repo.get_catalog_item_by_slug(
                        organizacion_id=org_uuid,
                        slug=slug.strip(),
                    )
                except CRMRepositoryError as exc:
                    logger.warning(
                        "catalog.item_lookup_failed",
                        extra={
                            "organizacion_id": str(org_uuid),
                            "slug": slug,
                            "error": str(exc),
                        },
                    )
            metadata_value = (
                item_data.get("metadata")
                if item_data and item_data.get("metadata")
                else item_data.get("metadatos")
                if item_data
                else None
            )
            content_metadata = webchat_service._extract_metadata_from_content(match.contenido)
            normalized_metadata = webchat_service._normalize_metadata_value(metadata_value)
            normalized_match = webchat_service._normalize_metadata_value(match.metadata)
            merged_metadata: dict[str, Any] = {}
            if normalized_match:
                merged_metadata.update(normalized_match)
            if normalized_metadata:
                merged_metadata.update(normalized_metadata)
            if content_metadata:
                merged_metadata.update(content_metadata)
            metadata: dict[str, Any] | None
            if merged_metadata:
                metadata = merged_metadata
            else:
                metadata = (
                    metadata_value
                    if isinstance(metadata_value, Mapping)
                    else match.metadata
                )
            if isinstance(metadata, Mapping):
                metadata = {str(key): val for key, val in metadata.items()}
            metadata_keys = list(metadata.keys()) if isinstance(metadata, Mapping) else []
            matches_log.append(
                {
                    "slug": slug,
                    "similarity": match.similarity,
                    "metadata_keys": metadata_keys,
                    "metadata": metadata,
                    "fallback_used": item_data is not None,
                }
            )
            items.append(
                {
                    "nombre": item_data.get("nombre") if item_data else match.metadata.get("nombre"),
                    "slug": item_data.get("slug") if item_data else match.metadata.get("slug"),
                    "tipo": item_data.get("tipo") if item_data else match.metadata.get("tipo"),
                    "unidad": item_data.get("unidad") if item_data else None,
                    "precio_base": item_data.get("precio_base") if item_data else None,
                    "moneda": item_data.get("moneda") if item_data else match.metadata.get("moneda"),
                    "activo": item_data.get("activo") if item_data else match.metadata.get("activo"),
                    "metadata": metadata,
                    "similarity": match.similarity,
                }
            )
        write_catalog_debug_entry(
            {
                **log_base,
                "match_count": len(matches),
                "items_returned": len(items),
                "matches": matches_log,
            }
        )
        return {
            "status": "ok",
            "items": items,
            "detail_level": detail_level,
            "source": "vector_store_supabase",
        }

    raise ValueError(f"La función '{func}' no está disponible en WhatsApp")


def _clone_template() -> dict[str, Any]:
    template = INFORMATION_EMAIL_TEMPLATE
    return {
        "intro": template["intro"],
        "highlights": list(template["highlights"]),
        "resources": [dict(resource) for resource in template["resources"]],
        "closing": template["closing"],
        "use_summary": template.get("use_summary", True),
        "use_highlights": template.get("use_highlights", True),
        "use_resources": template.get("use_resources", True),
    }


async def _handle_information_email(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    email_value = _require(arguments, "email")
    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    highlights: list[str] = []
    for item in arguments.get("highlights", []) or []:
        if isinstance(item, str) and item.strip():
            highlights.append(item.strip())

    resources: list[dict[str, str]] = []
    for item in arguments.get("resources", []) or []:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            url = str(item.get("url") or "").strip()
            if label and url:
                resources.append({"label": label, "url": url})

    contact = await _resolve_contact(context.contact_id)
    contact_notes = None
    contact_need = None
    if contact:
        contact_name = str(contact.get("nombre_completo") or "").strip() or None
        contact_company = str(contact.get("company_name") or "").strip() or None
        contact_email = str(contact.get("correo") or "").strip() or None
        contact_notes = str(contact.get("notes") or "").strip() or None
        contact_need = str(contact.get("necesidad_proposito") or "").strip() or None
        if not full_name:
            full_name = contact_name
        if not company_name:
            company_name = contact_company
        if not summary:
            summary = contact_need or contact_notes
        if contact_email and contact_email.lower() != email_value.lower():
            try:
                await storage.update_contact(
                    contact.get("id") or context.contact_id, {"correo": email_value.lower()}
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.info_email.sync_failed",
                    extra={
                        "contact_id": contact.get("id") or context.contact_id,
                        "error": str(exc),
                },
            )

    mail_org_uuid = _contact_org_uuid(contact)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)
    brevo_settings = await tenant_runtime.get_brevo_runtime_settings(organizacion_id=mail_org_uuid)

    template = _clone_template()
    include_summary = bool(template.get("use_summary", True))
    include_highlights = bool(template.get("use_highlights", True))
    include_resources = bool(template.get("use_resources", True))

    if not include_highlights:
        highlights = []
    elif not highlights:
        highlights = list(template["highlights"])

    if not include_resources:
        resources = []
    elif not resources:
        resources = [dict(resource) for resource in template["resources"]]

    subject_target = company_name or full_name
    subject = (
        f"Tal-IA · Información para {subject_target}"
        if subject_target
        else "Tal-IA · Información solicitada"
    )

    body_lines = [f"Hola {full_name}," if full_name else "Hola,", "", template["intro"]]
    if include_summary and summary:
        body_lines.extend(["", summary])
    if include_highlights and highlights:
        body_lines.append("")
        body_lines.append("Puntos clave para tu equipo:")
        for item in highlights:
            body_lines.append(f"- {item}")
    if include_resources and resources:
        body_lines.append("")
        body_lines.append("Recursos para profundizar:")
        for resource in resources:
            body_lines.append(f"- {resource['label']}: {resource['url']}")
    body_lines.extend(["", template["closing"], "", "Saludos,", "Equipo Geoactiv · Tal-IA"])

    body_text = "\n".join(body_lines)

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body_text,
            recipients=[email_value],
            body_html=None,
            attachments=None,
            mail_settings=mail_settings,
            brevo_settings=brevo_settings,
        )
    except EmailSendError as exc:
        logger.error(
            "whatsapp.info_email.send_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError(
            "No se pudo enviar el correo en este momento. Inténtalo nuevamente más tarde."
        ) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception(
            "whatsapp.info_email.send_unexpected",
            extra={"conversation_id": context.conversation_id},
        )
        raise ValueError("Ocurrió un error inesperado al enviar el correo.") from exc

    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=summary or contact_notes,
            intencion=contact_need,
            siguiente_accion="informacion_enviada_email",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )

    oportunidad_id = None
    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.info_email.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if oportunidad_id:
        try:
            await storage.maybe_auto_name_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=oportunidad_id,
                intent=contact_need,
                summary=summary or contact_notes,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.info_email.auto_name_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )

    return {"status": "sent", "email": email_value, "message_id": message_id}


async def _handle_close_lead(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    contact = await _resolve_contact(context.contact_id)
    notes = _require(arguments, "notes")
    necesidad = _require(arguments, "necesidad_proposito")
    siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
    tarjeta_id = None
    try:
        tarjeta_id = await storage.ensure_conversation_opportunity(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await storage.update_contact(
        context.contact_id,
        {"notes": notes, "necesidad_proposito": necesidad},
    )
    if tarjeta_id:
        channel_value = str(context.channel or "whatsapp").strip().lower() or "whatsapp"
        profiling_enabled_for_channel = True
        contact_org = webchat_service._extract_contact_org(contact)
        contact_org_uuid = webchat_service._resolve_org_uuid(contact_org)
        if contact_org_uuid and channel_value in {"whatsapp", "webchat"}:
            profiling_enabled_for_channel = await tenant_runtime.is_profiling_enabled(
                organizacion_id=UUID(contact_org_uuid),
                channel=channel_value,
            )

        scoring_answers = {
            key: arguments.get(key)
            for key in (
                "financing_type",
                "credit_preapproved",
                "budget_range",
                "down_payment_ready",
                "purchase_timeline",
                "hard_deadline",
                "requirements_defined",
                "comparison_mode",
                "visited_properties",
                "decision_authority",
                "buyer_type",
            )
            if key in arguments
        }
        user_signals: Mapping[str, bool] = {}
        try:
            recent_messages = await storage.fetch_recent_messages(
                conversation_id=context.conversation_id,
                limit=24,
            )
            user_signals = _extract_user_prefilter_signals(recent_messages)
            scoring_answers = _sanitize_scoring_answers_from_user_messages(
                scoring_answers=scoring_answers,
                user_signals=user_signals,
            )
        except StorageError:
            # Si no se pudo leer historial, se conserva el payload recibido.
            pass
        action_text = (siguiente_accion or "").lower()
        requested = any(token in action_text for token in ("cita", "agendar", "demo", "visita"))
        appointment_requested = _optional_bool_argument(arguments, "appointment_requested")
        accepted_questions = _optional_bool_argument(
            arguments, "accepted_answering_questions"
        )
        evasive_count = _optional_int_argument(arguments, "evasive_answers_count")
        response_time_bucket_raw = str(arguments.get("response_time_bucket") or "").strip().lower()
        response_time_bucket = (
            response_time_bucket_raw
            if response_time_bucket_raw in {"fast", "medium", "slow"}
            else None
        )
        scoring_events: dict[str, Any] = {
            "channel": context.channel or "whatsapp",
            "appointment_requested": (
                appointment_requested if appointment_requested is not None else requested
            ),
            "accepted_answering_questions": (
                accepted_questions
                if accepted_questions is not None
                else bool(scoring_answers)
            ),
        }
        if evasive_count is not None:
            scoring_events["evasive_answers_count"] = evasive_count
        if response_time_bucket is not None:
            scoring_events["response_time_bucket"] = response_time_bucket
        profiling_statuses_raw = (
            arguments.get("profiling_statuses")
            if isinstance(arguments.get("profiling_statuses"), dict)
            else arguments.get("perfilamiento_estados")
        )
        profiling_reprompt_counts_raw = (
            arguments.get("profiling_reprompt_counts")
            if isinstance(arguments.get("profiling_reprompt_counts"), dict)
            else arguments.get("perfilamiento_repregunta_counts")
        )
        profiling_statuses = (
            profiling_statuses_raw if isinstance(profiling_statuses_raw, dict) else None
        )
        profiling_reprompt_counts = (
            profiling_reprompt_counts_raw
            if isinstance(profiling_reprompt_counts_raw, dict)
            else None
        )
        profiling_statuses = _sanitize_profiling_statuses_from_user_messages(
            profiling_statuses=profiling_statuses,
            user_signals=user_signals,
        )
        profiling_reprompt_counts = _sanitize_profiling_reprompt_counts(
            profiling_counts=profiling_reprompt_counts,
            profiling_statuses=profiling_statuses,
        )
        if profiling_enabled_for_channel:
            try:
                await storage.apply_lead_scoring(
                    conversation_id=context.conversation_id,
                    contact_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    answers=scoring_answers,
                    events=scoring_events,
                    profiling_statuses=profiling_statuses,
                    profiling_reprompt_counts=profiling_reprompt_counts,
                    source="close_lead",
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.close_lead.scoring_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
            try:
                await storage.maybe_promote_prequalified_from_scoring(
                    conversation_id=context.conversation_id,
                    contact_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    channel=context.channel or "whatsapp",
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.close_lead.prequalified_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        else:
            logger.info(
                "whatsapp.close_lead.skip_scoring_profiling_disabled",
                extra={
                    "conversation_id": context.conversation_id,
                    "opportunity_id": str(tarjeta_id),
                    "channel": channel_value,
                },
            )
    try:
        # Mantener hilo único en inbox: en WhatsApp el cierre operativo del lead
        # no debe forzar una nueva conversación técnica al siguiente mensaje.
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.conversation_update_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=notes,
            intencion=necesidad,
            siguiente_accion=siguiente_accion,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.close_lead.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if tarjeta_id:
        try:
            await storage.maybe_auto_name_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=str(tarjeta_id),
                intent=necesidad,
                summary=notes,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.close_lead.auto_name_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )

    return {
        "status": "ok",
        "notes": notes,
        "necesidad_proposito": necesidad,
        "siguiente_accion": siguiente_accion,
        "tarjeta_id": tarjeta_id,
    }


async def _handle_restart_cycle(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    reason = str(arguments.get("reason") or "").strip()
    ensure_payload = await storage.ensure_conversation_opportunity(
        conversation_id=context.conversation_id,
        contact_id=context.contact_id,
        channel=context.channel or "whatsapp",
        force_new_opportunity_on_restart=True,
        include_restart_metadata=True,
    )
    restart_created = False
    restart_sequence = 1
    oportunidad_id = None
    if isinstance(ensure_payload, dict):
        restart_created = bool(ensure_payload.get("restart_created"))
        restart_sequence = int(ensure_payload.get("restart_sequence") or 1)
        oportunidad_id = ensure_payload.get("oportunidad_id")
    else:
        oportunidad_id = ensure_payload

    if restart_created:
        resumen_text = reason or f"Nuevo ciclo #{restart_sequence} solicitado por el asistente."
        await _notify_sales_rep(
            context=context,
            trigger="restart_tool",
            contact=None,
            opportunity_id=oportunidad_id,
            resumen=resumen_text,
            notes="El asistente detectó un cambio de tema y abrió un ciclo nuevo.",
            email=None,
            extra={"restart_sequence": restart_sequence},
        )

    return {
        "status": "ok",
        "restart_created": restart_created,
        "restart_sequence": restart_sequence,
        "oportunidad_id": oportunidad_id,
    }


async def _handle_list_demo_slots(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    conversation_meta = await webchat_service._resolve_conversation_metadata(context.conversation_id)
    calendar_settings = await webchat_service.get_calendar_runtime_settings_for_organizacion(
        conversation_meta.get("organizacion_id")
    )
    resource_id = calendar_settings.resource_id
    if not resource_id:
        raise ValueError(
            "No se configuró el calendario de demos para esta organización "
            "(falta webchat.calendar.resource_id)."
        )
    timezone_pref = webchat_service._resolve_timezone_preference(arguments.get("timezone"), calendar_settings)
    start_raw = arguments.get("start_date") or arguments.get("window_start")
    start_date = webchat_service._parse_calendar_date(start_raw)
    window_days = webchat_service._normalize_window_days(
        arguments.get("window_days") or arguments.get("days"),
        calendar_settings.default_days,
    )
    end_date = start_date + timedelta(days=window_days - 1)
    try:
        availability_raw = await webchat_service.calendar_service.list_slots(
            resource_id=resource_id,
            start_date=start_date,
            end_date=end_date,
            timezone_hint=timezone_pref,
            max_days=window_days,
            fallback_hold_minutes=calendar_settings.hold_minutes,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    slots = [slot for slot in availability_raw.get("slots", []) if slot.get("is_available")]
    availability_payload = dict(availability_raw)
    availability_payload["slots"] = slots

    return {
        "status": "ok",
        "resource_id": resource_id,
        "timezone": availability_payload.get("timezone"),
        "window_start": availability_payload.get("window_start"),
        "window_end": availability_payload.get("window_end"),
        "slot_duration_minutes": availability_payload.get("slot_duration_minutes"),
        "slots": availability_payload["slots"],
        "_side_effects": {"availability": availability_payload},
    }


async def _handle_schedule_demo(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    conversation_meta = await webchat_service._resolve_conversation_metadata(context.conversation_id)
    calendar_settings = await webchat_service.get_calendar_runtime_settings_for_organizacion(
        conversation_meta.get("organizacion_id")
    )
    resource_id = calendar_settings.resource_id
    if not resource_id:
        raise ValueError(
            "No se configuró el calendario de demos para esta organización "
            "(falta webchat.calendar.resource_id)."
        )
    slot_id = str(arguments.get("slot_id") or "").strip()
    start_raw = arguments.get("start_at")
    if not start_raw and slot_id:
        _, _, candidate = slot_id.partition(":")
        if candidate:
            start_raw = candidate
    slot_datetime = webchat_service._parse_calendar_datetime(start_raw)
    hold_minutes = max(1, calendar_settings.hold_minutes)
    slot_identifier = slot_id or webchat_service._build_slot_identifier(resource_id, slot_datetime)
    notes = (arguments.get("notes") or "").strip() or None

    contact = await _resolve_contact(context.contact_id)
    channel_value = str(context.channel or "whatsapp").strip().lower() or "whatsapp"
    contact_org = webchat_service._extract_contact_org(contact)
    contact_org_uuid = webchat_service._resolve_org_uuid(contact_org)
    profiling_enabled_for_channel = True
    if contact_org_uuid and channel_value in {"whatsapp", "webchat"}:
        profiling_enabled_for_channel = await tenant_runtime.is_profiling_enabled(
            organizacion_id=UUID(contact_org_uuid),
            channel=channel_value,
        )
    try:
        tarjeta_id = await webchat_service._ensure_opportunity_when_contact_ready(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            channel="whatsapp",
            contact=contact,
        )
    except storage.StorageError as exc:
        logger.exception(
            "calendar.ensure_opportunity_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError("No pude asociar la oportunidad para agendar la demo.") from exc

    # Regla comercial: antes de agendar por WhatsApp siempre requerimos
    # datos básicos de contacto, independientemente del perfilamiento IA.
    missing_contact_fields = _missing_basic_contact_fields(contact)
    if missing_contact_fields:
        return {
            "status": "contact_missing",
            "missing_fields": missing_contact_fields,
            "guidance": _build_contact_required_guidance(missing_contact_fields),
        }

    if profiling_enabled_for_channel:
        prefilter_status = await _has_prefilter_for_schedule(
            contact=contact,
            opportunity_id=tarjeta_id,
            conversation_id=context.conversation_id,
        )
        if not bool(prefilter_status.get("ready")):
            missing_fields = [
                str(item)
                for item in (prefilter_status.get("missing_fields") or [])
                if str(item).strip()
            ]
            try:
                recent_messages = await storage.fetch_recent_messages(
                    conversation_id=context.conversation_id,
                    limit=40,
                )
            except StorageError:
                recent_messages = []
            inferred_answers = _infer_prefilter_answers_from_messages(
                recent_messages,
                missing_fields=missing_fields,
            )
            if inferred_answers:
                try:
                    await storage.apply_lead_scoring(
                        conversation_id=context.conversation_id,
                        contact_id=context.contact_id,
                        opportunity_id=str(tarjeta_id),
                        answers=inferred_answers,
                        events={
                            "channel": context.channel or "whatsapp",
                            "appointment_requested": True,
                            "accepted_answering_questions": True,
                        },
                        source="schedule_demo_prefilter_infer",
                    )
                    prefilter_status = await _has_prefilter_for_schedule(
                        contact=contact,
                        opportunity_id=tarjeta_id,
                        conversation_id=context.conversation_id,
                    )
                except StorageError:
                    pass
        if not bool(prefilter_status.get("ready")):
            missing_fields = [
                str(item)
                for item in (prefilter_status.get("missing_fields") or [])
                if str(item).strip()
            ]
            logger.info(
                "whatsapp.schedule_demo.prefilter_missing",
                extra={
                    "conversation_id": context.conversation_id,
                    "opportunity_id": str(tarjeta_id),
                    "missing_fields": missing_fields,
                },
            )
            guidance = _build_schedule_prefilter_error_message(
                missing_fields=missing_fields,
                question_by_field=_ensure_dict(prefilter_status.get("questions")),
            )
            return {
                "status": "prefilter_missing",
                "missing_fields": missing_fields,
                "guidance": guidance,
            }

    metadata_payload: dict[str, Any] = {
        "slot_id": slot_identifier,
        "source": "whatsapp",
        "conversation_id": context.conversation_id,
        "tarjeta_id": tarjeta_id,
        "oportunidad_id": tarjeta_id,
    }
    organizacion_hint = webchat_service._extract_contact_org(contact)
    if organizacion_hint:
        metadata_payload["organizacion_id"] = organizacion_hint

    contact_record = contact
    confirm_metadata = {
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "session_id": context.session_id,
        "tarjeta_id": tarjeta_id,
    }
    contact_org = webchat_service._extract_contact_org(contact_record)
    if contact_org:
        confirm_metadata["organizacion_id"] = contact_org

    try:
        hold = await webchat_service.calendar_service.hold_slot(
            resource_id=resource_id,
            slot_start=slot_datetime,
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            tarjeta_id=tarjeta_id,
            hold_minutes=hold_minutes,
            metadata=metadata_payload,
        )
        booking = await webchat_service.calendar_service.confirm_slot(
            hold_id=hold.get("hold_id"),
            notes=notes,
            metadata=confirm_metadata,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    booking_response = webchat_service._build_booking_response(booking)
    contact = await _resolve_contact(context.contact_id)
    booking_response.hold_id = hold.get("hold_id")
    contact_record = contact
    opportunity_contact_id = context.contact_id
    channel_value = str(context.channel or "whatsapp").strip().lower() or "whatsapp"
    contact_org = webchat_service._extract_contact_org(contact_record)
    if contact_org:
        try:
            opportunity_contact = await storage.fetch_opportunity_contact(
                oportunidad_id=str(tarjeta_id),
                organizacion_id=str(contact_org),
            )
        except StorageError:
            opportunity_contact = None
        if isinstance(opportunity_contact, dict):
            resolved_contact_id = str(opportunity_contact.get("id") or "").strip()
            if resolved_contact_id:
                opportunity_contact_id = resolved_contact_id
                contact_record = opportunity_contact

    await webchat_service._sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=tarjeta_id,
        contact=contact_record,
        channel="whatsapp",
    )
    await webchat_service._send_booking_confirmation_email(
        booking=booking_response,
        contact_id=context.contact_id,
        conversation_id=context.conversation_id,
        tarjeta_id=tarjeta_id,
        contact=contact_record,
    )
    if profiling_enabled_for_channel:
        if _has_meaningful_scoring_answers(contact_record):
            try:
                await storage.apply_lead_scoring(
                    conversation_id=context.conversation_id,
                    contact_id=context.contact_id,
                    opportunity_id=str(tarjeta_id),
                    events={
                        "channel": "whatsapp",
                        "appointment_requested": True,
                        "appointment_scheduled": True,
                        "appointment_confirmed": True,
                    },
                    source="booking_confirmed",
                )
            except StorageError as exc:
                logger.warning(
                    "whatsapp.schedule_demo.scoring_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        else:
            logger.info(
                "whatsapp.schedule_demo.skip_scoring_without_answers",
                extra={"conversation_id": context.conversation_id, "opportunity_id": str(tarjeta_id)},
            )
        try:
            await storage.maybe_promote_prequalified_from_scoring(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                opportunity_id=str(tarjeta_id),
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.schedule_demo.prequalified_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
    else:
        logger.info(
            "whatsapp.schedule_demo.skip_scoring_profiling_disabled",
            extra={
                "conversation_id": context.conversation_id,
                "opportunity_id": str(tarjeta_id),
                "channel": channel_value,
            },
        )
    # En prospección, al confirmar demo dejamos contexto mínimo para insights/título.
    opportunity_metadata: dict[str, Any] = {}
    opportunity_row: dict[str, Any] | None = None
    if contact_org_uuid:
        try:
            repo = CRMRepository()
            opportunity_row = await repo.get_pipeline_opportunity(
                organizacion_id=UUID(contact_org_uuid),
                oportunidad_id=UUID(str(tarjeta_id)),
            )
        except (CRMRepositoryError, ValueError) as exc:
            logger.warning(
                "whatsapp.schedule_demo.fetch_opportunity_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
            opportunity_row = None
        if isinstance(opportunity_row, dict):
            opportunity_metadata = _ensure_dict(opportunity_row.get("metadata"))
    is_prospeccion = _is_prospeccion_opportunity({"metadata": opportunity_metadata})
    # Si el contacto de la conversación y el de la oportunidad difieren,
    # propagamos datos capturados (nombre/correo/empresa) al contacto de oportunidad.
    if opportunity_contact_id != context.contact_id and isinstance(contact, dict):
        merge_payload: dict[str, Any] = {}
        if not str((contact_record or {}).get("nombre_completo") or "").strip():
            candidate = str(contact.get("nombre_completo") or "").strip()
            if candidate:
                merge_payload["nombre_completo"] = candidate
        if not str((contact_record or {}).get("correo") or "").strip():
            candidate = str(contact.get("correo") or "").strip()
            if candidate:
                merge_payload["correo"] = candidate
        if not str((contact_record or {}).get("company_name") or "").strip():
            candidate = str(contact.get("company_name") or "").strip()
            if candidate:
                merge_payload["company_name"] = candidate
        if merge_payload:
            try:
                await storage.update_contact(opportunity_contact_id, merge_payload)
                contact_record = await _resolve_contact(opportunity_contact_id)
            except StorageError as exc:
                logger.warning(
                    "whatsapp.schedule_demo.contact_merge_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )

    existing_need = str((contact_record or {}).get("necesidad_proposito") or "").strip()
    existing_notes = str((contact_record or {}).get("notes") or "").strip()
    booking_note = (
        f"Demo confirmada para {booking_response.start_at.isoformat()} "
        f"(booking {booking_response.booking_id})."
    )
    fallback_need = (
        "Agendar demo de prospección por WhatsApp"
        if is_prospeccion
        else "Agendar demo por WhatsApp"
    )
    inferred_need = existing_need or fallback_need
    inferred_notes = existing_notes or notes or booking_note
    patch_payload: dict[str, Any] = {}
    if not existing_need:
        patch_payload["necesidad_proposito"] = inferred_need
    if not existing_notes:
        patch_payload["notes"] = inferred_notes
    if patch_payload:
        try:
            await storage.update_contact(opportunity_contact_id, patch_payload)
            contact_record = await _resolve_contact(opportunity_contact_id)
        except StorageError as exc:
            logger.warning(
                "whatsapp.schedule_demo.contact_context_patch_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=inferred_notes,
            intencion=inferred_need,
            siguiente_accion="demo_agendada",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.schedule_demo.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    try:
        await storage.maybe_auto_name_opportunity(
            conversation_id=context.conversation_id,
            contact_id=opportunity_contact_id,
            opportunity_id=str(tarjeta_id),
            intent=inferred_need,
            summary=inferred_notes,
            channel=context.channel or "whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.schedule_demo.auto_name_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if opportunity_row and contact_org_uuid:
        current_title = str(opportunity_row.get("titulo") or "").strip()
        current_description = str(opportunity_row.get("descripcion") or "").strip()
        full_name = str((contact_record or {}).get("nombre_completo") or "").strip()
        company_name = str((contact_record or {}).get("company_name") or "").strip()
        looks_generic = (
            not current_title
            or current_title.lower().startswith("conversación ")
            or (full_name and current_title.casefold() == full_name.casefold())
        )
        if looks_generic or not current_description:
            label = company_name or full_name or "Prospecto"
            title_prefix = "Demo de prospección" if is_prospeccion else "Demo agendada"
            desired_title = f"{title_prefix} - {label}"
            patch_opp: dict[str, Any] = {}
            if looks_generic:
                patch_opp["titulo"] = desired_title[:120]
            if not current_description:
                patch_opp["descripcion"] = inferred_notes[:1000]
            if patch_opp:
                try:
                    repo = CRMRepository()
                    await repo.update_opportunity(
                        organizacion_id=UUID(contact_org_uuid),
                        oportunidad_id=UUID(str(tarjeta_id)),
                        payload=patch_opp,
                    )
                except (CRMRepositoryError, ValueError) as exc:
                    logger.warning(
                        "whatsapp.schedule_demo.prospeccion_title_patch_failed",
                        extra={"conversation_id": context.conversation_id, "error": str(exc)},
                    )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_confirmed",
            contact=contact_record,
            opportunity_id=tarjeta_id,
            resumen="Cita agendada",
            notes=(
                f"Cita confirmada para {booking_response.start_at.isoformat()} "
                f"(booking {booking_response.booking_id})."
            ),
            email=contact_record.get("correo"),
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
            },
        )
    except Exception:
        logger.warning(
            "whatsapp.booking_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
            },
        )

    booking_payload = {
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }
    return {
        "status": "ok",
        **booking_payload,
        "_side_effects": {"booking": booking_payload},
    }


async def _handle_reschedule_demo(
    arguments: dict[str, Any], context: ToolRuntimeContext
) -> dict[str, Any]:
    booking_id = str(arguments.get("booking_id") or "").strip()
    if not booking_id:
        raise ValueError("booking_id requerido para reschedule_demo")
    new_slot_raw = arguments.get("start_at") or arguments.get("slot_start")
    new_slot_datetime = webchat_service._parse_calendar_datetime(new_slot_raw)
    notes = (arguments.get("notes") or "").strip() or None
    contact = await _resolve_contact(context.contact_id)
    org_hint = webchat_service._extract_contact_org(contact) if contact else None
    if not org_hint:
        try:
            conversation_meta = await storage.fetch_conversation(context.conversation_id)
        except StorageError:
            conversation_meta = {}
        org_hint = str(conversation_meta.get("organizacion_id") or "").strip() or None
    resolved_org = webchat_service._resolve_org_uuid(org_hint)
    metadata_payload: dict[str, Any] = {
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "session_id": context.session_id,
    }
    if resolved_org:
        metadata_payload["organizacion_id"] = resolved_org
    try:
        booking = await webchat_service.calendar_service.reschedule_booking(
            booking_id=booking_id,
            new_slot_start=new_slot_datetime,
            notes=notes,
            metadata=metadata_payload,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = webchat_service._build_booking_response(booking)
    await webchat_service._sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
        channel="whatsapp",
    )
    await webchat_service._send_booking_confirmation_email(
        booking=booking_response,
        contact_id=context.contact_id,
        conversation_id=context.conversation_id,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
    )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_confirmed",
            contact=contact,
            opportunity_id=booking_response.tarjeta_id,
            resumen="Cita agendada",
            notes=f"Cita confirmada para {booking_response.start_at.isoformat()} (booking {booking_response.booking_id}).",
            email=contact.get("correo"),
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
            },
        )
    except Exception:
        logger.warning(
            "whatsapp.booking_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
            },
        )
    return {
        "status": "ok",
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }


async def _handle_cancel_demo(arguments: dict[str, Any], context: ToolRuntimeContext) -> dict[str, Any]:
    booking_id = str(arguments.get("booking_id") or "").strip()
    if not booking_id:
        raise ValueError("booking_id requerido para cancel_demo")
    reason = (arguments.get("reason") or "").strip() or None
    try:
        booking = await webchat_service.calendar_service.cancel_booking(
            booking_id=booking_id,
            reason=reason,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = webchat_service._build_booking_response(booking)
    contact_record = await _resolve_contact(context.contact_id)
    logger.info(
        "whatsapp.cancel_notify.start",
        extra={
            "conversation_id": context.conversation_id,
            "contact_id": context.contact_id,
            "booking_id": booking_response.booking_id,
            "reason": reason,
        },
    )
    try:
        await _notify_sales_rep(
            context=context,
            trigger="booking_canceled",
            contact=contact_record,
            opportunity_id=None,
            resumen="Cita cancelada",
            notes=reason,
            email=contact_record.get("correo") if contact_record else None,
            extra={
                "booking_id": booking_response.booking_id,
                "slot_start": booking_response.start_at.isoformat(),
                "slot_end": booking_response.end_at.isoformat() if booking_response.end_at else None,
                "reason": reason or "Sin motivo",
            },
        )
    except Exception as exc:
        logger.warning(
            "whatsapp.cancel_notify_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.contact_id,
                "error": str(exc),
            },
        )
    return {
        "status": "ok",
        "booking_id": booking_response.booking_id,
        "resource_id": booking_response.resource_id,
        "start_at": booking_response.start_at.isoformat(),
        "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
        "timezone": booking_response.timezone,
        "status": booking_response.status,
        "hold_id": booking_response.hold_id,
    }


async def _resolve_contact(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return None


def _contact_org_uuid(contact: dict[str, Any] | None) -> UUID | None:
    if not contact:
        return None
    org_value = webchat_service._extract_contact_org(contact)
    if not org_value:
        return None
    resolved = webchat_service._resolve_org_uuid(org_value)
    if not resolved:
        return None
    try:
        return UUID(resolved)
    except ValueError:
        return None


async def _notify_sales_rep(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    contact: dict[str, Any] | None,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
    force_retry: bool = False,
) -> None:
    contact_record = contact or await _resolve_contact(context.contact_id)
    if not contact_record:
        logger.warning(
            "whatsapp.notify_sales.contact_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return
    org_id = contact_record.get("organizacion_id")
    if not org_id:
        logger.warning(
            "whatsapp.notify_sales.org_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    opp_id = opportunity_id
    if not opp_id:
        try:
            opp_id = await storage.ensure_conversation_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel=context.channel or "whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.notify_sales.ensure_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "error": str(exc),
                },
            )
            return

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(opp_id))
    except (TypeError, ValueError):
        logger.warning(
            "whatsapp.notify_sales.invalid_ids",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.notify_sales.fetch_opportunity_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    if not opportunity:
        logger.warning(
            "whatsapp.notify_sales.opportunity_missing",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)

    metadata = _ensure_dict(opportunity.get("metadata"))
    is_prospeccion = _is_prospeccion_opportunity({"metadata": metadata})
    profile_summary = _build_profile_summary_text(metadata)
    if profile_summary:
        extra = dict(extra or {})
        extra.setdefault("profile_summary", profile_summary)
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    if trigger in {"information_email", "close_lead"}:
        logger.info(
            "whatsapp.notify_sales.skip_legacy_trigger",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    channel_key = str(context.channel or "whatsapp").strip().lower() or "whatsapp"
    primary_reason: str | None = None
    if trigger == "booking_confirmed":
        if not _has_base_fields_for_case_a(contact_record):
            logger.info(
                "whatsapp.notify_sales.skip_case_a_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        if is_prospeccion:
            primary_reason = "case_a_booking_prospeccion"
        else:
            if not await _has_minimum_profile_for_case_a(
                contact=contact_record,
                opportunity_metadata=metadata,
                repo=repo,
                organizacion_id=org_uuid,
                channel=channel_key,
            ):
                logger.info(
                    "whatsapp.notify_sales.skip_case_a_profile_missing",
                    extra={"conversation_id": context.conversation_id, "trigger": trigger},
                )
                return
            primary_reason = "case_a_booking_profile"
    elif trigger in {"followup_escalate", "webchat_escalate"}:
        if not _has_base_fields_for_case_b(contact_record):
            logger.info(
                "whatsapp.notify_sales.skip_case_b_base_missing",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        if trigger == "webchat_escalate" or channel_key == "webchat":
            exhausted = _is_webchat_reengage_exhausted(contact_record)
        else:
            exhausted = _is_whatsapp_reengage_exhausted(
                opportunity_metadata=metadata,
                whatsapp_settings=whatsapp_settings,
            )
        if not exhausted:
            logger.info(
                "whatsapp.notify_sales.skip_case_b_reengage_not_exhausted",
                extra={"conversation_id": context.conversation_id, "trigger": trigger},
            )
            return
        primary_reason = "case_b_reengage_exhausted"

    primary_by_channel = _get_primary_notification_by_channel(metadata)
    if primary_reason and primary_by_channel.get(channel_key) and not force_retry:
        logger.info(
            "whatsapp.notify_sales.primary_already_sent",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "channel": channel_key,
            },
        )
        return

    if notifications.get(trigger) and not force_retry:
        logger.info(
            "whatsapp.notify_sales.already_sent",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    assigned = opportunity.get("asignado") or {}
    seller_id = assigned.get("id")
    seller_phone = assigned.get("telefono_e164") or assigned.get("telefono")
    seller_name = str(assigned.get("nombre_completo") or "").strip() or "Equipo Tal-IA"
    if not seller_id or not seller_phone:
        logger.warning(
            "whatsapp.notify_sales.no_seller",
            extra={"conversation_id": context.conversation_id, "trigger": trigger},
        )
        return

    message_body = shared_compose_sales_notification_message(
        contact=contact_record,
        trigger=trigger,
        resumen=resumen,
        notes=notes,
        email=email,
        extra=extra,
    )
    appointment_template = (
        whatsapp_settings.appointment_template_sid
        or settings.whatsapp_sales_appointment_template_sid
    )
    cancel_template = (
        whatsapp_settings.cancel_template_sid
        or settings.whatsapp_sales_cancel_appointment_template_sid
    )
    template_sid: str | None = None
    template_vars: dict[str, str] | None = None
    if trigger == "booking_confirmed" and appointment_template:
        template_sid = appointment_template
        template_vars = shared_build_booking_template_variables(
            contact=contact_record,
            seller_name=seller_name,
            extra=extra,
            include_reason=False,
        )
    elif trigger == "booking_canceled" and cancel_template:
        template_sid = cancel_template
        template_vars = shared_build_booking_template_variables(
            contact=contact_record,
            seller_name=seller_name,
            extra=extra,
            include_reason=True,
        )
    else:
        if trigger == "booking_canceled":
            logger.info(
                "whatsapp.notify_sales.cancel_template_missing",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "trigger": trigger,
                    "seller_id": seller_id,
                },
            )
        template_sid = whatsapp_settings.sales_template_sid or settings.whatsapp_sales_template_sid
        if template_sid:
            template_vars = shared_build_sales_template_variables(
            contact=contact_record,
            resumen=resumen,
            notes=notes,
            extra=extra,
            seller_name=seller_name,
            email=email,
        )

    logger.info(
        "whatsapp.notify_sales.pre_send",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
            "seller_phone": seller_phone,
            "template_sid": template_sid,
            "template_vars": template_vars,
        },
    )

    send_result = None
    try:
        from app.channels.whatsapp import service as whatsapp_service

        send_result = await whatsapp_service.send_manual_message(
            to_number=seller_phone,
            body=None if template_sid else message_body,
            template_sid=template_sid,
            template_variables=template_vars,
            organizacion_id=org_uuid,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return

    send_error = getattr(send_result, "error", None) if send_result else None
    if send_error:
        logger.warning(
            "whatsapp.notify_sales.send_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": send_error,
            },
        )
        return

    message_sid = getattr(send_result, "sid", None) if send_result else None
    status_value = getattr(send_result, "status", None) if send_result else None
    logger.info(
        "whatsapp.notify_sales.result",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "template_sid": template_sid,
            "message_sid": message_sid,
            "status": status_value,
            "seller_id": seller_id,
        },
    )

    if message_sid:
        try:
            await storage.register_whatsapp_message(
                direction="saliente",
                wa_id=None,
                phone_e164=seller_phone,
                body=message_body if not template_sid else None,
                message_sid=message_sid,
                metadata={
                    "trigger": trigger,
                    "template_sid": template_sid,
                    "sender": "sales_notification",
                },
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                organizacion_id=str(org_id),
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.notify_sales.metadata_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "trigger": trigger,
                    "error": str(exc),
                    "message_sid": message_sid,
                },
            )

    previous_notification = _ensure_dict(notifications.get(trigger))
    retry_count = 0
    if force_retry:
        try:
            retry_count = max(0, int(previous_notification.get("retry_count") or 0)) + 1
        except (TypeError, ValueError):
            retry_count = 1
    notifications[trigger] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": context.conversation_id,
        "contact_id": context.contact_id,
        "notification_sid": message_sid,
        "retry_count": retry_count,
    }
    metadata["sales_notifications"] = notifications
    if primary_reason:
        primary_by_channel[channel_key] = {
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "conversation_id": context.conversation_id,
            "contact_id": context.contact_id,
            "trigger": trigger,
            "reason": primary_reason,
        }
        metadata["sales_primary_notifications"] = primary_by_channel
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )

        seller_id_value = assigned.get("id")
        if seller_id_value and not force_retry:
            seller_uuid = UUID(str(seller_id_value))
            assignment_metadata: dict[str, Any] = {
                "reason": extra or {},
                "notification": {
                    "trigger": trigger,
                    "uses_template": bool(template_sid),
                },
            }
            await repo.insert_sales_assignment_audit(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                vendedor_id=seller_uuid,
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                trigger=f"notify_{trigger}",
                metadata=assignment_metadata,
                notification_sid=message_sid,
                canal="whatsapp",
            )
    except (ValueError, CRMRepositoryError) as exc:
        logger.warning(
            "whatsapp.notify_sales.metadata_failed",
            extra={
                "conversation_id": context.conversation_id,
                "trigger": trigger,
                "error": str(exc)},
        )
        return

    logger.info(
        "whatsapp.notify_sales.sent",
        extra={
            "conversation_id": context.conversation_id,
            "trigger": trigger,
            "seller_id": seller_id,
        },
    )


def _build_profile_summary_text(opportunity_metadata: Mapping[str, Any]) -> str | None:
    return shared_build_profile_summary_text(opportunity_metadata)
