"""Servicios específicos para WhatsApp via Twilio."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.assistants import registry
from app.assistants.runtime import build_prompt_payload, resolve_assistant_spec
from app.assistants.tool_runtime import ToolRuntimeContext, run_tool_loop
from app.channels.whatsapp import tools as whatsapp_tools
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import conversation_summary, leads_geo, storage
from app.services import openai as openai_service
from app.services.context_formatter import build_crm_context_lines
from app.services import twilio as twilio_service
from app.services.metrics import metrics
from app.services.prospeccion_progress import progress_hub
from app.services.storage import StorageError
from app.services.catalog_context import build_catalog_context
from app.services.prospeccion_auto_promoter import auto_promote_prospecto

from . import schemas

logger = get_logger("app.channels.whatsapp")

DEFAULT_FALLBACK = (
    "Tu mensaje quedó registrado, pero tuve un problema momentáneo al responder. "
    "Intentemos nuevamente en unos instantes."
)


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
    organizacion_hint = resolve_whatsapp_organizacion(to_number=recipient_number)

    if not organizacion_hint:
        logger.error(
            "whatsapp.organizacion_unresolved",
            extra={"to_number": recipient_number, "wa_id": message.wa_id},
        )
        raise HTTPException(status_code=500, detail="No se pudo enrutar el mensaje entrante")

    try:
        registration = await storage.register_whatsapp_message(
            direction="entrante",
            wa_id=message.wa_id,
            phone_e164=normalized_from,
            body=message.body,
            message_sid=message.message_sid,
            profile_name=message.profile_name,
            inactivity_minutes=settings.whatsapp_inactivity_minutes,
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

    restart_context: dict[str, Any] | None = None
    try:
        ensure_payload = await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel="whatsapp",
            force_new_opportunity_on_restart=True,
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
        else:
            restart_context = {
                "oportunidad_id": ensure_payload,
                "restart_created": False,
                "restart_sequence": 1,
            }

    contact_record = await _maybe_update_contact_location(contact_id)

    restart_created = bool(restart_context and restart_context.get("restart_created"))
    if restart_created:
        restart_sequence = int(restart_context.get("restart_sequence") or 1)
        opportunity_ref = restart_context.get("oportunidad_id")
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

    catalog_context = await build_catalog_context(
        organizacion_hint,
        message.body or "",
        user_id=message.wa_id or message.from_number,
        channel="whatsapp",
    )

    try:
        assistant_reply = await _generate_assistant_reply(
            message=message,
            conversation_id=conversation_id,
            contact_id=contact_id,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=previous_response_id,
            catalog_context=catalog_context.text if catalog_context else None,
        )
    except Exception as exc:  # pragma: no cover - errores inesperados de OpenAI
        logger.exception(
            "whatsapp.generate_reply_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
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

    send_result = await _send_whatsapp_reply(
        to_number=message.from_number,
        body=final_reply_text,
    )

    metadata = {
        "openai_conversation_id": assistant_reply.openai_conversation_id,
        "response_id": assistant_reply.response_id,
        "delivery_status": send_result.status,
    }
    if send_result.error:
        metadata["delivery_error"] = send_result.error

    resolved_contact_org = resolve_whatsapp_organizacion(contact=contact_record)
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

    await _sync_envio_status_from_whatsapp(callback)


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
) -> AssistantReply:
    assistant = registry.resolve_assistant("whatsapp")
    client = openai_service.get_assistant_client()
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

    request_kwargs: dict[str, Any] = {
        "input": _build_openai_input(
            message,
            context_data=context_payload,
            summary_text=summary_text,
            summary_created_en=summary_created_en,
            catalog_context=catalog_context,
        ),
        "store": True,
        "metadata": metadata_payload,
    }

    summary_record: dict[str, Any] | None = None
    try:
        summary_record = await conversation_summary.ensure_conversation_summary(
            conversation_id=conversation_id,
            contact_id=contact_id,
            context_data=context_payload,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.conversation_summary_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    def _build_request_template() -> dict[str, Any]:
        if assistant.is_prompt:
            variables = {"conversacion_id": conversation_id}
            return {
                "prompt": build_prompt_payload(assistant, variables),
                "text": {"format": {"type": "text"}},
            }
        if not assistant_spec:
            raise RuntimeError("No se pudo resolver la configuración del asistente")
        payload: dict[str, Any] = {"model": assistant_spec.model}
        if assistant_spec.instructions:
            payload["instructions"] = assistant_spec.instructions
        if assistant_spec.tools:
            payload["tools"] = assistant_spec.tools
        return payload

    request_kwargs.update(_build_request_template())

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

    result = await run_tool_loop(
        client=client,
        assistant=assistant,
        assistant_spec=assistant_spec,
        context=context_obj,
        initial_request=request_kwargs,
        request_template=_build_request_template,
        execute_tool=whatsapp_tools.execute_tool,
        openai_conversation_id=openai_conversation_id,
        previous_response_id=previous_response_id,
        log=logger,
    )

    reply_text = _extract_text_from_response(result.response)
    return AssistantReply(
        text=reply_text.strip() if reply_text else None,
        openai_conversation_id=result.conversation_id,
        response_id=result.response_id,
    )


async def _send_whatsapp_reply(
    *,
    to_number: str,
    body: str | None = None,
    content_sid: str | None = None,
    content_variables: dict[str, str] | None = None,
) -> TwilioSendResult:
    """Envía la respuesta al contacto utilizando la API de Twilio."""

    if (
        not settings.twilio_phone_number
        or not settings.twilio_account_sid
        or not settings.twilio_auth_token
    ):
        logger.warning("whatsapp.twilio_not_configured")
        return TwilioSendResult(sid=None, status="skipped", error="twilio_not_configured")

    if not body and not content_sid:
        logger.warning("whatsapp.empty_payload")
        return TwilioSendResult(sid=None, status="skipped", error="empty_payload")

    normalized_to = to_number or ""
    if normalized_to and not normalized_to.lower().startswith("whatsapp:"):
        normalized_to = f"whatsapp:{normalized_to}"
    normalized_from = settings.twilio_phone_number
    if normalized_from and not normalized_from.lower().startswith("whatsapp:"):
        normalized_from = f"whatsapp:{normalized_from}"

    client = twilio_service.get_twilio_client()
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
    return TwilioSendResult(sid=getattr(message, "sid", None), status=status, error=None)


async def send_manual_message(
    *,
    to_number: str,
    body: str | None = None,
    template_sid: str | None = None,
    template_variables: dict[str, str] | None = None,
) -> TwilioSendResult:
    """Expone el envío de mensajes manuales desde el panel o automatizaciones."""
    return await _send_whatsapp_reply(
        to_number=to_number,
        body=body,
        content_sid=template_sid,
        content_variables=template_variables,
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


def _safe_str_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    try:
        text = str(value).strip()
    except Exception:
        return None
    return text or None


def _normalize_phone_key(value: str | None) -> str | None:
    normalized = _normalize_phone_number(value)
    if not normalized:
        return None
    key = normalized.strip().replace(" ", "")
    if key and not key.startswith("+") and key.replace("+", "").isdigit():
        if key.startswith("+"):
            return key
        return f"+{key}"
    return key or None


def _whatsapp_phone_map() -> dict[str, str]:
    configured = getattr(settings, "whatsapp_phone_org_map", {}) or {}
    normalized: dict[str, str] = {}
    for phone, org in configured.items():
        key = _normalize_phone_key(phone)
        org_value = _safe_str_value(org)
        if key and org_value:
            normalized[key] = org_value
    default_org = _safe_str_value(settings.whatsapp_default_organizacion_id)
    default_phone = _normalize_phone_key(settings.twilio_phone_number)
    if default_org and default_phone and default_phone not in normalized:
        normalized[default_phone] = default_org
    return normalized


def resolve_whatsapp_organizacion(
    *,
    to_number: str | None = None,
    contact: dict[str, Any] | None = None,
) -> str | None:
    """Identifica el tenant asociado al canal WhatsApp."""
    if contact and isinstance(contact, dict):
        contact_org = _safe_str_value(contact.get("organizacion_id"))
        if contact_org:
            return contact_org
    phone_key = _normalize_phone_key(to_number)
    phone_map = _whatsapp_phone_map()
    if phone_key and phone_key in phone_map:
        return phone_map[phone_key]
    return _safe_str_value(settings.whatsapp_default_organizacion_id)


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


def _map_status_to_envio_estado(status: str | None) -> str | None:
    event = _map_status_to_event(status)
    if not event:
        return None
    if event == "en_cola":
        return "enviado"
    return event
