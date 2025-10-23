"""Servicios asociados al canal webchat."""

from __future__ import annotations

from typing import Any

from app.assistants import manager
from app.channels.webchat.schemas import WebchatMessage, WebchatResponse
from app.services import openai as openai_service


class AssistantConfigError(RuntimeError):
    """Se lanza cuando faltan configuraciones requeridas para el asistente."""


class AssistantServiceError(RuntimeError):
    """Errores generales al interactuar con el asistente."""


async def handle_webchat_message(message: WebchatMessage) -> WebchatResponse:
    """Orquesta la conversación con el asistente y formatea la respuesta."""
    reply = await _generate_assistant_reply(message)
    return WebchatResponse(session_id=message.session_id, reply=reply)


async def _generate_assistant_reply(message: WebchatMessage) -> str:
    """Genera una respuesta del asistente usando OpenAI."""
    try:
        assistant_cfg = manager.get_landing_assistant()
    except RuntimeError as exc:
        raise AssistantConfigError(str(exc)) from exc

    try:
        client = openai_service.get_assistant_client()
    except RuntimeError as exc:
        raise AssistantConfigError(str(exc)) from exc

    try:
        response = await client.responses.create(
            assistant_id=assistant_cfg.assistant_id,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": message.content,
                        }
                    ],
                }
            ],
            metadata={
                "channel": "webchat",
                "session_id": message.session_id,
                "locale": message.locale or "",
            },
        )
    except Exception as exc:  # pragma: no cover - dependerá de SDK
        raise AssistantServiceError("Error al llamar al asistente") from exc

    reply_text = _extract_text_from_response(response)
    if not reply_text:
        raise AssistantServiceError("El asistente respondió sin contenido de texto")
    return reply_text


def _extract_text_from_response(response: Any) -> str | None:
    """Extrae el texto plano del objeto `response` devuelto por OpenAI."""
    output = getattr(response, "output", None)
    if not output and hasattr(response, "model_dump"):
        output = response.model_dump().get("output")
    if not output:
        return None

    for item in output:
        data = _to_dict(item)
        if data.get("type") != "message":
            continue
        message = data.get("message") or {}
        for content in message.get("content", []):
            content_dict = _to_dict(content)
            if content_dict.get("type") == "text":
                text = content_dict.get("text") or {}
                if isinstance(text, dict):
                    value = text.get("value") or text.get("text")
                else:
                    value = text
                if value:
                    return value
    return None


def _to_dict(item: Any) -> dict[str, Any]:
    """Convierte objetos de OpenAI a dict sin depender de tipos concretos."""
    if isinstance(item, dict):
        return item
    if hasattr(item, "dict"):
        return item.dict()  # type: ignore[no-any-return]
    if hasattr(item, "model_dump"):
        return item.model_dump()  # type: ignore[no-any-return]
    if hasattr(item, "__dict__"):
        return dict(item.__dict__)
    return {}
