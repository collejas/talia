"""Lógica central del canal Messenger."""

from __future__ import annotations

import hmac
import hashlib
import json
from dataclasses import dataclass
from hashlib import sha1
from typing import Any

import httpx

from app.assistants import registry
from app.assistants.runtime import build_prompt_payload, resolve_assistant_spec
from app.assistants.tool_runtime import ToolRuntimeContext, run_tool_loop
from app.assistants.tools import lead as lead_tools
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import conversation_summary, storage
from app.services.context_formatter import build_crm_context_lines
from app.services import openai as openai_service
from app.services.storage import StorageError

logger = get_logger("app.channels.messenger")

DEFAULT_FALLBACK = (
    "Tu mensaje quedó registrado, pero tuve un problema momentáneo al responder. "
    "Intentemos nuevamente en unos instantes."
)

MESSENGER_API_VERSION = "v17.0"
MESSENGER_VERIFY_TOKEN = settings.messenger_verify_token


class MessengerServiceError(RuntimeError):
    pass


@dataclass(slots=True)
class MessengerPayload:
    sender_id: str
    recipient_id: str
    message_id: str
    text: str | None
    attachments: list[dict[str, Any]] | None


def _ht_digest(payload: bytes, secret: str, algorithm: str) -> str:
    secret_bytes = secret.encode("ascii")
    if algorithm == "sha1":
        return hmac.new(secret_bytes, payload, sha1).hexdigest()
    return hmac.new(secret_bytes, payload, getattr(hashlib, algorithm)).hexdigest()


def verify_signature(payload: bytes, signature: str | None) -> bool:
    secret_value = settings.messenger_app_secret
    if not secret_value:
        return True
    if not signature:
        return False
    parts = signature.split("=", 1)
    if len(parts) != 2:
        return False
    algo, value = parts
    algo = algo.strip().lower()
    if algo not in {"sha1", "sha256"}:
        return False
    try:
        expected = _ht_digest(payload, secret_value, algo)
    except AttributeError:
        return False
    return hmac.compare_digest(expected, value)


def _normalize_page_id(value: str | None) -> str | None:
    if not value:
        return None
    candidate = str(value).strip()
    return candidate or None


def _resolve_messenger_organizacion(page_id: str | None) -> str | None:
    normalized_id = _normalize_page_id(page_id)
    if normalized_id:
        mapped = settings.messenger_page_organizacion_map.get(normalized_id.lower())
        if mapped:
            return mapped
    return settings.messenger_default_organizacion_id


def _build_openai_input(
    *,
    text: str | None,
    attachments: list[dict[str, Any]] | None,
    context_data: dict[str, Any] | None,
    summary_text: str | None,
    summary_created_en: str | None,
) -> list[dict[str, Any]]:
    text_parts: list[str] = []
    if text and text.strip():
        text_parts.append(text.strip())
    if attachments:
        attachment_lines = []
        for index, attachment in enumerate(attachments):
            attachment_type = str(attachment.get("type") or "archivo")
            payload = attachment.get("payload") or {}
            url = payload.get("url") or payload.get("attachment_url")
            if url:
                attachment_lines.append(f"- ({index + 1}) {attachment_type}: {url}")
            else:
                attachment_lines.append(f"- ({index + 1}) {attachment_type}")
        if attachment_lines:
            text_parts.append("El usuario adjuntó archivos:\n" + "\n".join(attachment_lines))
    if not text_parts:
        text_parts.append("(mensaje sin texto)")

    context_lines = build_crm_context_lines(context_data)
    if context_lines:
        text_parts.append("")
        text_parts.extend(context_lines)

    if summary_text:
        header = "Resumen previo"
        if summary_created_en:
            header += f" ({summary_created_en})"
        text_parts.append("")
        text_parts.append(f"{header}: {summary_text}")

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
                    fragments.append(str(text).strip())
    if fragments:
        return "\n".join(fragment for fragment in fragments if fragment)
    if payload.get("status") in {"completed", "requires_action"}:
        return None
    logger.warning("messenger.response_unexpected", extra={"output": payload.get("output")})
    return None


async def _execute_lead_tool(
    name: str | None, arguments_payload: Any, context: ToolRuntimeContext
) -> dict[str, Any]:
    if not name:
        raise ValueError("Nombre de función ausente")

    if isinstance(arguments_payload, str):
        try:
            arguments = json.loads(arguments_payload)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Arguments inválidos: {arguments_payload!r}") from exc
    elif isinstance(arguments_payload, dict):
        arguments = arguments_payload
    else:
        raise ValueError(f"Tipo de argumentos no soportado: {type(arguments_payload)!r}")

    result = await lead_tools.try_execute_lead_tool(name, arguments, context)
    if result is None:
        raise ValueError(f"La función '{name}' no está disponible en Messenger")
    return result


async def _send_messenger_reply(*, page_id: str, recipient_id: str, text: str) -> bool:
    token = settings.messenger_page_access_token
    if not token:
        logger.warning("messenger.reply_skipped_no_token")
        return False
    page_key = _normalize_page_id(page_id)
    if not page_key:
        logger.warning("messenger.reply_skipped_no_page")
        return False
    url = f"https://graph.facebook.com/{MESSENGER_API_VERSION}/{page_key}/messages"
    payload = {
        "messaging_type": "RESPONSE",
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        logger.exception("messenger.reply_request_failed", extra={"error": str(exc)})
        return False
    if response.status_code >= 400:
        logger.warning(
            "messenger.reply_failed",
            extra={
                "status_code": response.status_code,
                "body": response.text,
                "recipient_id": recipient_id,
            },
        )
        return False
    log_event(
        logger,
        "messenger.reply_sent",
        recipient_id=recipient_id,
        page_id=page_key,
    )
    return True


async def _handle_message(
    message: dict[str, Any], sender: dict[str, Any], page_id: str | None
) -> None:
    if message.get("is_echo"):
        log_event(logger, "messenger.echo_ignored", payload=message)
        return

    sender_id = (sender.get("id") or "").strip()
    if not sender_id:
        log_event(logger, "messenger.sender_missing", payload=message)
        return

    page_key = (page_id or "").strip()
    if not page_key:
        log_event(logger, "messenger.page_missing", sender_id=sender_id)
        return

    org_id = _resolve_messenger_organizacion(page_id)
    if not org_id:
        log_event(
            logger,
            "messenger.organizacion_unresolved",
            sender_id=sender_id,
            page_id=page_id,
        )
        return

    raw_text = message.get("text")
    if isinstance(raw_text, dict):
        raw_text = raw_text.get("text")
    text_content = str(raw_text).strip() if raw_text is not None else None

    attachments = message.get("attachments") or []
    if not isinstance(attachments, list):
        attachments = []

    payload = MessengerPayload(
        sender_id=sender_id,
        recipient_id=page_key,
        message_id=str(message.get("mid") or ""),
        text=text_content,
        attachments=attachments,
    )

    log_event(
        logger,
        "messenger.incoming_message_received",
        sender_id=payload.sender_id,
        page_id=payload.recipient_id,
    )

    try:
        registro = await storage.register_messenger_message(
            sender_id=payload.sender_id,
            recipient_id=payload.recipient_id,
            message_id=payload.message_id or None,
            text=payload.text,
            direction="entrante",
            metadata={"messenger_event": message},
            inactivity_hours=settings.messenger_inactivity_hours,
            attachments=payload.attachments,
            organizacion_id=org_id,
        )
    except StorageError as exc:
        logger.exception("messenger.register_failed", extra={"error": str(exc)})
        return

    conversation_id = str(registro.get("conversation_id") or "")
    contact_id = str(registro.get("contact_id") or "")
    if not conversation_id or not contact_id:
        logger.warning(
            "messenger.registration_incomplete",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return

    try:
        await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel="messenger",
            force_new_opportunity_on_restart=True,
            include_restart_metadata=False,
        )
    except StorageError as exc:
        logger.warning(
            "messenger.ensure_opportunity_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )

    contact_context: dict[str, Any] | None = None
    try:
        contact_context = await storage.fetch_contact_context(
            conversation_id=conversation_id,
            contact_id=contact_id,
        )
    except StorageError as exc:
        logger.warning(
            "messenger.fetch_contact_context_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    summary_text = None
    summary_record: dict[str, Any] | None = None
    summary_created_en = None
    try:
        summary_record = await conversation_summary.ensure_conversation_summary(
            conversation_id=conversation_id,
            contact_id=contact_id,
            organizacion_id=org_id,
            context_data=contact_context,
        )
        if summary_record:
            summary_text = (summary_record.get("resumen") or "").strip() or None
            summary_created_en = summary_record.get("creado_en")
    except Exception as exc:
        logger.warning(
            "messenger.conversation_summary_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    assistant = registry.resolve_assistant("messenger")
    client = openai_service.get_assistant_client()
    assistant_spec = None
    if not assistant.is_prompt:
        if not assistant.assistant_id:
            raise RuntimeError("MESSENGER_ASSISTANT_ID is not configured")
        assistant_spec = await resolve_assistant_spec(client, assistant.assistant_id)

    metadata_payload = {
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "channel": "messenger",
        "sender_id": payload.sender_id,
        "page_id": payload.recipient_id,
    }

    initial_input = _build_openai_input(
        text=payload.text,
        attachments=payload.attachments,
        context_data=contact_context,
        summary_text=summary_text,
        summary_created_en=summary_created_en,
    )

    request_kwargs: dict[str, Any] = {
        "input": initial_input,
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
        payload = {"model": assistant_spec.model}
        if assistant_spec.instructions:
            payload["instructions"] = assistant_spec.instructions
        if assistant_spec.tools:
            payload["tools"] = assistant_spec.tools
        return payload

    request_kwargs.update(_build_request_template())

    openai_conversation_id = registro.get("openai_conversation_id")
    previous_response_id = None
    try:
        conversation_meta = await storage.fetch_conversation(conversation_id)
    except StorageError as exc:
        logger.warning(
            "messenger.fetch_conversation_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        conversation_meta = {}
    else:
        previous_response_id = conversation_meta.get("last_response_id")
        openai_conversation_id = openai_conversation_id or conversation_meta.get("openai_conversation_id")
        if conversation_meta.get("manual_override"):
            log_event(
                logger,
                "messenger.manual_override_active",
                conversation_id=conversation_id,
            )
            return

    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    runtime_context = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=contact_id,
        session_id=f"messenger:{conversation_id}",
        channel="messenger",
    )

    try:
        result = await run_tool_loop(
            client=client,
            assistant=assistant,
            assistant_spec=assistant_spec,
            context=runtime_context,
            initial_request=request_kwargs,
            request_template=_build_request_template,
            execute_tool=lambda name, args, _: _execute_lead_tool(name, args, runtime_context),
            openai_conversation_id=openai_conversation_id,
            previous_response_id=previous_response_id,
            log=logger,
        )
    except Exception as exc:  # pragma: no cover - defensivo ante fallos externos
        logger.exception(
            "messenger.run_tool_loop_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        reply_text = DEFAULT_FALLBACK
    else:
        reply_text = _extract_text_from_response(result.response) or DEFAULT_FALLBACK

    if reply_text:
        sent_ok = await _send_messenger_reply(
            page_id=payload.recipient_id,
            recipient_id=payload.sender_id,
            text=reply_text,
        )
        if sent_ok:
            outgoing_metadata = {
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "channel": "messenger",
                "sender_id": payload.sender_id,
                "page_id": payload.recipient_id,
            }
            if result.conversation_id:
                outgoing_metadata["openai_conversation_id"] = result.conversation_id
            try:
                await storage.register_messenger_message(
                    sender_id=payload.sender_id,
                    recipient_id=payload.recipient_id,
                    message_id=None,
                    text=reply_text,
                    direction="saliente",
                    metadata=outgoing_metadata,
                    response_id=result.response_id or None,
                    organizacion_id=org_id,
                )
            except StorageError as exc:  # pragma: no cover - fallo secundario
                logger.warning(
                    "messenger.outgoing_register_failed",
                    extra={"conversation_id": conversation_id, "error": str(exc)},
                )
            try:
                await storage.update_conversation(
                    conversation_id,
                    {
                        "last_response_id": result.response_id,
                        "conversacion_openai_id": result.conversation_id,
                    },
                )
            except storage.StorageError as exc:  # pragma: no cover
                logger.warning(
                    "messenger.conversation_update_failed",
                    extra={"conversation_id": conversation_id, "error": str(exc)},
                )


async def handle_webhook(payload: dict[str, Any]) -> None:
    entries = payload.get("entry") or []
    for entry in entries:
        page_id = entry.get("id")
        messaging = entry.get("messaging") or []
        for event in messaging:
            message = event.get("message")
            sender = event.get("sender") or {}
            if message and sender:
                try:
                    await _handle_message(message, sender, page_id)
                except Exception as exc:  # pragma: no cover - defensivo para no bloquear el webhook
                    logger.exception("messenger.message_processing_failed", extra={"error": str(exc)})
