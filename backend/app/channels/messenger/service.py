"""Lógica central del canal Messenger."""

from __future__ import annotations

import hmac
import json
from dataclasses import dataclass
from hashlib import sha1
from typing import Any

import httpx
from fastapi import HTTPException

from app.assistants import registry
from app.assistants.runtime import build_prompt_payload, resolve_assistant_spec
from app.assistants.tool_runtime import ToolRuntimeContext, run_tool_loop
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import storage

logger = get_logger("app.channels.messenger")


class MessengerServiceError(RuntimeError):
    pass


@dataclass(slots=True)
class MessengerPayload:
    sender_id: str
    recipient_id: str
    message_id: str
    text: str | None
    attachments: list[dict[str, Any]] | None


def _verify_signature(payload: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    secret = (settings.messenger_app_secret or "").encode("ascii")
    expected = hmac.new(secret, payload, sha1).hexdigest()
    return hmac.compare_digest(expected, signature.replace("sha1=", ""))


async def handle_webhook(payload: dict[str, Any]) -> None:
    entries = payload.get("entry") or []
    for entry in entries:
        messaging = entry.get("messaging") or []
        for event in messaging:
            if message := event.get("message"):
                await _handle_message(message, event.get("sender") or {}, entry.get("id"))


async def _handle_message(message: dict[str, Any], sender: dict[str, Any], page_id: str | None):
    sender_id = sender.get("id")
    if not sender_id:
        return
    payload = MessengerPayload(
        sender_id=sender_id,
        recipient_id=page_id or "",
        message_id=message.get("mid") or "",
        text=message.get("text"),
        attachments=message.get("attachments"),
    )
    registro = await storage.register_messenger_message(
        sender_id=payload.sender_id,
        recipient_id=payload.recipient_id,
        message_id=payload.message_id,
        text=payload.text,
        attachments=payload.attachments,
        organizacion_id=settings.messenger_default_organizacion_id,
    )
    conversation_id = registro.get("conversation_id")
    contact_id = registro.get("contact_id")
    if not conversation_id or not contact_id:
        raise MessengerServiceError("Registro incompleto")
    context = ToolRuntimeContext(conversation_id=conversation_id, contact_id=contact_id, channel="messenger")
    assistant_spec = resolve_assistant_spec(registry.get_assistant(settings.openai_assistant_id))
    request_payload = {"prompt": build_prompt_payload(assistant_spec, context)}
    await run_tool_loop(
        client=registry.client,
        assistant=registry.get_assistant(settings.openai_assistant_id),
        assistant_spec=assistant_spec,
        context=context,
        initial_request=request_payload,
        request_template=lambda: request_payload,
        execute_tool=lambda name, args, _: {},
        openai_conversation_id=None,
        previous_response_id=None,
    )
