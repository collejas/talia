"""Servicios específicos para WhatsApp via Twilio."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from app.assistants import registry
from app.assistants.runtime import build_prompt_payload, resolve_assistant_spec
from app.assistants.tool_runtime import ToolRuntimeContext, run_tool_loop
from app.channels.whatsapp import tools as whatsapp_tools
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import openai as openai_service
from app.services import storage
from app.services import twilio as twilio_service
from app.services.storage import StorageError

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


async def handle_incoming_message(message: schemas.WhatsAppIncomingMessage) -> None:
    """Procesa un mensaje entrante desde Twilio y delega la respuesta a OpenAI."""
    normalized_from = _normalize_phone_number(message.from_number)
    try:
        registration = await storage.register_whatsapp_message(
            direction="entrante",
            wa_id=message.wa_id,
            phone_e164=normalized_from,
            body=message.body,
            message_sid=message.message_sid,
            profile_name=message.profile_name,
            inactivity_hours=settings.whatsapp_inactivity_hours,
            metadata=message.metadata(),
            attachments=message.attachments_as_dict(),
            webhook_payload=message.raw_payload,
        )
    except StorageError as exc:
        logger.exception("whatsapp.register_incoming_failed", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail="whatsapp_register_failed") from exc

    conversation_id = str(registration.get("conversation_id") or "")
    contact_id = str(registration.get("contact_id") or "")
    openai_conversation_id = registration.get("openai_conversation_id")

    if not conversation_id or not contact_id:
        logger.error(
            "whatsapp.registration_missing_ids",
            extra={"conversation_id": conversation_id},
        )
        return

    try:
        await storage.ensure_lead_tarjeta(
            tarjeta_id=None,
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel="whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.ensure_lead_tarjeta_failed",
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

    try:
        assistant_reply = await _generate_assistant_reply(
            message=message,
            conversation_id=conversation_id,
            contact_id=contact_id,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=previous_response_id,
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

    send_result = await _send_whatsapp_reply(
        to_number=message.from_number,
        body=assistant_reply.text,
    )

    metadata = {
        "openai_conversation_id": assistant_reply.openai_conversation_id,
        "response_id": assistant_reply.response_id,
        "delivery_status": send_result.status,
    }
    if send_result.error:
        metadata["delivery_error"] = send_result.error

    try:
        await storage.register_whatsapp_message(
            direction="saliente",
            conversation_id=conversation_id,
            contact_id=contact_id,
            body=assistant_reply.text,
            message_sid=send_result.sid,
            response_id=assistant_reply.response_id,
            metadata=metadata,
            wa_id=message.wa_id,
            phone_e164=normalized_from,
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


async def _generate_assistant_reply(
    *,
    message: schemas.WhatsAppIncomingMessage,
    conversation_id: str,
    contact_id: str,
    openai_conversation_id: str | None,
    previous_response_id: str | None,
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
    request_kwargs: dict[str, Any] = {
        "input": _build_openai_input(message),
        "store": True,
        "metadata": metadata_payload,
    }

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


async def _send_whatsapp_reply(*, to_number: str, body: str) -> TwilioSendResult:
    """Envía la respuesta al contacto utilizando la API de Twilio."""
    if (
        not settings.twilio_phone_number
        or not settings.twilio_account_sid
        or not settings.twilio_auth_token
    ):
        logger.warning("whatsapp.twilio_not_configured")
        return TwilioSendResult(sid=None, status="skipped", error="twilio_not_configured")

    normalized_to = to_number or ""
    if normalized_to and not normalized_to.lower().startswith("whatsapp:"):
        normalized_to = f"whatsapp:{normalized_to}"
    normalized_from = settings.twilio_phone_number
    if normalized_from and not normalized_from.lower().startswith("whatsapp:"):
        normalized_from = f"whatsapp:{normalized_from}"

    client = twilio_service.get_twilio_client()
    try:
        message = await asyncio.to_thread(
            client.messages.create,
            to=normalized_to,
            from_=normalized_from,
            body=body,
        )
    except Exception as exc:  # pragma: no cover - errores propios del SDK
        logger.exception("whatsapp.twilio_send_failed", extra={"error": str(exc)})
        return TwilioSendResult(sid=None, status="failed", error=str(exc))

    status = getattr(message, "status", None)
    return TwilioSendResult(sid=getattr(message, "sid", None), status=status, error=None)


def _build_openai_input(message: schemas.WhatsAppIncomingMessage) -> list[dict[str, Any]]:
    """Normaliza el contenido del mensaje para Responses API."""
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

    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "\n\n".join(text_parts),
                }
            ],
        }
    ]


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
