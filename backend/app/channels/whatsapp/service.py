"""Servicios específicos para WhatsApp via Twilio."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping
from uuid import UUID

from fastapi import HTTPException

from app.assistants.manager import AssistantConfig
from app.assistants.runtime import build_prompt_payload, resolve_assistant_spec
from app.assistants.tool_runtime import (
    ToolRuntimeContext,
    classify_runtime_error,
    run_tool_loop,
)
from app.channels.whatsapp import tools as whatsapp_tools
from app.channels.whatsapp.routing import resolve_whatsapp_organizacion
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import conversation_summary, leads_geo, storage
from app.services import openai as openai_service
from app.services.prospeccion_whatsapp_atribucion import resolve_first_matching_rule
from app.services.context_formatter import build_crm_context_lines
from app.services import tenant_runtime
from app.services import twilio as twilio_service
from app.services.metrics import metrics
from app.services.prospeccion_progress import progress_hub
from app.services.storage import StorageError
from app.channels.booking_context import build_booking_context_message
from app.services.catalog_context import build_catalog_context
from app.services.prospeccion_auto_promoter import auto_promote_prospecto
from app.services.time_utils import get_current_time_reference

from . import schemas

logger = get_logger("app.channels.whatsapp")

DEFAULT_FALLBACK = (
    "Tu mensaje quedó registrado, pero tuve un problema momentáneo al responder. "
    "Intentemos nuevamente en unos instantes."
)

_BOOKING_CONFIRMATION_HINTS: tuple[str, ...] = (
    "confirmo tu cita",
    "confirmarte tu cita",
    "te confirmo tu cita",
    "cita confirmada",
    "visita confirmada",
    "tu visita está agendada",
    "tu visita esta agendada",
    "cita agendada",
    "visita agendada",
    "quedó agendada",
    "quedo agendada",
    "te espero el",
    "te esperamos el",
    "ya tengo todo preparado para tu cita",
    "queda todo listo",
    "quedo todo listo",
    "tu cita esta lista",
    "tu cita está lista",
    "quedo pendiente para tu visita",
    "quedó pendiente para tu visita",
    "visita mañana a las",
    "visita para mañana a las",
)

_DETAILED_REPLY_HINTS: tuple[str, ...] = (
    "detalles",
    "ficha",
    "caracteristicas",
    "características",
    "completo",
    "completa",
    "toda la info",
    "toda la información",
    "todas las opciones",
    "lista",
    "comparar",
    "comparación",
    "cotización",
    "cotizacion",
)
_DEFAULT_WHATSAPP_MAX_CHARS = 500
_MAX_PROSPECCION_REPLY_PREVIEW_CHARS = 500
_PROSPECCION_REPLY_ENVIO_SOURCE_STATES = {"pendiente", "procesando", "enviado", "entregado", "leido", "completado"}
_WHATSAPP_ATTRIB_CONTACT_DEDUP_MINUTES = 60 * 24


@dataclass(slots=True)
class AssistantReply:
    """Respuesta del asistente junto con metadatos para persistencia."""

    text: str | None
    openai_conversation_id: str | None
    response_id: str | None


@dataclass(slots=True)
class TwilioSendResult:
    """Resultado resumido del envío a través de Twilio."""

    sid: str | None
    status: str | None
    error: str | None = None
    from_number: str | None = None


def _trim_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


async def _sync_inbound_to_prospeccion_log(
    *,
    repo: CRMRepository,
    contact_id: str,
    message: schemas.WhatsAppIncomingMessage,
) -> bool:
    """Registra respuesta entrante en bitácora de prospección cuando aplica."""

    try:
        contact_uuid = UUID(contact_id)
    except (TypeError, ValueError):
        return False

    try:
        prospecto = await repo.worker_find_prospecto_by_contacto(contacto_id=contact_uuid)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.prospeccion_reply_lookup_failed",
            contact_id=contact_id,
            error=str(exc),
        )
        return False
    envio: dict[str, Any] | None = None
    if not prospecto:
        normalized_from = _normalize_phone_number(message.from_number)
        candidates: list[str] = []
        if normalized_from:
            candidates.append(normalized_from)
            if normalized_from.startswith("+"):
                candidates.append(normalized_from[1:])
        for phone_candidate in candidates:
            try:
                envio = await repo.worker_get_latest_envio_by_phone(
                    phone_e164=phone_candidate,
                    canal="whatsapp",
                )
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "whatsapp.prospeccion_reply_envio_phone_lookup_failed",
                    contact_id=contact_id,
                    phone=phone_candidate,
                    error=str(exc),
                )
                continue
            if not envio:
                continue
            envio_prospecto_id = envio.get("prospecto_id")
            if not envio_prospecto_id:
                continue
            prospecto = {"id": envio_prospecto_id}
            log_event(
                logger,
                "whatsapp.prospeccion_reply_context_resolved_by_phone",
                contact_id=contact_id,
                phone=phone_candidate,
                prospecto_id=str(envio_prospecto_id),
                envio_id=str(envio.get("id")) if envio.get("id") else None,
            )
            break
    if not prospecto:
        normalized_from = _normalize_phone_number(message.from_number)
        phone_candidates: list[str] = []
        if normalized_from:
            phone_candidates.append(normalized_from)
            if normalized_from.startswith("+"):
                phone_candidates.append(normalized_from[1:])
        for phone_candidate in phone_candidates:
            try:
                prospecto = await repo.worker_find_latest_prospecto_by_phone(phone=phone_candidate)
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "whatsapp.prospeccion_reply_prospect_phone_lookup_failed",
                    contact_id=contact_id,
                    phone=phone_candidate,
                    error=str(exc),
                )
                continue
            if not prospecto:
                continue
            log_event(
                logger,
                "whatsapp.prospeccion_reply_context_resolved_by_prospect_phone",
                contact_id=contact_id,
                phone=phone_candidate,
                prospecto_id=str(prospecto.get("id")) if prospecto.get("id") else None,
            )
            break
    if not prospecto:
        return False

    prospecto_id = prospecto.get("id")
    if not prospecto_id:
        return False
    try:
        prospecto_uuid = UUID(str(prospecto_id))
    except (TypeError, ValueError):
        return False

    if envio is None:
        try:
            envio = await repo.worker_get_latest_envio_for_prospecto(
                prospecto_id=prospecto_uuid,
                canal="whatsapp",
            )
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "whatsapp.prospeccion_reply_envio_lookup_failed",
                prospecto_id=str(prospecto_id),
                error=str(exc),
            )

    envio_id_value = envio.get("id") if envio else None
    batch_id_value = envio.get("batch_id") if envio else None
    body_text = _trim_text(message.body)
    if body_text and len(body_text) > _MAX_PROSPECCION_REPLY_PREVIEW_CHARS:
        body_text = f"{body_text[:_MAX_PROSPECCION_REPLY_PREVIEW_CHARS]}..."

    if envio_id_value:
        try:
            envio_uuid = UUID(str(envio_id_value))
        except (TypeError, ValueError):
            envio_uuid = None
        if envio_uuid:
            envio_estado = _trim_text(envio.get("estado")) if isinstance(envio, dict) else None
            envio_estado_norm = (envio_estado or "").lower()
            if envio_estado_norm in _PROSPECCION_REPLY_ENVIO_SOURCE_STATES:
                current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
                update_payload = {
                    "estado": "respondido",
                    "detalle": {
                        **current_detalle,
                        "reply_inbound_at": datetime.now(timezone.utc).isoformat(),
                        "reply_message_sid": _trim_text(message.message_sid),
                        "reply_preview": body_text,
                    },
                    "error": None,
                    "procesado_en": datetime.now(timezone.utc).isoformat(),
                }
                try:
                    await repo.worker_complete_envio(envio_id=envio_uuid, payload=update_payload)
                except CRMRepositoryError as exc:
                    log_event(
                        logger,
                        "whatsapp.prospeccion_reply_envio_update_failed",
                        envio_id=str(envio_uuid),
                        error=str(exc),
                    )

    log_entry: dict[str, Any] = {
        "prospecto_id": str(prospecto_uuid),
        "canal": "whatsapp",
        "accion": "reply_inbound",
        "estado": "respondido",
        "detalle": {
            "action": "reply_inbound",
            "direction": "incoming",
            "respondio": True,
            "message_sid": _trim_text(message.message_sid),
            "wa_id": _trim_text(message.wa_id),
            "from_number": _trim_text(message.from_number),
            "body": body_text,
        },
    }
    organizacion_id_value = None
    if envio and envio.get("organizacion_id"):
        organizacion_id_value = envio.get("organizacion_id")
    elif isinstance(prospecto, dict) and prospecto.get("organizacion_id"):
        organizacion_id_value = prospecto.get("organizacion_id")
    if organizacion_id_value:
        log_entry["organizacion_id"] = str(organizacion_id_value)
    if envio_id_value:
        log_entry["envio_id"] = str(envio_id_value)
    if batch_id_value:
        log_entry["batch_id"] = str(batch_id_value)
    try:
        await repo.worker_insert_contact_logs([log_entry])
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.prospeccion_reply_log_failed",
            prospecto_id=str(prospecto_uuid),
            envio_id=str(envio_id_value) if envio_id_value else None,
            error=str(exc),
        )
        return True

    if batch_id_value:
        try:
            await progress_hub.publish(
                str(batch_id_value),
                {
                    "type": "reply",
                    "batch_id": str(batch_id_value),
                    "envio_id": str(envio_id_value) if envio_id_value else None,
                    "prospecto_id": str(prospecto_uuid),
                    "canal": "whatsapp",
                },
            )
            if envio_id_value:
                await progress_hub.publish(
                    str(batch_id_value),
                    {
                        "type": "envio",
                        "batch_id": str(batch_id_value),
                        "envio_id": str(envio_id_value),
                        "estado": "respondido",
                    },
                )
        except Exception as exc:  # pragma: no cover - SSE best effort
            log_event(
                logger,
                "whatsapp.prospeccion_reply_publish_failed",
                batch_id=str(batch_id_value),
                prospecto_id=str(prospecto_uuid),
                error=str(exc),
            )
    return True


async def _resolve_prospeccion_prospecto_id(
    *,
    repo: CRMRepository,
    contact_id: str,
    message: schemas.WhatsAppIncomingMessage,
) -> UUID | None:
    """Resuelve prospecto relacionado al inbound usando contacto o teléfono."""
    try:
        contact_uuid = UUID(contact_id)
    except (TypeError, ValueError):
        contact_uuid = None
    if contact_uuid:
        try:
            by_contact = await repo.worker_find_prospecto_by_contacto(contacto_id=contact_uuid)
        except CRMRepositoryError:
            by_contact = None
        prospecto_id = (by_contact or {}).get("id") if isinstance(by_contact, dict) else None
        try:
            return UUID(str(prospecto_id))
        except (TypeError, ValueError):
            pass
    normalized_from = _normalize_phone_number(message.from_number)
    if not normalized_from:
        return None
    candidates: list[str] = [normalized_from]
    if normalized_from.startswith("+"):
        candidates.append(normalized_from[1:])
    for phone_candidate in candidates:
        try:
            by_phone = await repo.worker_find_latest_prospecto_by_phone(phone=phone_candidate)
        except CRMRepositoryError:
            continue
        prospecto_id = (by_phone or {}).get("id") if isinstance(by_phone, dict) else None
        try:
            return UUID(str(prospecto_id))
        except (TypeError, ValueError):
            continue
    return None


async def _maybe_apply_publicidad_whatsapp_attribution(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    conversation_id: str,
    contact_id: str,
    message: schemas.WhatsAppIncomingMessage,
) -> dict[str, Any] | None:
    """Evalúa reglas de atribución publicitaria y persiste evento en primer inbound."""

    phrase_original = _trim_text(message.body)
    if not phrase_original:
        return None

    try:
        recent_messages = await storage.fetch_recent_messages(conversation_id=conversation_id, limit=2)
    except StorageError:
        recent_messages = []
    if len(recent_messages) > 1:
        return None

    try:
        contact_uuid = UUID(contact_id)
    except (TypeError, ValueError):
        return None

    try:
        active_rules = await repo.list_active_whatsapp_atribucion_reglas(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.publicidad_atribucion_rules_fetch_failed",
            conversation_id=conversation_id,
            contact_id=contact_id,
            error=str(exc),
        )
        return None
    if not active_rules:
        return None

    matched_rule, applied_match_type, normalized_phrase = resolve_first_matching_rule(
        incoming_text=phrase_original,
        rules=active_rules,
    )
    if not matched_rule:
        log_event(
            logger,
            "whatsapp.publicidad_atribucion_no_match",
            conversation_id=conversation_id,
            contact_id=contact_id,
            phrase=normalized_phrase,
        )
        return None

    since_iso = (datetime.now(timezone.utc) - timedelta(minutes=_WHATSAPP_ATTRIB_CONTACT_DEDUP_MINUTES)).isoformat()
    try:
        recent_event = await repo.worker_get_recent_whatsapp_atribucion_event_for_contact(
            organizacion_id=organizacion_id,
            contacto_id=contact_uuid,
            since_iso=since_iso,
        )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.publicidad_atribucion_recent_lookup_failed",
            conversation_id=conversation_id,
            contact_id=contact_id,
            error=str(exc),
        )
        recent_event = None
    if isinstance(recent_event, dict):
        recent_conversation_id = _trim_text(recent_event.get("conversacion_id"))
        if recent_conversation_id and recent_conversation_id != conversation_id:
            log_event(
                logger,
                "whatsapp.publicidad_atribucion_skipped_recent_contact_window",
                conversation_id=conversation_id,
                contact_id=contact_id,
                recent_conversation_id=recent_conversation_id,
                window_minutes=_WHATSAPP_ATTRIB_CONTACT_DEDUP_MINUTES,
            )
            return None

    event_payload = {
        "organizacion_id": str(organizacion_id),
        "regla_id": _trim_text(matched_rule.get("id")),
        "conversacion_id": conversation_id,
        "contacto_id": contact_id,
        "mensaje_id": _trim_text(message.message_sid),
        "frase_original": phrase_original,
        "frase_normalizada": normalized_phrase,
        "tipo_match": applied_match_type,
        "canal_publicitario": _trim_text(matched_rule.get("canal_publicitario")),
        "campana_publicitaria": _trim_text(matched_rule.get("campana_publicitaria")),
        "adset": _trim_text(matched_rule.get("adset")),
        "anuncio": _trim_text(matched_rule.get("anuncio")),
        "metadata": {
            "source": "whatsapp_inbound",
            "rule_name": _trim_text(matched_rule.get("nombre_regla")),
            "rule_priority": matched_rule.get("prioridad"),
        },
    }
    event_payload = {k: v for k, v in event_payload.items() if v is not None}
    try:
        created_event = await repo.worker_create_whatsapp_atribucion_event(
            organizacion_id=organizacion_id,
            payload=event_payload,
        )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.publicidad_atribucion_event_create_failed",
            conversation_id=conversation_id,
            contact_id=contact_id,
            error=str(exc),
        )
        return None
    if not created_event:
        return None

    try:
        contact_row = await repo.get_contact_by_id(contact_id=contact_id)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.publicidad_atribucion_contact_fetch_failed",
            conversation_id=conversation_id,
            contact_id=contact_id,
            error=str(exc),
        )
        contact_row = None
    if isinstance(contact_row, dict):
        contact_data = contact_row.get("contacto_datos") if isinstance(contact_row.get("contacto_datos"), dict) else {}
        patched_contact_data = {
            **contact_data,
            "publicidad_whatsapp_atribucion": {
                "source": "publicidad_whatsapp",
                "regla_id": _trim_text(created_event.get("regla_id")) or _trim_text(matched_rule.get("id")),
                "regla_nombre": _trim_text(matched_rule.get("nombre_regla")),
                "canal_publicitario": event_payload.get("canal_publicitario"),
                "campana_publicitaria": event_payload.get("campana_publicitaria"),
                "adset": event_payload.get("adset"),
                "anuncio": event_payload.get("anuncio"),
                "tipo_match": applied_match_type,
                "frase_normalizada": normalized_phrase,
                "conversacion_id": conversation_id,
                "atribuido_en": _trim_text(created_event.get("creado_en")) or datetime.now(timezone.utc).isoformat(),
            },
        }
        patch_payload: dict[str, Any] = {"contacto_datos": patched_contact_data}
        current_origen = _trim_text(contact_row.get("origen"))
        if (current_origen or "").lower() in {"", "whatsapp", "prospeccion"}:
            patch_payload["origen"] = "publicidad_whatsapp"
        try:
            await repo.update_contact_by_id(contact_id=contact_id, patch=patch_payload)
        except CRMRepositoryError as exc:
            log_event(
                logger,
                "whatsapp.publicidad_atribucion_contact_update_failed",
                conversation_id=conversation_id,
                contact_id=contact_id,
                error=str(exc),
            )

    log_event(
        logger,
        "whatsapp.publicidad_atribucion_applied",
        conversation_id=conversation_id,
        contact_id=contact_id,
        regla_id=_trim_text(matched_rule.get("id")),
        canal_publicitario=event_payload.get("canal_publicitario"),
        tipo_match=applied_match_type,
    )
    return created_event


def _looks_like_booking_confirmation(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in _BOOKING_CONFIRMATION_HINTS)


def _wants_detailed_reply(text: str | None) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in _DETAILED_REPLY_HINTS)


def _compact_whatsapp_reply(text: str | None, max_chars: int = _DEFAULT_WHATSAPP_MAX_CHARS) -> str:
    compact = " ".join(str(text or "").split())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 1].rstrip() + "…"


def _is_unknown_prompt_variable_error(exc: Exception) -> bool:
    text = str(exc or "").lower()
    return "prompt_variable_unknown" in text or "unknown prompt variables" in text


async def _guard_booking_confirmation_claim(
    *,
    conversation_id: str,
    reply_text: str,
    contact: Mapping[str, Any] | None = None,
    opportunity_id: str | None = None,
) -> str:
    if not _looks_like_booking_confirmation(reply_text):
        return reply_text
    try:
        booking = await storage.fetch_calendar_booking_by_conversation(conversation_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.booking_guard_lookup_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return reply_text
    status = str((booking or {}).get("status") or "").strip().lower()
    if booking and status in {"confirmed", "reprogrammed"}:
        return reply_text
    log_event(
        logger,
        "whatsapp.booking_guard_blocked_false_confirmation",
        conversation_id=conversation_id,
        booking_status=status or None,
    )
    try:
        resolved_contact = dict(contact or {})
        resolved_opportunity_id = str(opportunity_id or "").strip() or None
        if (not resolved_contact) or not resolved_opportunity_id:
            conversation_meta = await storage.fetch_conversation(conversation_id)
            if not resolved_contact:
                contact_id = str(conversation_meta.get("contact_id") or "").strip()
                if contact_id:
                    resolved_contact = await storage.fetch_contact(contact_id)
            if not resolved_opportunity_id and resolved_contact:
                resolved_opportunity_id = await storage.ensure_conversation_opportunity(
                    conversation_id=conversation_id,
                    contact_id=str(resolved_contact.get("id") or ""),
                    channel="whatsapp",
                )
        if resolved_contact and resolved_opportunity_id:
            prefilter_status = await whatsapp_tools._has_prefilter_for_schedule(
                contact=resolved_contact,
                opportunity_id=resolved_opportunity_id,
                conversation_id=conversation_id,
            )
            missing_fields = [
                str(item).strip()
                for item in (prefilter_status.get("missing_fields") or [])
                if str(item).strip()
            ]
            if missing_fields:
                questions = prefilter_status.get("questions") or {}
                if isinstance(questions, Mapping):
                    missing_field = missing_fields[0]
                    question_text = str(
                        questions.get(missing_field)
                        or ""
                    ).strip()
                    if question_text:
                        return f"Para confirmar tu cita, solo falta este dato: {question_text}"
    except Exception as exc:
        logger.warning(
            "whatsapp.booking_guard_prefilter_lookup_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
    return (
        "Para confirmar tu cita, aún falta un dato breve. "
        "Te hago una pregunta rápida para continuar."
    )


async def handle_incoming_message(
    message: schemas.WhatsAppIncomingMessage,
    source: str = "webhook",
) -> None:
    """Procesa un mensaje entrante desde Twilio y delega la respuesta a OpenAI."""
    log_event(
        logger,
        "whatsapp.incoming_message_received",
        message_sid=message.message_sid,
        source=source,
    )

    if await _maybe_handle_sales_acknowledgement(message):
        return

    if message.message_sid:
        try:
            existing_message = await storage.fetch_message_by_twilio_sid(message.message_sid)
        except StorageError as exc:
            logger.warning(
                "whatsapp.fetch_message_by_sid_failed",
                extra={"message_sid": message.message_sid, "error": str(exc)},
            )
        else:
            if existing_message and (existing_message.get("direccion") == "entrante"):
                log_event(
                    logger,
                    "whatsapp.duplicate_incoming_ignored",
                    message_sid=message.message_sid,
                    source=source,
                )
                return

    normalized_from = _normalize_phone_number(message.from_number)
    recipient_number = _normalize_phone_number(message.to_number)
    organizacion_hint = await resolve_whatsapp_organizacion(to_number=recipient_number)

    if not organizacion_hint:
        logger.error(
            "whatsapp.organizacion_unresolved",
            extra={"to_number": recipient_number, "wa_id": message.wa_id},
        )
        raise HTTPException(status_code=500, detail="No se pudo enrutar el mensaje entrante")

    org_uuid = _parse_org_uuid(organizacion_hint)
    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)
    try:
        registration = await storage.register_whatsapp_message(
            direction="entrante",
            wa_id=message.wa_id,
            phone_e164=normalized_from,
            body=message.body,
            message_sid=message.message_sid,
            profile_name=message.profile_name,
            inactivity_minutes=whatsapp_settings.inactivity_minutes,
            metadata=message.metadata(),
            attachments=message.attachments_as_dict(),
            webhook_payload=message.raw_payload,
            organizacion_id=organizacion_hint,
        )
    except StorageError as exc:
        logger.exception(
            "whatsapp.register_incoming_failed",
            extra={
                "error": str(exc),
                "resolved_organizacion_id": organizacion_hint,
                "to_number": recipient_number,
                "from_number": normalized_from,
            },
        )
        raise HTTPException(status_code=502, detail="whatsapp_register_failed") from exc

    conversation_id = str(registration.get("conversation_id") or "")
    contact_id = str(registration.get("contact_id") or "")
    openai_conversation_id = registration.get("openai_conversation_id")
    org_uuid = _parse_org_uuid(organizacion_hint)


    if conversation_id:
        try:
            await storage.update_conversation(conversation_id, {"estado": "abierta"})
        except StorageError as exc:
            logger.warning(
                "whatsapp.conversation_reopen_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )

    if not conversation_id or not contact_id:
        logger.error(
            "whatsapp.registration_missing_ids",
            extra={"conversation_id": conversation_id},
        )
        return

    try:
        repo = CRMRepository()
    except CRMRepositoryError as exc:
        log_event(logger, "whatsapp.prospeccion_reply_repo_error", error=str(exc))
        repo = None
    is_prospeccion_context = False
    if repo:
        is_prospeccion_context = await _sync_inbound_to_prospeccion_log(
            repo=repo,
            contact_id=contact_id,
            message=message,
        )
        await _maybe_apply_publicidad_whatsapp_attribution(
            repo=repo,
            organizacion_id=org_uuid,
            conversation_id=conversation_id,
            contact_id=contact_id,
            message=message,
        )

    restart_context: dict[str, Any] | None = None
    opportunity_ref: str | None = None
    ensure_contact_id = contact_id
    if repo:
        prospecto_uuid = await _resolve_prospeccion_prospecto_id(
            repo=repo,
            contact_id=contact_id,
            message=message,
        )
        if prospecto_uuid:
            try:
                prospecto_opportunity = await repo.worker_find_opportunity_by_prospecto(
                    organizacion_id=org_uuid,
                    prospecto_id=prospecto_uuid,
                )
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "whatsapp.prospeccion_existing_opportunity_lookup_failed",
                    prospecto_id=str(prospecto_uuid),
                    error=str(exc),
                )
                prospecto_opportunity = None
            if isinstance(prospecto_opportunity, dict):
                opportunity_ref = str(prospecto_opportunity.get("id") or "").strip() or None
                prospect_contact_id = str(
                    prospecto_opportunity.get("contacto_principal_id") or ""
                ).strip()
                if prospect_contact_id:
                    ensure_contact_id = prospect_contact_id
                    log_event(
                        logger,
                        "whatsapp.prospeccion_reuse_opportunity_contact",
                        conversation_id=conversation_id,
                        prospecto_id=str(prospecto_uuid),
                        opportunity_id=opportunity_ref,
                        contact_id=prospect_contact_id,
                        inbound_contact_id=contact_id,
                    )
    try:
        ensure_payload = await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=ensure_contact_id,
            channel="whatsapp",
            include_restart_metadata=True,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.ensure_opportunity_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
    else:
        if isinstance(ensure_payload, dict):
            restart_context = ensure_payload
            opportunity_ref = str(ensure_payload.get("oportunidad_id") or "").strip() or None
        else:
            opportunity_ref = str(ensure_payload or "").strip() or None
            restart_context = {
                "oportunidad_id": ensure_payload,
                "restart_created": False,
                "restart_sequence": 1,
            }

    contact_record = await _maybe_update_contact_location(contact_id)

    restart_created = bool(restart_context and restart_context.get("restart_created"))
    if restart_created:
        restart_sequence = int(restart_context.get("restart_sequence") or 1)
        opportunity_ref = str(restart_context.get("oportunidad_id") or opportunity_ref or "").strip() or None
        context = ToolRuntimeContext(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel="whatsapp",
        )
        resumen_text = f"El contacto retomó la conversación (ciclo #{restart_sequence})."
        notes_text = message.body or "El contacto reactivó la conversación."
        try:
            await whatsapp_tools._notify_sales_rep(
                context=context,
                trigger="restart_conversation",
                contact=contact_record,
                opportunity_id=opportunity_ref,
                resumen=resumen_text,
                notes=notes_text,
                email=None,
                extra={"restart_sequence": restart_sequence},
            )
        except Exception as exc:  # pragma: no cover - defensivo
            logger.warning(
                "whatsapp.restart_notify_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )

    try:
        conversation_meta = await storage.fetch_conversation(conversation_id)
    except StorageError as exc:
        logger.exception(
            "whatsapp.fetch_conversation_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return

    if conversation_meta.get("manual_override"):
        log_event(
            logger,
            "whatsapp.manual_override_active",
            conversation_id=conversation_id,
        )
        return

    previous_response_id = conversation_meta.get("last_response_id")
    if not openai_conversation_id:
        openai_conversation_id = conversation_meta.get("openai_conversation_id")

    catalog_context = None
    if settings.catalog_context_autoload:
        catalog_context = await build_catalog_context(
            organizacion_hint,
            message.body or "",
            user_id=message.wa_id or message.from_number,
            channel="whatsapp",
        )
    booking_context_text = None
    try:
        booking_context_text = await build_booking_context_message(
            contact_id=contact_id,
            conversation_id=conversation_id,
            channel="whatsapp",
            contact=contact_record,
        )
    except Exception as exc:
        logger.warning(
            "whatsapp.booking_context_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )

    try:
        assistant_reply = await _generate_assistant_reply(
            message=message,
            conversation_id=conversation_id,
            contact_id=contact_id,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=previous_response_id,
            catalog_context=catalog_context.text if catalog_context else None,
            booking_context=booking_context_text,
            whatsapp_settings=whatsapp_settings,
            organizacion_id=org_uuid,
            prospeccion_mode=is_prospeccion_context,
        )
        log_event(
            logger,
            "whatsapp.reply_generated",
            conversation_id=conversation_id,
            response_id=assistant_reply.response_id,
            openai_conversation_id=assistant_reply.openai_conversation_id,
        )
    except Exception as exc:  # pragma: no cover - errores inesperados de OpenAI
        error_meta = classify_runtime_error(exc)
        logger.exception(
            "whatsapp.generate_reply_failed",
            extra={
                "conversation_id": conversation_id,
                "error": str(exc),
                "error_type": error_meta.get("error_type"),
                "status_code": error_meta.get("status_code"),
                "retryable": bool(error_meta.get("retryable")),
            },
        )
        assistant_reply = AssistantReply(
            text=DEFAULT_FALLBACK,
            openai_conversation_id=openai_conversation_id,
            response_id=previous_response_id,
        )

    if not assistant_reply.text:
        log_event(
            logger,
            "whatsapp.empty_reply",
            conversation_id=conversation_id,
        )
        assistant_reply = AssistantReply(
            text=DEFAULT_FALLBACK,
            openai_conversation_id=assistant_reply.openai_conversation_id or openai_conversation_id,
            response_id=assistant_reply.response_id or previous_response_id,
        )

    final_reply_text = assistant_reply.text
    if not final_reply_text:
        final_reply_text = DEFAULT_FALLBACK
    final_reply_text = await _guard_booking_confirmation_claim(
        conversation_id=conversation_id,
        reply_text=final_reply_text,
        contact=contact_record,
        opportunity_id=opportunity_ref,
    )
    final_reply_text = _compact_whatsapp_reply(final_reply_text, _DEFAULT_WHATSAPP_MAX_CHARS)

    send_result = await _send_whatsapp_reply(
        to_number=message.from_number,
        body=final_reply_text,
        organizacion_id=org_uuid,
    )
    log_event(
        logger,
        "whatsapp.reply_dispatched",
        conversation_id=conversation_id,
        status=send_result.status,
        error=send_result.error,
    )

    metadata = {
        "openai_conversation_id": assistant_reply.openai_conversation_id,
        "response_id": assistant_reply.response_id,
        "delivery_status": send_result.status,
    }
    if send_result.error:
        metadata["delivery_error"] = send_result.error

    resolved_contact_org = await resolve_whatsapp_organizacion(contact=contact_record)
    try:
        await storage.register_whatsapp_message(
            direction="saliente",
            conversation_id=conversation_id,
            contact_id=contact_id,
            body=final_reply_text,
            message_sid=send_result.sid,
            response_id=assistant_reply.response_id,
            metadata=metadata,
            wa_id=message.wa_id,
            phone_e164=normalized_from,
            organizacion_id=resolved_contact_org,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.register_outgoing_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        log_event(
            logger,
            "whatsapp.reply_register_failed",
            conversation_id=conversation_id,
            error=str(exc),
        )
    else:
        log_event(
            logger,
            "whatsapp.reply_registered",
            conversation_id=conversation_id,
            message_sid=send_result.sid,
        )


async def handle_status_callback(callback: schemas.WhatsAppStatusCallback) -> None:
    """Persistencia básica de los eventos de entrega reportados por Twilio."""
    event = _map_status_to_event(callback.status)
    if not event:
        log_event(
            logger,
            "whatsapp.status_ignored",
            message_sid=callback.message_sid,
            status=callback.status,
        )
        return

    try:
        await storage.record_delivery_event(
            provider="twilio",
            message_sid=callback.message_sid,
            event=event,
            raw_payload=callback.raw_payload,
            error_code=callback.error_code,
            provider_timestamp=callback.timestamp,
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.delivery_event_failed",
            extra={"message_sid": callback.message_sid, "error": str(exc)},
        )
    else:
        log_event(
            logger,
            "whatsapp.delivery_event_recorded",
            message_sid=callback.message_sid,
            event=event,
        )

    if event == "fallido":
        await _retry_failed_sales_notification(
            message_sid=callback.message_sid,
            error_code=callback.error_code,
        )

    await _sync_envio_status_from_whatsapp(callback)


async def _retry_failed_sales_notification(
    *,
    message_sid: str,
    error_code: str | None = None,
) -> None:
    sid = str(message_sid or "").strip()
    if not sid:
        return
    try:
        repo = CRMRepository()
    except CRMRepositoryError as exc:
        log_event(logger, "whatsapp.retry_notification.repo_error", message_sid=sid, error=str(exc))
        return
    try:
        assignment = await repo.get_sales_assignment_by_notification_sid(notification_sid=sid)
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.retry_notification.lookup_failed",
            message_sid=sid,
            error=str(exc),
        )
        return
    if not assignment:
        return

    trigger_event = str(assignment.get("trigger_event") or "").strip().lower()
    if not trigger_event.startswith("notify_"):
        return
    trigger = trigger_event.removeprefix("notify_")

    assignment_metadata = assignment.get("metadata")
    assignment_metadata = assignment_metadata if isinstance(assignment_metadata, dict) else {}
    notification_meta = assignment_metadata.get("notification")
    notification_meta = notification_meta if isinstance(notification_meta, dict) else {}
    try:
        retry_count = max(0, int(notification_meta.get("retry_count") or 0))
    except (TypeError, ValueError):
        retry_count = 0
    if retry_count >= 1:
        log_event(
            logger,
            "whatsapp.retry_notification.skipped_max_retries",
            message_sid=sid,
            trigger=trigger,
        )
        return

    assignment_id = assignment.get("id")
    try:
        assignment_uuid = UUID(str(assignment_id))
    except (TypeError, ValueError):
        return

    notification_meta["retry_count"] = retry_count + 1
    notification_meta["retry_of_sid"] = sid
    notification_meta["retry_requested_at"] = datetime.now(timezone.utc).isoformat()
    if error_code:
        notification_meta["last_error_code"] = str(error_code)
    assignment_metadata = {**assignment_metadata, "notification": notification_meta}
    try:
        await repo.update_sales_assignment_notification(
            assignment_id=assignment_uuid,
            metadata=assignment_metadata,
        )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.retry_notification.metadata_update_failed",
            message_sid=sid,
            trigger=trigger,
            error=str(exc),
        )
        return

    conversation_id = str(assignment.get("conversacion_id") or "").strip()
    contact_id = str(assignment.get("contacto_id") or "").strip()
    opportunity_id = str(assignment.get("oportunidad_id") or "").strip() or None
    if not conversation_id or not contact_id:
        return

    try:
        contact = await storage.fetch_contact(contact_id)
    except StorageError as exc:
        log_event(
            logger,
            "whatsapp.retry_notification.contact_fetch_failed",
            message_sid=sid,
            trigger=trigger,
            error=str(exc),
        )
        return

    resumen = str(contact.get("necesidad_proposito") or "").strip() or None
    notes = str(contact.get("notes") or "").strip() or None
    email = str(contact.get("correo") or "").strip() or None
    extra_reason = assignment_metadata.get("reason")
    extra: dict[str, Any] = dict(extra_reason) if isinstance(extra_reason, dict) else {}
    extra["retry_of_sid"] = sid
    extra["delivery_error_code"] = error_code

    channel_value = str(assignment.get("canal") or "").strip().lower() or "whatsapp"
    context = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel=channel_value,
    )
    try:
        if channel_value == "webchat":
            from app.channels.webchat import notifications as webchat_notifications

            await webchat_notifications.notify_sales_rep(
                context=context,
                trigger=trigger,
                contact=contact,
                opportunity_id=opportunity_id,
                resumen=resumen,
                notes=notes,
                email=email,
                extra=extra,
                force_retry=True,
            )
        else:
            await whatsapp_tools._notify_sales_rep(
                context=context,
                trigger=trigger,
                contact=contact,
                opportunity_id=opportunity_id,
                resumen=resumen,
                notes=notes,
                email=email,
                extra=extra,
                force_retry=True,
            )
    except Exception as exc:  # pragma: no cover - best effort
        log_event(
            logger,
            "whatsapp.retry_notification.send_failed",
            message_sid=sid,
            trigger=trigger,
            channel=channel_value,
            error=str(exc),
        )
        return

    log_event(
        logger,
        "whatsapp.retry_notification.sent",
        message_sid=sid,
        trigger=trigger,
        channel=channel_value,
    )


async def _sync_envio_status_from_whatsapp(callback: schemas.WhatsAppStatusCallback) -> None:
    """Sincroniza el envío en prospección con el estatus de Twilio."""

    estado_envio = _map_status_to_envio_estado(callback.status)
    if not estado_envio:
        return
    try:
        repo = CRMRepository()
    except CRMRepositoryError as exc:
        log_event(logger, "whatsapp.status_envio_repo_error", error=str(exc))
        return
    try:
        envio = await repo.worker_get_envio_by_mensaje(mensaje_id=callback.message_sid)
    except CRMRepositoryError as exc:
        log_event(logger, "whatsapp.status_envio_fetch_failed", error=str(exc))
        return
    if not envio:
        return
    envio_id = envio.get("id")
    if not envio_id:
        return
    try:
        envio_uuid = UUID(str(envio_id))
    except (TypeError, ValueError):
        log_event(logger, "whatsapp.status_envio_invalid_id", envio_id=envio_id)
        return
    current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
    merged_detalle = {
        **current_detalle,
        "status": callback.status,
        "timestamp": callback.timestamp,
        "error_code": callback.error_code,
    }
    payload = {
        "estado": estado_envio,
        "detalle": merged_detalle,
        "error": callback.error_code if estado_envio == "fallido" else None,
        "procesado_en": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await repo.worker_complete_envio(envio_id=envio_uuid, payload=payload)
        metrics.increment("whatsapp", payload["estado"])
        batch_id_value = envio.get("batch_id")
        if batch_id_value:
            await progress_hub.publish(
                str(batch_id_value),
                {
                    "type": "envio",
                    "batch_id": batch_id_value,
                    "envio_id": str(envio_uuid),
                    "estado": payload["estado"],
                },
            )
        await repo.worker_insert_contact_logs(
            [
                {
                    "organizacion_id": (
                        str(envio.get("organizacion_id")) if envio.get("organizacion_id") else None
                    ),
                    "prospecto_id": (
                        str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None
                    ),
                    "canal": "whatsapp",
                    "estado": estado_envio,
                    "detalle": {
                        "status": callback.status,
                        "timestamp": callback.timestamp,
                    },
                    "error": callback.error_code if estado_envio == "fallido" else None,
                    "batch_id": str(envio.get("batch_id")) if envio.get("batch_id") else None,
                    "envio_id": str(envio_uuid),
                }
            ]
        )
        await auto_promote_prospecto(
            prospecto_id=envio.get("prospecto_id"),
            canal="whatsapp",
            estado=estado_envio,
            repo=repo,
        )
        batch_state = None
        if estado_envio == "fallido" and batch_id_value:
            batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id_value)))
        if batch_state and batch_id_value:
            await progress_hub.publish(
                str(batch_id_value),
                {
                    "type": "batch",
                    "batch_id": batch_id_value,
                    "estado": batch_state,
                },
            )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "whatsapp.status_envio_update_failed",
            error=str(exc),
            message_sid=callback.message_sid,
        )


async def _maybe_update_contact_location(
    contact_id: str,
    contact: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Enriquece el contacto con la ubicación inferida a partir de su teléfono/LADA."""
    contact_data = contact
    if contact_data is None:
        try:
            contact_data = await storage.fetch_contact(contact_id)
        except StorageError as exc:
            logger.warning(
                "whatsapp.fetch_contact_failed",
                extra={"contact_id": contact_id, "error": str(exc)},
            )
            return None

    contacto_datos = contact_data.get("contacto_datos") or {}
    ubicacion = dict(contacto_datos.get("ubicacion") or {})
    lada_exists = ubicacion.get("lada")
    estado_exists = ubicacion.get("cve_ent")
    cvegeo_exists = ubicacion.get("cvegeo")

    if lada_exists and estado_exists and cvegeo_exists:
        return contact_data

    try:
        identities = await storage.fetch_contact_identities(contact_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.fetch_contact_identities_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        identities = []

    channels = []
    origen = contact_data.get("origen")
    if isinstance(origen, str) and origen:
        channels.append(origen)
    else:
        channels.append("whatsapp")

    location = leads_geo.infer_contact_location(
        contacto_id=contact_id,
        data=contact_data,
        channels=channels,
        identities=identities,
    )

    updated = False
    ubicacion.setdefault("pais", "México")
    ubicacion.setdefault("country_code", "MX")

    if location.lada and ubicacion.get("lada") != location.lada:
        ubicacion["lada"] = location.lada
        updated = True
    if location.estado_clave and ubicacion.get("cve_ent") != location.estado_clave:
        ubicacion["cve_ent"] = location.estado_clave
        updated = True
    if location.estado_nombre and ubicacion.get("nom_ent") != location.estado_nombre:
        ubicacion["nom_ent"] = location.estado_nombre
        updated = True
    if location.municipio_clave and ubicacion.get("cve_mun") != location.municipio_clave:
        ubicacion["cve_mun"] = location.municipio_clave
        updated = True
    if location.municipio_nombre and ubicacion.get("nom_mun") != location.municipio_nombre:
        ubicacion["nom_mun"] = location.municipio_nombre
        updated = True
    if location.municipio_cvegeo and ubicacion.get("cvegeo") != location.municipio_cvegeo:
        ubicacion["cvegeo"] = location.municipio_cvegeo
        updated = True

    if not updated:
        return contact_data

    contacto_datos["ubicacion"] = ubicacion
    try:
        await storage.update_contact(contact_id, {"contacto_datos": contacto_datos})
    except StorageError as exc:
        logger.warning(
            "whatsapp.update_contact_location_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
    else:
        contact_data["contacto_datos"] = contacto_datos

    return contact_data

async def _generate_assistant_reply(
    *,
    message: schemas.WhatsAppIncomingMessage,
    conversation_id: str,
    contact_id: str,
    openai_conversation_id: str | None,
    previous_response_id: str | None,
    catalog_context: str | None,
    booking_context: str | None,
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
    organizacion_id: UUID | None,
    prospeccion_mode: bool = False,
) -> AssistantReply:
    assistant = _build_assistant_from_runtime(whatsapp_settings, prospeccion_mode=prospeccion_mode)
    log_event(
        logger,
        "whatsapp.assistant_routing",
        prospeccion_mode=prospeccion_mode,
        prompt_id=assistant.prompt_id,
        prompt_version=assistant.prompt_version,
        assistant_id=assistant.assistant_id,
    )
    client = openai_service.get_assistant_client(api_key=whatsapp_settings.voice_api_key)
    assistant_spec = None
    if not assistant.is_prompt:
        if not assistant.assistant_id:
            raise RuntimeError("WHATSAPP_ASSISTANT_ID is not configured")
        assistant_spec = await resolve_assistant_spec(client, assistant.assistant_id)

    metadata_payload = {
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "channel": "whatsapp",
        "message_sid": message.message_sid,
        "prospeccion_mode": str(bool(prospeccion_mode)).lower(),
    }
    context_payload: dict[str, Any] | None = None
    try:
        context_payload = await storage.fetch_contact_context(
            conversation_id=conversation_id,
            contact_id=contact_id,
        )
    except StorageError as exc:  # pragma: no cover - fallbacks informativos
        logger.warning(
            "whatsapp.fetch_contact_context_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )

    summary_record: dict[str, Any] | None = None
    summary_text: str | None = None
    summary_created_en: str | None = None
    try:
        summary_record = await conversation_summary.ensure_conversation_summary(
            conversation_id=conversation_id,
            contact_id=contact_id,
            context_data=context_payload,
            organizacion_id=organizacion_id,
        )
        if summary_record:
            candidate = summary_record.get("resumen")
            if isinstance(candidate, str) and candidate.strip():
                summary_text = candidate.strip()
            summary_created_en = summary_record.get("creado_en")
            metadata = summary_record.get("metadatos")
            if isinstance(metadata, dict) and metadata:
                metadata = {k: v for k, v in metadata.items() if k != "type"}
            else:
                metadata = {}
            summary_record["metadatos"] = metadata
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.conversation_summary_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    if booking_context:
        context_payload = context_payload or {}
        context_payload["booking_context"] = booking_context

    initial_input = _build_openai_input(
        message,
        context_data=context_payload,
        summary_text=summary_text,
        summary_created_en=summary_created_en,
        catalog_context=catalog_context,
    )
    profiling_enabled_for_channel = True
    if organizacion_id:
        try:
            profiling_enabled_for_channel = await tenant_runtime.is_profiling_enabled(
                organizacion_id=organizacion_id,
                channel="whatsapp",
            )
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "whatsapp.profiling_toggle_lookup_failed",
                extra={
                    "conversation_id": conversation_id,
                    "organizacion_id": str(organizacion_id),
                    "error": str(exc),
                },
            )
    initial_input.insert(
        0,
        {
            "role": "developer",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "Fecha y hora del servidor: "
                        + get_current_time_reference()
                        + " Si el usuario pregunta por la fecha actual, responde con esta información."
                    ),
                }
            ],
        },
    )
    initial_input.insert(
        1,
        {
            "role": "developer",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "Contrato operativo para close_lead: cuando captures perfilamiento, incluye "
                        "profiling_statuses y profiling_reprompt_counts por campo. "
                        "profiling_statuses debe usar solo: answered, unknown, refused, skipped_max_retries. "
                        "Si un campo no se obtuvo tras la repregunta máxima, marca skipped_max_retries y continua. "
                        "No forces al usuario con repreguntas adicionales."
                        if profiling_enabled_for_channel
                        else "Perfilamiento IA desactivado para este tenant/canal. "
                        "No hagas preguntas de perfilamiento o scoring. "
                        "No envíes campos de scoring en close_lead "
                        "(financing_type, credit_preapproved, budget_range, purchase_timeline, "
                        "decision_authority, visited_properties, profiling_statuses, profiling_reprompt_counts). "
                        "Flujo permitido: captura de datos básicos, close_lead simple, "
                        "y gestión de agenda/email si el prospecto lo pide."
                    ),
                }
            ],
        },
    )
    initial_input.insert(
        2,
        {
            "role": "developer",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "Estilo WhatsApp (regla estricta): responde breve. "
                        "Por defecto usa 1–3 frases (máx. ~300 caracteres) y termina con 1 pregunta. "
                        "No des listas largas ni autopromoción; ofrece ampliar solo si el usuario pide detalles."
                    ),
                }
            ],
        },
    )
    if booking_context:
        initial_input.insert(
            3,
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": booking_context,
                    }
                ],
            },
        )
    if prospeccion_mode:
        initial_input.insert(
            3,
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Regla de agenda en prospección: nunca digas que no puedes agendar. "
                            "Si el prospecto confirma fecha/hora o acepta demo, DEBES usar tools "
                            "(list_demo_slots y/o schedule_demo) antes de responder. "
                            "Si falta algún dato requerido, pide solo ese dato faltante en una pregunta corta. "
                            "Orden obligatorio de captura antes de agendar: nombre completo, luego correo, luego empresa."
                        ),
                    }
                ],
            },
        )
        initial_input.insert(
            4,
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Si ya existe demo confirmada en el contexto, no reinicies calificación ni agenda. "
                            "No vuelvas a pedir nombre/correo/empresa. "
                            "Solo confirma y responde dudas puntuales; "
                            "si el usuario quiere cambiar/cancelar, usa reschedule_demo o cancel_demo."
                        ),
                    }
                ],
            },
        )
    wants_detail = _wants_detailed_reply(message.body)
    # Este presupuesto aplica al loop de tools; debe ser holgado para evitar
    # truncar JSON de function calls.
    max_output_tokens = 1200 if wants_detail else 900
    request_kwargs: dict[str, Any] = {
        "input": initial_input,
        "store": True,
        "max_output_tokens": max_output_tokens,
        "temperature": 0.4,
        "metadata": metadata_payload,
        "tool_choice": "auto",
    }

    summary_record: dict[str, Any] | None = None
    try:
        summary_record = await conversation_summary.ensure_conversation_summary(
            conversation_id=conversation_id,
            contact_id=contact_id,
            context_data=context_payload,
            organizacion_id=organizacion_id,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.conversation_summary_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    prompt_variables: dict[str, Any] = {"conversacion_id": conversation_id}

    def _build_request_template(*, include_tools: bool = True) -> dict[str, Any]:
        if assistant.is_prompt:
            return {
                "prompt": build_prompt_payload(assistant, prompt_variables),
                "text": {"format": {"type": "text"}},
            }
        if not assistant_spec:
            raise RuntimeError("No se pudo resolver la configuración del asistente")
        payload: dict[str, Any] = {"model": assistant_spec.model}
        if assistant_spec.instructions:
            payload["instructions"] = assistant_spec.instructions
        if include_tools and assistant_spec.tools:
            payload["tools"] = assistant_spec.tools
        return payload

    request_kwargs.update(_build_request_template(include_tools=True))
    if assistant.is_prompt:
        request_kwargs.pop("temperature", None)

    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    context_obj = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=contact_id,
        session_id=f"whatsapp:{conversation_id}",
        channel="whatsapp",
    )

    try:
        result = await run_tool_loop(
            client=client,
            assistant=assistant,
            assistant_spec=assistant_spec,
            context=context_obj,
            initial_request=request_kwargs,
            request_template=lambda: _build_request_template(include_tools=True),
            execute_tool=whatsapp_tools.execute_tool,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=previous_response_id,
            log=logger,
        )
    except Exception as exc:
        if assistant.is_prompt and prompt_variables and _is_unknown_prompt_variable_error(exc):
            log_event(
                logger,
                "whatsapp.prompt_variables_retry_without_variables",
                conversation_id=conversation_id,
                prompt_id=assistant.prompt_id,
                prompt_version=assistant.prompt_version,
            )
            prompt_variables = {}
            request_kwargs.update(_build_request_template(include_tools=True))
            result = await run_tool_loop(
                client=client,
                assistant=assistant,
                assistant_spec=assistant_spec,
                context=context_obj,
                initial_request=request_kwargs,
                request_template=lambda: _build_request_template(include_tools=True),
                execute_tool=whatsapp_tools.execute_tool,
                openai_conversation_id=openai_conversation_id,
                previous_response_id=previous_response_id,
                log=logger,
            )
        else:
            raise

    reply_text = _extract_text_from_response(result.response)
    final_text = reply_text
    followup_kwargs: dict[str, Any] = {
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Redacta SOLO el mensaje final para WhatsApp al último usuario. "
                            "Máximo 500 caracteres, 1-3 frases, directo, sin listas largas."
                        ),
                    }
                ],
            }
        ],
        "store": True,
        "max_output_tokens": 140,
        "temperature": 0.3,
        "metadata": metadata_payload,
        "tool_choice": "none",
    }
    followup_kwargs.update(_build_request_template(include_tools=False))
    if assistant.is_prompt:
        followup_kwargs.pop("temperature", None)
    if result.conversation_id:
        followup_kwargs["conversation"] = result.conversation_id
    elif result.response_id:
        followup_kwargs["previous_response_id"] = result.response_id
    try:
        final_response = await client.responses.create(**followup_kwargs)
        final_response_dict = final_response.model_dump()
        followup_text = _extract_text_from_response(final_response_dict)
        if followup_text:
            final_text = followup_text
        final_response_id = final_response_dict.get("id") or result.response_id
        final_conversation_id = (
            (final_response_dict.get("conversation") or {}).get("id")
            or result.conversation_id
        )
    except Exception as exc:  # pragma: no cover - tolerante a falla de red/SDK
        if assistant.is_prompt and prompt_variables and _is_unknown_prompt_variable_error(exc):
            prompt_variables = {}
            try:
                followup_kwargs.update(_build_request_template(include_tools=False))
                final_response = await client.responses.create(**followup_kwargs)
                final_response_dict = final_response.model_dump()
                followup_text = _extract_text_from_response(final_response_dict)
                if followup_text:
                    final_text = followup_text
                final_response_id = final_response_dict.get("id") or result.response_id
                final_conversation_id = (
                    (final_response_dict.get("conversation") or {}).get("id")
                    or result.conversation_id
                )
            except Exception as retry_exc:
                logger.warning(
                    "whatsapp.concise_reply_generation_failed",
                    extra={"conversation_id": conversation_id, "error": str(retry_exc)},
                )
                final_response_id = result.response_id
                final_conversation_id = result.conversation_id
        else:
            logger.warning(
                "whatsapp.concise_reply_generation_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
            final_response_id = result.response_id
            final_conversation_id = result.conversation_id

    return AssistantReply(
        text=final_text.strip() if final_text else None,
        openai_conversation_id=final_conversation_id,
        response_id=final_response_id,
    )


async def _send_whatsapp_reply(
    *,
    to_number: str,
    body: str | None = None,
    content_sid: str | None = None,
    content_variables: dict[str, str] | None = None,
    organizacion_id: UUID | None = None,
) -> TwilioSendResult:
    """Envía la respuesta al contacto utilizando la API de Twilio."""

    runtime = await tenant_runtime.get_twilio_runtime_settings(organizacion_id=organizacion_id)
    if (
        not runtime.phone_number
        or not runtime.account_sid
        or not runtime.auth_token
    ):
        logger.warning("whatsapp.twilio_not_configured")
        return TwilioSendResult(sid=None, status="skipped", error="twilio_not_configured")

    if not body and not content_sid:
        logger.warning("whatsapp.empty_payload")
        return TwilioSendResult(sid=None, status="skipped", error="empty_payload")

    normalized_to = to_number or ""
    if normalized_to and not normalized_to.lower().startswith("whatsapp:"):
        normalized_to = f"whatsapp:{normalized_to}"
    normalized_from = runtime.phone_number
    if normalized_from and not normalized_from.lower().startswith("whatsapp:"):
        normalized_from = f"whatsapp:{normalized_from}"

    client = twilio_service.get_twilio_client_for_credentials(runtime.account_sid, runtime.auth_token)
    message_kwargs: dict[str, Any] = {
        "to": normalized_to,
        "from_": normalized_from,
    }
    if content_sid:
        message_kwargs["content_sid"] = content_sid
        if content_variables:
            message_kwargs["content_variables"] = json.dumps(
                content_variables,
                ensure_ascii=False,
            )
    else:
        message_kwargs["body"] = body or ""

    try:
        message = await asyncio.to_thread(
            client.messages.create,
            **message_kwargs,
        )
    except Exception as exc:  # pragma: no cover - errores propios del SDK
        logger.exception("whatsapp.twilio_send_failed", extra={"error": str(exc)})
        return TwilioSendResult(sid=None, status="failed", error=str(exc))

    status = getattr(message, "status", None)
    return TwilioSendResult(
        sid=getattr(message, "sid", None),
        status=status,
        error=None,
        from_number=normalized_from,
    )


async def send_manual_message(
    *,
    to_number: str,
    body: str | None = None,
    template_sid: str | None = None,
    template_variables: dict[str, str] | None = None,
    organizacion_id: UUID | str | None = None,
) -> TwilioSendResult:
    """Expone el envío de mensajes manuales desde el panel o automatizaciones."""
    org_uuid: UUID | None
    if isinstance(organizacion_id, UUID):
        org_uuid = organizacion_id
    else:
        org_uuid = _parse_org_uuid(organizacion_id if isinstance(organizacion_id, str) else None)
    return await _send_whatsapp_reply(
        to_number=to_number,
        body=body,
        content_sid=template_sid,
        content_variables=template_variables,
        organizacion_id=org_uuid,
    )


def _build_openai_input(
    message: schemas.WhatsAppIncomingMessage,
    *,
    context_data: dict[str, Any] | None = None,
    summary_text: str | None = None,
    summary_created_en: str | None = None,
    catalog_context: str | None = None,
) -> list[dict[str, Any]]:
    """Normaliza el contenido del mensaje con contexto CRM para la Responses API."""
    text_parts: list[str] = []
    if message.body:
        text_parts.append(message.body)
    if message.media:
        attachment_lines = [
            f"- ({item.index + 1}) {item.content_type or 'archivo'}: {item.url}"
            for item in message.media
        ]
        text_parts.append("El usuario adjuntó archivos:\n" + "\n".join(attachment_lines))
    if not text_parts:
        text_parts.append("(mensaje sin texto)")

    context_lines = build_crm_context_lines(context_data)
    if context_lines:
        text_parts.append("")
        text_parts.extend(context_lines)

    if summary_text:
        summary_header = "Resumen previo"
        if summary_created_en:
            summary_header += f" ({summary_created_en})"
        text_parts.append("")
        text_parts.append(f"{summary_header}: {summary_text}")

    user_message = {
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": "\n\n".join(text_parts),
            }
        ],
    }
    messages: list[dict[str, Any]] = []
    if catalog_context:
        messages.append(
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": catalog_context,
                    }
                ],
            }
        )
    messages.append(user_message)
    return messages


def _extract_text_from_response(payload: dict[str, Any]) -> str | None:
    output_items = payload.get("output") or []
    fragments: list[str] = []
    for item in output_items:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                text = content.get("text")
                if text:
                    fragments.append(str(text))
    if fragments:
        return "\n".join(fragment.strip() for fragment in fragments if fragment)
    if payload.get("status") == "completed" and payload.get("output"):
        return None
    if payload.get("status") == "requires_action":
        logger.warning("whatsapp.tool_call_unhandled", extra={"output": payload.get("output")})
    return None


def _ensure_metadata_dict(value: Any) -> dict[str, Any]:
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


def _parse_interactive_payload(raw_payload: dict[str, Any]) -> dict[str, Any] | None:
    data_text = raw_payload.get("InteractiveData") or raw_payload.get("interactivedata")
    if not data_text:
        return None
    try:
        parsed = json.loads(data_text)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def _extract_quick_reply_data(raw_payload: dict[str, Any]) -> dict[str, Any] | None:
    if not raw_payload:
        return None
    button_payload = raw_payload.get("ButtonPayload") or raw_payload.get("buttonpayload")
    button_text = raw_payload.get("ButtonText") or raw_payload.get("buttontext")
    interactive = _parse_interactive_payload(raw_payload)
    if not button_payload and interactive:
        reply_data = interactive.get("button_reply") or {}
        button_payload = reply_data.get("id") or button_payload
        button_text = button_text or reply_data.get("title") or reply_data.get("text")
    if not button_payload and not interactive:
        return None
    raw_fields = {
        "ButtonText": raw_payload.get("ButtonText"),
        "ButtonPayload": raw_payload.get("ButtonPayload"),
        "InteractiveData": raw_payload.get("InteractiveData"),
    }
    return {
        "payload": button_payload,
        "text": button_text or raw_payload.get("Body"),
        "interactive": interactive,
        "raw_fields": raw_fields,
    }


async def _maybe_handle_sales_acknowledgement(
    message: schemas.WhatsAppIncomingMessage,
) -> bool:
    """Detecta respuestas de botones del vendedor y marca la asignación como aceptada."""
    quick_reply = _extract_quick_reply_data(message.raw_payload or {})
    if not quick_reply:
        return False

    normalized_from = _normalize_phone_number(message.from_number)
    if not normalized_from:
        logger.warning("whatsapp.sales_ack.invalid_from_number")
        return True

    repo = CRMRepository()
    try:
        seller = await repo.find_sales_rep_by_phone(phone_e164=normalized_from)
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.sales_ack.sales_rep_lookup_failed",
            extra={"error": str(exc)},
        )
        return True

    if not seller:
        logger.info(
            "whatsapp.sales_ack.sales_rep_missing",
            extra={"from_number": normalized_from},
        )
        return True

    vendedor_id = seller.get("usuario_id")
    organizacion_ids = seller.get("organizacion_ids") or []
    try:
        pending = await repo.find_pending_sales_assignment(
            vendedor_id=vendedor_id,
            organizacion_ids=organizacion_ids,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.sales_ack.assignment_lookup_failed",
            extra={"error": str(exc)},
        )
        return True

    if not pending:
        logger.info(
            "whatsapp.sales_ack.no_pending_assignment",
            extra={"seller_id": str(vendedor_id)},
        )
        return True

    try:
        assignment_id = UUID(str(pending.get("id")))
    except (TypeError, ValueError):
        logger.warning(
            "whatsapp.sales_ack.invalid_assignment_id",
            extra={"assignment_id": pending.get("id")},
        )
        return True

    metadata = _ensure_metadata_dict(pending.get("metadata"))
    metadata["acknowledgement"] = {
        "type": "whatsapp_quick_reply",
        "button_text": quick_reply.get("text"),
        "button_payload": quick_reply.get("payload"),
        "message_sid": message.message_sid,
        "raw_fields": quick_reply.get("raw_fields"),
    }
    ack_time = datetime.now(timezone.utc)
    try:
        await repo.update_sales_assignment_ack(
            assignment_id=assignment_id,
            ack_user_id=vendedor_id,
            ack_time=ack_time,
            ack_via="whatsapp_quick_reply",
            metadata=metadata,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.sales_ack.update_failed",
            extra={"assignment_id": str(assignment_id), "error": str(exc)},
        )
        return True

    log_event(
        logger,
        "whatsapp.sales_acknowledged",
        assignment_id=str(assignment_id),
        vendedor_id=str(vendedor_id),
        button_payload=str(quick_reply.get("payload") or ""),
    )
    return True


def _normalize_phone_number(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if text.lower().startswith("whatsapp:"):
        return text.split(":", 1)[1]
    return text


def _map_status_to_event(status: str | None) -> str | None:
    if not status:
        return None
    normalized = status.strip().lower()
    mapping = {
        "queued": "en_cola",
        "accepted": "en_cola",
        "sending": "enviado",
        "sent": "enviado",
        "delivered": "entregado",
        "read": "leido",
        "failed": "fallido",
        "undelivered": "fallido",
    }
    return mapping.get(normalized)


def _parse_org_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except (TypeError, ValueError):
        return None


def _map_status_to_envio_estado(status: str | None) -> str | None:
    event = _map_status_to_event(status)
    if not event:
        return None
    if event == "en_cola":
        return "enviado"
    return event


def _build_assistant_from_runtime(
    settings_values: tenant_runtime.WhatsappRuntimeSettings,
    *,
    prospeccion_mode: bool = False,
) -> AssistantConfig:
    if prospeccion_mode and settings_values.prospeccion_prompt_id:
        return AssistantConfig(
            assistant_id=None,
            prompt_id=settings_values.prospeccion_prompt_id,
            prompt_version=settings_values.prospeccion_prompt_version or settings_values.prompt_version,
            project_id=settings.openai_project_id,
        )
    if settings_values.prompt_id:
        return AssistantConfig(
            assistant_id=None,
            prompt_id=settings_values.prompt_id,
            prompt_version=settings_values.prompt_version,
            project_id=settings.openai_project_id,
        )
    target_id = settings_values.assistant_id or settings.openai_assistant_id
    if not target_id:
        raise RuntimeError("No se configuró un ASSISTANT_ID para WhatsApp")
    return AssistantConfig(
        assistant_id=target_id,
        project_id=settings.openai_project_id,
    )
