"""Servicios asociados al canal webchat."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.assistants import manager
from app.channels.webchat.schemas import WebchatMessage, WebchatResponse
from app.core.logging import get_logger, log_event
from app.services import geolocation, storage, user_agent
from app.services import openai as openai_service


class AssistantConfigError(RuntimeError):
    """Se lanza cuando faltan configuraciones requeridas para el asistente."""


class AssistantServiceError(RuntimeError):
    """Errores generales al interactuar con el asistente."""


logger = get_logger(__name__)


@dataclass(slots=True)
class AssistantReply:
    """Modelo interno con la respuesta del asistente y metadatos."""

    text: str
    response_id: str | None = None


async def handle_webchat_message(
    message: WebchatMessage, *, request: Request | None = None
) -> WebchatResponse:
    """Orquesta la conversación con el asistente y formatea la respuesta."""
    metadata: dict[str, Any] = {}
    request_context = await _extract_request_context(request)

    try:
        record = await storage.record_webchat_message(
            session_id=message.session_id,
            author=message.author or "user",
            content=message.content,
            metadata={
                key: value
                for key, value in {
                    "locale": message.locale,
                    **request_context,
                }.items()
                if value is not None
            },
        )
        metadata["conversation_id"] = record.conversation_id
        metadata["last_message_id"] = record.message_id
        log_event(
            logger,
            "webchat.message_received",
            conversation_id=record.conversation_id,
            message_id=record.message_id,
            session_id=message.session_id,
            author=message.author or "user",
        )
    except storage.StorageError:
        logger.exception("No se pudo registrar el mensaje entrante en Supabase")

    reply = await _generate_assistant_reply(message)

    try:
        out_metadata = {
            "locale": message.locale,
            "in_reply_to": metadata.get("last_message_id"),
            **request_context,
        }
        record = await storage.record_webchat_message(
            session_id=message.session_id,
            author="assistant",
            content=reply.text,
            response_id=reply.response_id,
            metadata={key: value for key, value in out_metadata.items() if value is not None},
        )
        metadata["assistant_message_id"] = record.message_id
        metadata.setdefault("conversation_id", record.conversation_id)
        if reply.response_id:
            metadata["assistant_response_id"] = reply.response_id
        log_event(
            logger,
            "webchat.message_sent",
            conversation_id=record.conversation_id,
            message_id=record.message_id,
            session_id=message.session_id,
            response_id=reply.response_id,
        )
    except storage.StorageError:
        logger.exception("No se pudo registrar la respuesta del asistente en Supabase")

    return WebchatResponse(
        session_id=message.session_id,
        reply=reply.text,
        metadata=metadata or None,
    )


async def _generate_assistant_reply(message: WebchatMessage) -> AssistantReply:
    """Genera una respuesta del asistente usando OpenAI."""
    try:
        assistant_cfg = manager.get_landing_assistant()
    except RuntimeError as exc:
        raise AssistantConfigError(str(exc)) from exc

    try:
        client = openai_service.get_assistant_client()
    except RuntimeError as exc:
        raise AssistantConfigError(str(exc)) from exc

    request_payload: dict[str, Any] = {
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": message.content,
                    }
                ],
            }
        ],
        "metadata": {
            "channel": "webchat",
            "session_id": message.session_id,
            "locale": message.locale or "",
        },
    }

    identifier = assistant_cfg.assistant_id
    if identifier.startswith("pmpt_"):
        request_payload["prompt"] = {"id": identifier}
    else:
        request_payload["assistant_id"] = identifier

    try:
        response = await client.responses.create(**request_payload)
    except Exception as exc:  # pragma: no cover - dependerá de SDK
        logger.exception("Error llamando al asistente de OpenAI")
        raise AssistantServiceError("Error al llamar al asistente") from exc

    reply_text = _extract_text_from_response(response)
    if not reply_text:
        logger.warning("Respuesta sin texto", extra={"response": _safe_dump(response)})
    if not reply_text:
        raise AssistantServiceError("El asistente respondió sin contenido de texto")
    response_id = _extract_response_id(response)
    return AssistantReply(text=reply_text, response_id=response_id)


def _extract_text_from_response(response: Any) -> str | None:
    """Extrae el texto plano del objeto `response` devuelto por OpenAI."""
    if hasattr(response, "output_text") and response.output_text:
        if isinstance(response.output_text, list):
            return "\n".join(response.output_text)
        return str(response.output_text)

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
            content_type = content_dict.get("type")
            if content_type in {"text", "output_text"}:
                text_value = content_dict.get("text") or {}
                if isinstance(text_value, dict):
                    value = text_value.get("value") or text_value.get("text")
                else:
                    value = text_value
                if value:
                    return value
    return None


def _extract_response_id(response: Any) -> str | None:
    """Intenta obtener el identificador único de la respuesta generada."""

    response_id = getattr(response, "id", None)
    if response_id:
        return str(response_id)

    if hasattr(response, "model_dump"):
        try:
            data = response.model_dump()
            if isinstance(data, dict) and data.get("id"):
                return str(data["id"])
        except Exception:  # pragma: no cover - best effort
            return None

    if isinstance(response, dict) and response.get("id"):
        return str(response["id"])

    return None


async def _extract_request_context(request: Request | None) -> dict[str, Any]:
    """Construye metadata con IP, user-agent y geolocalización aproximada."""

    if request is None:
        return {}

    headers = request.headers or {}
    ua_string = headers.get("user-agent")

    ip = None
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client:
        ip = request.client.host

    geo = await geolocation.lookup_ip(ip)
    device_type = user_agent.infer_device_type(ua_string)

    context: dict[str, Any] = {}
    if ip:
        context["ip"] = ip
    if ua_string:
        context["user_agent"] = ua_string
    if geo:
        context["geo"] = geo
    if device_type:
        context["device_type"] = device_type

    return context


def _safe_dump(response: Any) -> dict[str, Any]:
    """Serializa parcialmente la respuesta para logging."""
    if hasattr(response, "model_dump"):
        try:
            data = response.model_dump(exclude_none=True)
            data.pop("usage", None)
            return {"output": data.get("output"), "id": data.get("id")}
        except Exception:  # pragma: no cover
            return {"repr": repr(response)}
    if isinstance(response, dict):
        return response
    return {"repr": repr(response)}


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
