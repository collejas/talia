"""Shared lead-capture tools for assistant channels."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from datetime import datetime, timezone

from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.webchat import service as webchat_service
from app.core.logging import get_logger
from app.services import assistant_document_delivery as document_delivery_service
from app.services import send_email, storage, tenant_runtime
from app.services.email import EmailSendError
from app.services.storage import StorageError
import app.services.webchat_followups as webchat_followups

logger = get_logger("app.assistants.tools.lead")

INFORMATION_EMAIL_DEFAULT_TEMPLATE: dict[str, Any] = {
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


def _require_argument(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if value is None:
        raise ValueError(f"{key} requerido para la función solicitada")
    text = str(value).strip()
    if not text:
        raise ValueError(f"{key} requerido para la función solicitada")
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


def _parse_string_list_argument(arguments: dict[str, Any], key: str) -> list[str]:
    raw = arguments.get(key)
    if not isinstance(raw, list):
        return []
    values: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if text and text not in values:
            values.append(text)
    return values


def _is_webchat_context(context: ToolRuntimeContext) -> bool:
    channel = (context.channel or "").strip().lower()
    return not channel or channel == "webchat"


def _persona_followup_state(persona: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(persona, dict):
        return {}
    raw = persona.get("persona_datos") or persona.get("contacto_datos") or persona.get("metadata")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            raw = parsed
    if not isinstance(raw, dict):
        return {}
    followup = raw.get("webchat_followup")
    return dict(followup) if isinstance(followup, dict) else {}


def _lead_close_already_marked(persona: dict[str, Any] | None) -> bool:
    state = _persona_followup_state(persona).get("state")
    if not isinstance(state, dict):
        return False
    return bool(state.get("lead_closed_at"))


def _has_required_close_lead_fields(persona: dict[str, Any] | None) -> bool:
    if not isinstance(persona, dict):
        return False
    name = str(persona.get("nombre_completo") or "").strip()
    email = str(persona.get("correo") or persona.get("correo_principal") or "").strip()
    phone = str(persona.get("telefono_e164") or persona.get("telefono") or "").strip()
    company = str(persona.get("company_name") or "").strip()
    return bool(name and email and phone and company)


def _build_need_title(text: str, *, fallback_company: str | None = None) -> str:
    candidate = " ".join(str(text or "").strip().split())
    if candidate:
        for separator in (".", "!", "?", ";", "\n"):
            if separator in candidate:
                candidate = candidate.split(separator, 1)[0].strip()
                break
    if candidate and len(candidate) > 96:
        candidate = candidate[:95].rstrip() + "…"
    if candidate:
        return candidate
    company = str(fallback_company or "").strip()
    if company:
        return f"Información de Tal-IA para {company}"
    return "Interés en Tal-IA"


_PLACEHOLDER_NAME_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)^\s*visitante\s+whatsapp(?:\s+.*)?$"),
)

_NAME_DECLARATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bm[ií]{1,2}\s+nombre\s+es\s+(.+?)(?:$|[\n\r.,;:!?¡¿])"),
    re.compile(r"(?i)\bme\s+llamo\s+(.+?)(?:$|[\n\r.,;:!?¡¿])"),
    re.compile(r"(?i)\bm[ií]\s+llamo\s+(.+?)(?:$|[\n\r.,;:!?¡¿])"),
    re.compile(r"(?i)\bme\s+presento\s+como\s+(.+?)(?:$|[\n\r.,;:!?¡¿])"),
)

_PERSON_NAME_REJECT_WORDS: frozenset[str] = frozenset(
    {
        "anuales",
        "casa",
        "compania",
        "compañia",
        "compañía",
        "correo",
        "empresa",
        "hotel",
        "informacion",
        "información",
        "info",
        "llamado",
        "llamada",
        "manejamos",
        "manejemos",
        "negocio",
        "pui",
        "registros",
        "somos",
        "sistema",
    }
)


def _is_placeholder_full_name(value: str | None) -> bool:
    text = " ".join(str(value or "").split()).strip().casefold()
    if not text:
        return True
    return text.startswith("visitante whatsapp")


def _sanitize_extracted_person_name(value: str | None) -> str | None:
    candidate = " ".join(str(value or "").split()).strip(" \t\r\n.,;:!?¡¿")
    if not candidate or _is_placeholder_full_name(candidate):
        return None
    lower_candidate = candidate.casefold()
    if "@" in candidate or re.search(r"(?i)\b(?:https?://|www\.)", candidate):
        return None
    for separator in (" correo ", " email ", " empresa ", " compañía ", " compania ", " teléfono ", " telefono "):
        if separator in f" {lower_candidate} ":
            candidate = candidate.split(separator.strip(), 1)[0].strip(" \t\r\n.,;:!?¡¿")
            lower_candidate = candidate.casefold()
            break
    words = [word.strip(" \t\r\n.,;:!?¡¿") for word in candidate.split()]
    words = [word for word in words if word]
    if not words or len(words) > 4 or len(candidate) > 60:
        return None
    normalized_words = {word.casefold() for word in words}
    if normalized_words.intersection(_PERSON_NAME_REJECT_WORDS):
        return None
    if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}", candidate):
        return None
    if re.search(r"\d", candidate):
        return None
    return " ".join(words)


def _extract_name_from_message_text(text: str | None) -> str | None:
    candidate = " ".join(str(text or "").split()).strip()
    if not candidate:
        return None
    candidate = candidate.strip(" \t\r\n.,;:!?¡¿")
    lowered = candidate.casefold()
    if lowered.startswith("visitante whatsapp"):
        return None
    for pattern in _NAME_DECLARATION_PATTERNS:
        match = pattern.search(candidate)
        if match and match.lastindex and match.group(match.lastindex):
            return _sanitize_extracted_person_name(match.group(match.lastindex))
    return None


async def _resolve_full_name_from_context(
    *,
    context: ToolRuntimeContext,
    proposed_full_name: str,
) -> str:
    normalized = " ".join(str(proposed_full_name or "").split()).strip()
    extracted_candidates: list[str] = []
    if context.conversation_id:
        try:
            recent_messages = await storage.fetch_recent_messages(
                conversation_id=context.conversation_id,
                limit=6,
            )
        except StorageError:
            recent_messages = []
        for message in reversed(recent_messages):
            if not isinstance(message, dict):
                continue
            if str(message.get("direccion") or "").strip().lower() != "entrante":
                continue
            candidate = _extract_name_from_message_text(message.get("texto"))
            if candidate and not _is_placeholder_full_name(candidate):
                extracted_candidates.append(candidate)
        if extracted_candidates:
            return extracted_candidates[0]
    normalized_candidate = _sanitize_extracted_person_name(normalized)
    if normalized_candidate:
        return normalized_candidate
    if context.persona_id:
        try:
            persona = await storage.fetch_persona(context.persona_id)
        except StorageError:
            persona = None
        if isinstance(persona, dict):
            current_full_name = " ".join(str(persona.get("nombre_completo") or "").split()).strip()
            current_candidate = _sanitize_extracted_person_name(current_full_name)
            if current_candidate:
                return current_candidate
    return ""


async def _mark_auto_close_state(
    *,
    persona_id: str,
    persona: dict[str, Any] | None,
    reason: str,
) -> None:
    if not isinstance(persona, dict):
        return
    raw = persona.get("persona_datos") or persona.get("contacto_datos") or persona.get("metadata")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}
        if isinstance(parsed, dict):
            raw = parsed
    persona_data = dict(raw) if isinstance(raw, dict) else {}
    followup = dict(persona_data.get("webchat_followup")) if isinstance(persona_data.get("webchat_followup"), dict) else {}
    state = dict(followup.get("state")) if isinstance(followup.get("state"), dict) else {}
    state["lead_closed_at"] = datetime.now(timezone.utc).isoformat()
    state["lead_closed_reason"] = reason
    followup["state"] = state
    persona_data["webchat_followup"] = followup
    await storage.update_persona(persona_id, {"persona_datos": persona_data})


async def _maybe_auto_close_lead(
    *,
    context: ToolRuntimeContext,
    persona: dict[str, Any] | None = None,
    reason: str,
) -> dict[str, Any] | None:
    if not context.persona_id:
        return None
    persona_record = persona
    if not isinstance(persona_record, dict):
        try:
            persona_record = await storage.fetch_persona(context.persona_id)
        except StorageError:
            return None
    if _lead_close_already_marked(persona_record):
        return None
    if not _has_required_close_lead_fields(persona_record):
        return None

    summary_text = ""
    try:
        summary_row = await storage.fetch_latest_conversation_summary(conversation_id=context.conversation_id)
    except StorageError:
        summary_row = None
    if isinstance(summary_row, dict):
        summary_text = str(summary_row.get("resumen") or "").strip()

    notes = str(persona_record.get("notes") or "").strip()
    necesidad = str(persona_record.get("necesidad_proposito") or "").strip()
    company_name = str(persona_record.get("company_name") or "").strip()
    if not notes:
        notes = summary_text or (
            f"{str(persona_record.get('nombre_completo') or 'El prospecto').strip()} "
            f"de {company_name or 'su empresa'} compartió sus datos básicos y pidió información."
        )
    if not necesidad:
        necesidad = _build_need_title(summary_text or notes, fallback_company=company_name)

    try:
        result = await _complete_close_lead(
            arguments={
                "notes": notes,
                "necesidad_proposito": necesidad,
                "siguiente_accion": "continuar_conversacion",
            },
            context=context,
            persona=persona_record,
        )
    except Exception as exc:
        logger.warning(
            "lead_tools.auto_close_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "reason": reason,
                "error": str(exc),
            },
        )
        return None

    try:
        await _mark_auto_close_state(
            persona_id=context.persona_id,
            persona=persona_record,
            reason=reason,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.auto_close_state_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "reason": reason,
                "error": str(exc),
            },
        )
    return result


async def _complete_close_lead(
    *,
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
    persona: dict[str, Any] | None = None,
) -> dict[str, Any]:
    persona_id = context.persona_id
    persona_record = persona or await storage.fetch_persona(persona_id)
    summary_text = ""
    try:
        summary_row = await storage.fetch_latest_conversation_summary(
            conversation_id=context.conversation_id
        )
    except StorageError:
        summary_row = None
    if isinstance(summary_row, dict):
        summary_text = str(summary_row.get("resumen") or "").strip()

    notes = str(arguments.get("notes") or "").strip()
    necesidad = str(arguments.get("necesidad_proposito") or "").strip()
    company_name = str(persona_record.get("company_name") or "").strip()
    if not notes:
        notes = summary_text or (
            f"{str(persona_record.get('nombre_completo') or 'El prospecto').strip()} "
            f"de {company_name or 'su empresa'} compartió sus datos básicos y pidió información."
        )
    if not necesidad:
        necesidad = _build_need_title(summary_text or notes, fallback_company=company_name)
    if not notes:
        notes = "Información comercial compartida durante la conversación."
    if not necesidad:
        necesidad = "Interés en Tal-IA"
    siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
    tarjeta_id: str | None = None
    contact_ready = await webchat_followups.ensure_persona_ready_for_assignment(
        conversation_id=context.conversation_id,
        persona_id=context.persona_id,
    )
    if contact_ready:
        try:
            tarjeta_id = await storage.ensure_persona_conversation_opportunity(
                conversation_id=context.conversation_id,
                persona_id=context.persona_id,
                channel=context.channel,
            )
        except StorageError as exc:
            logger.warning(
                "lead_tools.ensure_opportunity_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
    await storage.update_persona(
        context.persona_id,
        {"notes": notes, "necesidad_proposito": necesidad},
    )
    try:
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
    except StorageError as exc:
        logger.warning(
            "lead_tools.conversation_update_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if tarjeta_id:
        try:
            await storage.sync_persona_opportunity_context(
                conversation_id=context.conversation_id,
                persona_id=context.persona_id,
                opportunity_id=str(tarjeta_id),
                channel=context.channel,
            )
        except StorageError as exc:
            logger.warning(
                "lead_tools.opportunity_sync_failed",
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
            "lead_tools.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    if tarjeta_id:
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
        action_text = (siguiente_accion or "").lower()
        requested = any(
            token in action_text for token in ("cita", "agendar", "demo", "visita")
        )
        appointment_requested = _optional_bool_argument(arguments, "appointment_requested")
        accepted_questions = _optional_bool_argument(
            arguments, "accepted_answering_questions"
        )
        evasive_count = _optional_int_argument(arguments, "evasive_answers_count")
        response_time_bucket_raw = (
            str(arguments.get("response_time_bucket") or "").strip().lower()
        )
        response_time_bucket = (
            response_time_bucket_raw
            if response_time_bucket_raw in {"fast", "medium", "slow"}
            else None
        )
        scoring_events: dict[str, Any] = {
            "channel": context.channel or "webchat",
            "appointment_requested": (
                appointment_requested if appointment_requested is not None else requested
            ),
            "accepted_answering_questions": (
                accepted_questions if accepted_questions is not None else bool(scoring_answers)
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
            profiling_reprompt_counts_raw if isinstance(profiling_reprompt_counts_raw, dict) else None
        )
        if profiling_enabled_for_channel := True:
            try:
                persona_org = webchat_service._extract_persona_org(persona_record)
                persona_org_uuid = webchat_service._resolve_org_uuid(persona_org)
                if persona_org_uuid and context.channel in {"whatsapp", "webchat"}:
                    profiling_enabled_for_channel = await tenant_runtime.is_profiling_enabled(
                        organizacion_id=UUID(persona_org_uuid),
                        channel=context.channel or "webchat",
                    )
            except Exception:
                profiling_enabled_for_channel = True
        if profiling_enabled_for_channel:
            try:
                await storage.apply_persona_lead_scoring(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    opportunity_id=str(tarjeta_id),
                    answers=scoring_answers,
                    events=scoring_events,
                    profiling_statuses=profiling_statuses,
                    profiling_reprompt_counts=profiling_reprompt_counts,
                    source="close_lead",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.scoring_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
            try:
                await storage.maybe_promote_prequalified_from_persona(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    opportunity_id=str(tarjeta_id),
                    channel=context.channel or "webchat",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.prequalified_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        else:
            logger.info(
                "lead_tools.skip_scoring_profiling_disabled",
                extra={
                    "conversation_id": context.conversation_id,
                    "opportunity_id": str(tarjeta_id),
                    "channel": context.channel or "webchat",
                },
            )
    await _refresh_webchat_followup_state(context)
    if tarjeta_id:
        try:
            await storage.maybe_auto_name_persona_opportunity(
                conversation_id=context.conversation_id,
                persona_id=context.persona_id,
                opportunity_id=str(tarjeta_id),
                intent=necesidad,
                summary=notes,
                channel=context.channel or "webchat",
            )
        except StorageError as exc:
            logger.warning(
                "lead_tools.auto_name_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
    persona_record = None
    if context.persona_id:
        try:
            persona_record = await storage.fetch_persona(context.persona_id)
        except StorageError:
            persona_record = None
    await _notify_webchat_sales_if_needed(
        context=context,
        trigger="close_lead",
        opportunity_id=tarjeta_id,
        resumen=necesidad,
        notes=notes,
        email=(persona_record or {}).get("correo") if persona_record else None,
        persona=persona_record,
        extra={"source": "lead_tool_close_lead"},
    )
    return {
        "status": "ok",
        "notes": notes,
        "necesidad_proposito": necesidad,
        "siguiente_accion": siguiente_accion,
        "tarjeta_id": tarjeta_id,
    }


async def _refresh_webchat_followup_state(context: ToolRuntimeContext) -> None:
    if not _is_webchat_context(context):
        return
    try:
        await webchat_followups.refresh_persona_followup_state(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            session_id=context.session_id,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.followup_refresh_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "error": str(exc),
            },
        )


async def _mark_webchat_delivery(context: ToolRuntimeContext, reason: str) -> None:
    if not _is_webchat_context(context):
        return
    try:
        await webchat_followups.mark_persona_information_delivered(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            reason=reason,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.followup_delivery_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "reason": reason,
                "error": str(exc),
            },
        )


async def _notify_webchat_sales_if_needed(
    *,
    context: ToolRuntimeContext,
    trigger: str,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    persona: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    channel = (context.channel or "").strip().lower()
    if channel == "whatsapp":
        try:
            from app.channels.whatsapp import tools as whatsapp_tools

            await whatsapp_tools._notify_sales_rep(
                context=context,
                trigger=trigger,
                persona=persona,
                opportunity_id=opportunity_id,
                resumen=resumen,
                notes=notes,
                email=email,
                extra=extra or {},
            )
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning(
                "lead_tools.notify_sales_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.persona_id,
                    "trigger": trigger,
                    "channel": channel,
                    "error": str(exc),
                },
            )
        return
    if not _is_webchat_context(context):
        return
    persona_record = persona
    if not persona_record:
        try:
            persona_record = await storage.fetch_persona(context.persona_id)
        except StorageError as exc:
            logger.warning(
                "lead_tools.notify_sales_contact_fetch_failed",
                extra={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.persona_id,
                    "trigger": trigger,
                    "error": str(exc),
                },
            )
            persona_record = None

    try:
        from app.channels.webchat import notifications as webchat_notifications

        await webchat_notifications.notify_sales_rep(
            context=context,
            trigger=trigger,
            persona=persona_record,
            opportunity_id=opportunity_id,
            resumen=resumen,
            notes=notes,
            email=email,
            extra=extra or {},
        )
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning(
            "lead_tools.notify_sales_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "trigger": trigger,
                "error": str(exc),
            },
        )


async def try_execute_lead_tool(
    name: str | None,
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any] | None:
    if not name:
        return None
    tool_name = name.strip()
    if tool_name == "set_full_name":
        full_name = await _resolve_full_name_from_context(
            context=context,
            proposed_full_name=_require_argument(arguments, "full_name"),
        )
        if not full_name:
            logger.warning(
                "lead_tools.set_full_name_ignored",
                extra={
                    "conversation_id": context.conversation_id,
                    "persona_id": context.persona_id,
                    "reason": "full_name_not_resolved",
                },
            )
            return {"status": "ignored", "reason": "full_name_not_resolved"}
        await storage.update_persona(context.persona_id, {"nombre_completo": full_name})
        await _refresh_webchat_followup_state(context)
        await _maybe_auto_close_lead(context=context, reason="set_full_name")
        return {"status": "ok", "full_name": full_name}

    if tool_name == "set_email":
        email = _require_argument(arguments, "email").lower()
        await storage.update_persona(context.persona_id, {"correo": email})
        await storage.capture_persona_lead_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        await _maybe_auto_close_lead(context=context, reason="set_email")
        return {"status": "ok", "email": email}

    if tool_name == "set_phone_number":
        phone_number = _require_argument(arguments, "phone_number")
        await storage.update_persona(context.persona_id, {"telefono_e164": phone_number})
        await storage.capture_persona_lead_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        await _maybe_auto_close_lead(context=context, reason="set_phone_number")
        return {"status": "ok", "phone_number": phone_number}

    if tool_name == "set_company_name":
        company_name = _require_argument(arguments, "company_name")
        await storage.update_persona(context.persona_id, {"company_name": company_name})
        await _refresh_webchat_followup_state(context)
        await _maybe_auto_close_lead(context=context, reason="set_company_name")
        return {"status": "ok", "company_name": company_name}

    if tool_name == "send_information_email":
        return await _handle_information_email(arguments, context)

    if tool_name == "list_assistant_documents":
        return await _handle_list_assistant_documents(arguments, context)

    if tool_name == "send_information_package":
        return await _handle_information_package(arguments, context)

    if tool_name == "close_lead":
        return await _complete_close_lead(arguments=arguments, context=context)
        notes = _require_argument(arguments, "notes")
        necesidad = _require_argument(arguments, "necesidad_proposito")
        siguiente_accion = str(arguments.get("siguiente_accion") or "").strip() or None
        tarjeta_id: str | None = None
        contact_ready = await webchat_followups.ensure_persona_ready_for_assignment(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
        )
        if contact_ready:
            try:
                tarjeta_id = await storage.ensure_persona_conversation_opportunity(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    channel=context.channel,
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.ensure_opportunity_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        await storage.update_persona(
            context.persona_id,
            {"notes": notes, "necesidad_proposito": necesidad},
        )
        try:
            await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
        except StorageError as exc:
            logger.warning(
                "lead_tools.conversation_update_failed",
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
                "lead_tools.insights_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
        if tarjeta_id:
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
            action_text = (siguiente_accion or "").lower()
            requested = any(
                token in action_text for token in ("cita", "agendar", "demo", "visita")
            )
            appointment_requested = _optional_bool_argument(arguments, "appointment_requested")
            accepted_questions = _optional_bool_argument(
                arguments, "accepted_answering_questions"
            )
            evasive_count = _optional_int_argument(arguments, "evasive_answers_count")
            response_time_bucket_raw = (
                str(arguments.get("response_time_bucket") or "").strip().lower()
            )
            response_time_bucket = (
                response_time_bucket_raw
                if response_time_bucket_raw in {"fast", "medium", "slow"}
                else None
            )
            scoring_events: dict[str, Any] = {
                "channel": context.channel or "webchat",
                "appointment_requested": (
                    appointment_requested
                    if appointment_requested is not None
                    else requested
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
                profiling_statuses_raw
                if isinstance(profiling_statuses_raw, dict)
                else None
            )
            profiling_reprompt_counts = (
                profiling_reprompt_counts_raw
                if isinstance(profiling_reprompt_counts_raw, dict)
                else None
            )
            try:
                await storage.apply_persona_lead_scoring(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    opportunity_id=str(tarjeta_id),
                    answers=scoring_answers,
                    events=scoring_events,
                    profiling_statuses=profiling_statuses,
                    profiling_reprompt_counts=profiling_reprompt_counts,
                    source="close_lead",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.scoring_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
            try:
                await storage.maybe_promote_prequalified_from_persona(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    opportunity_id=str(tarjeta_id),
                    channel=context.channel or "webchat",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.prequalified_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        await _refresh_webchat_followup_state(context)
        persona_record = None
        if context.persona_id:
            try:
                persona_record = await storage.fetch_persona(context.persona_id)
            except StorageError:
                persona_record = None
        if tarjeta_id:
            try:
                await storage.maybe_auto_name_persona_opportunity(
                    conversation_id=context.conversation_id,
                    persona_id=context.persona_id,
                    opportunity_id=str(tarjeta_id),
                    intent=necesidad,
                    summary=notes,
                    channel=context.channel or "webchat",
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.auto_name_failed",
                    extra={"conversation_id": context.conversation_id, "error": str(exc)},
                )
        await _notify_webchat_sales_if_needed(
            context=context,
            trigger="close_lead",
            opportunity_id=tarjeta_id,
            resumen=necesidad,
            notes=notes,
            email=(persona_record or {}).get("correo") if persona_record else None,
            persona=persona_record,
            extra={"source": "lead_tool_close_lead"},
        )
        return {
            "status": "ok",
            "notes": notes,
            "necesidad_proposito": necesidad,
            "siguiente_accion": siguiente_accion,
            "tarjeta_id": tarjeta_id,
        }

    if tool_name == "mark_contact_ready":
        ready = await webchat_followups.ensure_persona_ready_for_assignment(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
        )
        if not ready:
            raise ValueError("No hay teléfono ni correo para marcar contacto listo")
        _, oportunidad_id = await storage.capture_persona_lead_if_ready(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            channel=context.channel or "webchat",
        )
        await _refresh_webchat_followup_state(context)
        return {
            "status": "ok",
            "contact_ready": True,
            "oportunidad_id": oportunidad_id,
        }

    if tool_name == "restart_conversation_cycle":
        return await _handle_restart_conversation_cycle(arguments, context)

    return None


async def _handle_information_email(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    email_value = str(arguments.get("email") or "").strip()
    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    highlight_lines: list[str] = []
    highlights_raw = arguments.get("highlights")
    if isinstance(highlights_raw, list):
        for item in highlights_raw:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    highlight_lines.append(trimmed)

    resources: list[dict[str, str]] = []
    resources_raw = arguments.get("resources")
    if isinstance(resources_raw, list):
        for item in resources_raw:
            if isinstance(item, dict):
                label = str(item.get("label") or "").strip()
                url = str(item.get("url") or "").strip()
                if label and url:
                    resources.append({"label": label, "url": url})

    persona = await _fetch_persona(context.persona_id)
    persona_notes = None
    persona_need = None
    if persona:
        contact_name = str(persona.get("nombre_completo") or "").strip() or None
        contact_company = str(persona.get("company_name") or "").strip() or None
        contact_email = (
            str(persona.get("correo") or persona.get("correo_principal") or "").strip() or None
        )
        persona_notes = str(persona.get("notes") or "").strip() or None
        persona_need = str(persona.get("necesidad_proposito") or "").strip() or None
        if not full_name:
            full_name = contact_name
        if not company_name:
            company_name = contact_company
        if not summary:
            summary = persona_need or persona_notes
        if not email_value and contact_email:
            email_value = contact_email
        if contact_email and email_value and contact_email.lower() != email_value.lower():
            try:
                await storage.update_persona(
                    persona.get("id") or context.persona_id, {"correo": email_value.lower()}
                )
            except StorageError as exc:
                logger.warning(
                    "lead_tools.sync_contact_failed",
                    extra={
                        "contact_id": persona.get("id") or context.persona_id,
                        "error": str(exc),
                },
                )

    if not email_value:
        raise ValueError("email requerido")

    mail_org_uuid = _persona_org_uuid(persona)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)

    template_row: dict[str, Any] | None = None
    try:
        template_row = await storage.fetch_email_template(organizacion_id=str(mail_org_uuid))
    except StorageError as exc:
        logger.warning(
            "lead_tools.template_fetch_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    template_data = _resolve_information_email_template(template_row)

    include_highlights = bool(template_data.get("use_highlights", True))
    include_resources = bool(template_data.get("use_resources", True))

    if not include_highlights:
        highlight_lines = []
    elif not highlight_lines:
        highlight_lines = list(template_data["highlights"])

    if not include_resources:
        resources = []
    elif not resources:
        resources = [dict(resource) for resource in template_data["resources"]]

    email_result = await _send_information_email_with_documents(
        arguments=arguments,
        context=context,
        persona=persona,
        mail_settings=mail_settings,
        template_data=template_data,
        email_value=email_value,
        full_name=full_name,
        company_name=company_name,
        summary=summary,
        highlight_lines=highlight_lines,
        resources=resources,
        persona_notes=persona_notes,
        persona_need=persona_need,
    )
    return {
        "status": "sent",
        "email": email_value,
        "message_id": email_result["message_id"],
        "documents": email_result.get("documents", []),
    }


async def _handle_restart_conversation_cycle(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    """Crea un nuevo ciclo de conversación cuando el asistente detecta un cambio de tema."""
    reason = str(arguments.get("reason") or "").strip()
    channel = context.channel or "messenger"
    try:
        ensure_payload = await storage.ensure_persona_conversation_opportunity(
            conversation_id=context.conversation_id,
            persona_id=context.persona_id,
            channel=channel,
            force_new_opportunity_on_restart=True,
            include_restart_metadata=True,
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.restart_failed",
            extra={
                "conversation_id": context.conversation_id,
                "contact_id": context.persona_id,
                "error": str(exc),
            },
        )
        raise ValueError("No fue posible reiniciar la conversación en este momento.") from exc

    restart_created = False
    restart_sequence = 1
    oportunidad_id: str | None = None
    if isinstance(ensure_payload, dict):
        restart_created = bool(ensure_payload.get("restart_created"))
        restart_sequence = int(ensure_payload.get("restart_sequence") or 1)
        oportunidad_id = ensure_payload.get("oportunidad_id")
    else:
        oportunidad_id = ensure_payload

    if restart_created:
        logger.info(
            "lead_tools.restart_created",
            extra={
                "conversation_id": context.conversation_id,
                "reason": reason,
                "restart_sequence": restart_sequence,
            },
        )

    return {
        "status": "ok",
        "restart_created": restart_created,
        "restart_sequence": restart_sequence,
        "oportunidad_id": oportunidad_id,
        "reason": reason,
    }


async def _fetch_persona(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_persona(contact_id)
    except StorageError as exc:
        logger.warning(
            "lead_tools.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
    return None


def _persona_org_uuid(persona: dict[str, Any] | None) -> UUID | None:
    if not persona:
        return None
    org_value = webchat_service._extract_persona_org(persona)
    if not org_value:
        return None
    resolved = webchat_service._resolve_org_uuid(org_value)
    if not resolved:
        return None
    try:
        return UUID(resolved)
    except ValueError:
        return None


def _clone_information_email_template() -> dict[str, Any]:
    template = INFORMATION_EMAIL_DEFAULT_TEMPLATE
    return {
        "intro": template["intro"],
        "highlights": list(template["highlights"]),
        "resources": [dict(resource) for resource in template["resources"]],
        "closing": template["closing"],
        "use_summary": bool(template.get("use_summary", True)),
        "use_highlights": bool(template.get("use_highlights", True)),
        "use_resources": bool(template.get("use_resources", True)),
    }


def _resolve_information_email_template(custom: dict[str, Any] | None) -> dict[str, Any]:
    template = _clone_information_email_template()
    if not custom:
        return template

    intro = custom.get("intro")
    if isinstance(intro, str) and intro.strip():
        template["intro"] = intro.strip()

    closing = custom.get("closing")
    if isinstance(closing, str) and closing.strip():
        template["closing"] = closing.strip()

    salutation = custom.get("signature_salutation")
    if isinstance(salutation, str) and salutation.strip():
        template["signature_salutation"] = salutation.strip()

    signature_body = custom.get("signature")
    if isinstance(signature_body, str) and signature_body.strip():
        template["signature"] = signature_body.strip()

    highlights = custom.get("highlights")
    if isinstance(highlights, list):
        sanitized: list[str] = []
        for item in highlights:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    sanitized.append(trimmed)
        if sanitized:
            template["highlights"] = sanitized

    resources = custom.get("resources")
    if isinstance(resources, list):
        sanitized_resources: list[dict[str, str]] = []
        for entry in resources:
            if not isinstance(entry, dict):
                continue
            label = str(entry.get("label") or "").strip()
            url = str(entry.get("url") or "").strip()
            if label and url:
                sanitized_resources.append({"label": label, "url": url})
        if sanitized_resources:
            template["resources"] = sanitized_resources

    for key, default in (
        ("use_summary", True),
        ("use_highlights", True),
        ("use_resources", True),
    ):
        value = custom.get(key)
        if isinstance(value, bool):
            template[key] = value
        elif value in {"true", "false"}:
            template[key] = value == "true"

    return template


def _resolve_document_limit(arguments: dict[str, Any], *, default_limit: int) -> int:
    limit = _optional_int_argument(arguments, "assistant_document_limit")
    if limit is None:
        limit = _optional_int_argument(arguments, "document_limit")
    if limit is None:
        return max(1, default_limit)
    return max(1, min(limit, 10))


async def _resolve_assistant_documents_for_context(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
    *,
    channel_scope: str,
    default_limit: int,
) -> list[dict[str, Any]]:
    document_ids = _parse_string_list_argument(arguments, "assistant_document_ids")
    if not document_ids:
        document_ids = _parse_string_list_argument(arguments, "document_ids")
    category = str(
        arguments.get("assistant_document_category")
        or arguments.get("category")
        or ""
    ).strip() or None
    limit = _resolve_document_limit(arguments, default_limit=default_limit)
    documents = await document_delivery_service.resolve_documents_for_context(
        context=context,
        channel_scope=channel_scope,
        document_ids=document_ids or None,
        category=category,
        limit=limit,
    )
    return documents


async def _build_email_attachments_from_documents(
    documents: list[dict[str, Any]],
) -> list[dict[str, object]]:
    return await document_delivery_service.build_email_attachments(documents)


def _build_whatsapp_attachments_from_documents(
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return document_delivery_service.build_whatsapp_attachments(documents)


async def _handle_list_assistant_documents(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    channel_scope = str(arguments.get("channel_scope") or context.channel or "email").strip().lower()
    if channel_scope not in {"email", "whatsapp"}:
        channel_scope = "email"
    documents = await _resolve_assistant_documents_for_context(
        arguments,
        context,
        channel_scope=channel_scope,
        default_limit=10,
    )
    return {
        "status": "ok",
        "channel_scope": channel_scope,
        "documents": document_delivery_service.build_document_manifest(documents),
    }


async def _send_information_email_with_documents(
    *,
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
    persona: dict[str, Any] | None,
    mail_settings: Any,
    template_data: dict[str, Any],
    email_value: str,
    full_name: str | None,
    company_name: str | None,
    summary: str | None,
    highlight_lines: list[str],
    resources: list[dict[str, str]],
    persona_notes: str | None,
    persona_need: str | None,
) -> dict[str, Any]:
    subject_target = company_name or full_name
    subject = (
        f"Tal-IA · Información para {subject_target}"
        if subject_target
        else "Tal-IA · Información solicitada"
    )
    body_text = _build_information_email_body(
        template_data=template_data,
        full_name=full_name,
        summary=summary,
        highlights=highlight_lines,
        resources=resources,
    )
    documents = await _resolve_assistant_documents_for_context(
        arguments,
        context,
        channel_scope="email",
        default_limit=3,
    )
    attachments = await _build_email_attachments_from_documents(documents)
    logger.info(
        "lead_tools.info_email_documents",
        extra={
            "conversation_id": context.conversation_id,
            "persona_id": context.persona_id,
            "documents_count": len(documents),
            "attachments_count": len(attachments),
            "documents": [
                {
                    "id": str(document.get("id") or ""),
                    "title": document.get("title"),
                    "category": document.get("category"),
                    "channel_scope": document.get("channel_scope"),
                }
                for document in documents
                if isinstance(document, dict)
            ],
        },
    )
    if not attachments:
        attachments = None

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body_text,
            recipients=[email_value],
            body_html=None,
            attachments=attachments,
            mail_settings=mail_settings,
            provider_preference="smtp",
            flow="assistant_information_email",
        )
    except EmailSendError as exc:
        logger.error(
            "lead_tools.send_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
        raise ValueError(
            "No se pudo enviar el correo en este momento. Inténtalo nuevamente más tarde."
        ) from exc
    except Exception as exc:  # pragma: no cover - errores inesperados
        logger.exception(
            "lead_tools.send_unexpected",
            extra={"conversation_id": context.conversation_id},
        )
        raise ValueError("Ocurrió un error inesperado al enviar el correo.") from exc

    try:
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=summary or persona_notes,
            intencion=persona_need,
            siguiente_accion="informacion_enviada_email",
        )
    except StorageError as exc:
        logger.warning(
            "lead_tools.insights_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    await _mark_webchat_delivery(context, reason="information_email")
    await _notify_webchat_sales_if_needed(
        context=context,
        trigger="information_email",
        opportunity_id=None,
        resumen=summary or persona_need,
        notes=persona_notes,
        email=email_value,
        persona=persona,
        extra={
            "source": "lead_tool_information_email",
            "mail_message_id": message_id,
            "assistant_documents": document_delivery_service.build_document_manifest(documents),
        },
    )

    return {
        "status": "sent",
        "email": email_value,
        "message_id": message_id,
        "documents": document_delivery_service.build_document_manifest(documents),
    }


async def _send_whatsapp_information_documents(
    *,
    context: ToolRuntimeContext,
    persona: dict[str, Any] | None,
    documents: list[dict[str, Any]],
    body_text: str,
) -> list[dict[str, Any]]:
    from app.channels.whatsapp import service as whatsapp_service

    persona_phone = None
    if persona:
        persona_phone = (
            str(persona.get("telefono_e164") or persona.get("telefono") or "").strip() or None
        )
    if not persona_phone:
        raise ValueError("No pude resolver el teléfono del contacto para enviar WhatsApp.")

    attachments = _build_whatsapp_attachments_from_documents(documents)
    if not attachments:
        raise ValueError("No hay PDF disponibles para enviar por WhatsApp.")

    results: list[dict[str, Any]] = []
    # WhatsApp/Meta suele aceptar un documento por mensaje; enviamos uno por uno.
    for index, attachment in enumerate(attachments):
        caption = body_text if index == 0 else None
        send_result = await whatsapp_service.send_manual_message(
            to_number=persona_phone,
            body=caption,
            attachments=[attachment],
            organizacion_id=context.organizacion_id,
        )
        results.append(
            {
                "sid": send_result.sid,
                "status": send_result.status,
                "provider": send_result.provider,
                "filename": attachment.get("name"),
                "url": attachment.get("url"),
            }
        )
    return results


def _build_information_whatsapp_body(
    *,
    full_name: str | None,
    company_name: str | None,
    summary: str | None,
    document_count: int,
) -> str:
    greeting = f"Hola {full_name}," if full_name else "Hola,"
    company_fragment = f" sobre {company_name}" if company_name else ""
    lines = [
        greeting,
        "",
        f"Te comparto la información solicitada{company_fragment} por aquí.",
    ]
    if summary:
        lines.append("La información está enfocada en tu caso y te la dejo resumida en el PDF.")
    if document_count > 1:
        lines.append(f"Te envio {document_count} documentos para que los revises con calma.")
    lines.extend(
        [
            "",
            "Si también quieres que te la mande por correo, te la envío enseguida.",
        ]
    )
    return "\n".join(lines)


async def _handle_information_package(
    arguments: dict[str, Any],
    context: ToolRuntimeContext,
) -> dict[str, Any]:
    channels = document_delivery_service.parse_delivery_channels(
        arguments,
        default_channel=str(context.channel or "email"),
    )
    persona = await _fetch_persona(context.persona_id)
    persona_notes = None
    persona_need = None
    if persona:
        persona_notes = str(persona.get("notes") or "").strip() or None
        persona_need = str(persona.get("necesidad_proposito") or "").strip() or None

    full_name = str(arguments.get("full_name") or "").strip() or None
    company_name = str(arguments.get("company_name") or "").strip() or None
    summary = str(arguments.get("summary") or "").strip() or None

    if persona:
        if not full_name:
            full_name = str(persona.get("nombre_completo") or "").strip() or None
        if not company_name:
            company_name = str(persona.get("company_name") or "").strip() or None
        if not summary:
            summary = persona_need or persona_notes

    mail_org_uuid = _persona_org_uuid(persona)
    mail_settings = await tenant_runtime.get_mail_runtime_settings(organizacion_id=mail_org_uuid)
    template_row: dict[str, Any] | None = None
    try:
        template_row = await storage.fetch_email_template(organizacion_id=str(mail_org_uuid))
    except StorageError as exc:
        logger.warning(
            "lead_tools.template_fetch_failed",
            extra={"conversation_id": context.conversation_id, "error": str(exc)},
        )
    template_data = _resolve_information_email_template(template_row)

    include_highlights = bool(template_data.get("use_highlights", True))
    include_resources = bool(template_data.get("use_resources", True))
    highlight_lines = []
    resources: list[dict[str, str]] = []
    highlights_raw = arguments.get("highlights")
    if isinstance(highlights_raw, list):
        for item in highlights_raw:
            if isinstance(item, str) and item.strip():
                highlight_lines.append(item.strip())
    resources_raw = arguments.get("resources")
    if isinstance(resources_raw, list):
        for item in resources_raw:
            if isinstance(item, dict):
                label = str(item.get("label") or "").strip()
                url = str(item.get("url") or "").strip()
                if label and url:
                    resources.append({"label": label, "url": url})
    if include_highlights and not highlight_lines:
        highlight_lines = list(template_data["highlights"])
    if include_resources and not resources:
        resources = [dict(resource) for resource in template_data["resources"]]

    result: dict[str, Any] = {
        "status": "ok",
        "channels": channels,
    }

    if "email" in channels:
        email_value = _require_argument(arguments, "email")
        email_result = await _send_information_email_with_documents(
            arguments=arguments,
            context=context,
            persona=persona,
            mail_settings=mail_settings,
            template_data=template_data,
            email_value=email_value,
            full_name=full_name,
            company_name=company_name,
            summary=summary,
            highlight_lines=highlight_lines,
            resources=resources,
            persona_notes=persona_notes,
            persona_need=persona_need,
        )
        result["email"] = email_result
        result["documents"] = email_result.get("documents", [])

    if "whatsapp" in channels:
        whatsapp_documents = await _resolve_assistant_documents_for_context(
            arguments,
            context,
            channel_scope="whatsapp",
            default_limit=3,
        )
        whatsapp_body = _build_information_whatsapp_body(
            full_name=full_name,
            company_name=company_name,
            summary=summary,
            document_count=len(whatsapp_documents),
        )
        whatsapp_results = await _send_whatsapp_information_documents(
            context=context,
            persona=persona,
            documents=whatsapp_documents,
            body_text=whatsapp_body,
        )
        result["whatsapp"] = whatsapp_results
        if "documents" not in result:
            result["documents"] = document_delivery_service.build_document_manifest(
                whatsapp_documents
            )

    return result


def _build_information_email_body(
    *,
    template_data: dict[str, Any],
    full_name: str | None,
    summary: str | None,
    highlights: list[str],
    resources: list[dict[str, str]],
) -> str:
    greeting = f"Hola {full_name}," if full_name else "Hola,"
    body_lines = [greeting, "", template_data["intro"]]
    if template_data.get("use_summary", True) and summary:
        body_lines.extend(["", summary])
    if template_data.get("use_highlights", True) and highlights:
        body_lines.append("")
        body_lines.append("Puntos clave para tu equipo:")
        for item in highlights:
            body_lines.append(f"- {item}")
    if template_data.get("use_resources", True) and resources:
        body_lines.append("")
        body_lines.append("Recursos para profundizar:")
        for resource in resources:
            body_lines.append(f"- {resource['label']}: {resource['url']}")
    body_lines.extend(["", template_data["closing"], ""])

    salutation_text = template_data.get("signature_salutation") or "Saludos,"
    if isinstance(salutation_text, str) and salutation_text.strip():
        body_lines.append(salutation_text.strip())

    signature_text = template_data.get("signature") or ""
    signature_lines = []
    if isinstance(signature_text, str):
        signature_lines = [line.strip() for line in signature_text.splitlines() if line.strip()]
    if not signature_lines:
        signature_lines = ["Equipo Geoactiv · Tal-IA"]
    body_lines.extend(signature_lines)
    return "\n".join(body_lines)
