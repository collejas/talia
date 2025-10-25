"""Servicios asociados al canal webchat."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.assistants import manager
from app.channels.webchat.schemas import (
    WebchatHistoryResponse,
    WebchatMessage,
    WebchatResponse,
)
from app.core.logging import get_logger, log_event
from app.services import geolocation, storage, user_agent
from app.services import openai as openai_service
from app.services.lead_pipeline import LeadPipelineError, LeadPipelineService


class AssistantConfigError(RuntimeError):
    """Se lanza cuando faltan configuraciones requeridas para el asistente."""


class AssistantServiceError(RuntimeError):
    """Errores generales al interactuar con el asistente."""


logger = get_logger(__name__)

# Cache en memoria para mapear session_id -> OpenAI conversation_id ("conv_...")
_CONVERSATION_CACHE: dict[str, str] = {}

_lead_pipeline = LeadPipelineService()


@dataclass(slots=True)
class AssistantReply:
    """Modelo interno con la respuesta del asistente y metadatos."""

    text: str
    response_id: str | None = None
    response_conversation_id: str | None = None


async def handle_webchat_message(
    message: WebchatMessage, *, request: Request | None = None
) -> WebchatResponse:
    """Orquesta la conversación con el asistente y formatea la respuesta."""
    metadata: dict[str, Any] = {}
    request_context = await _extract_request_context(request)

    conversation_id: str | None = None
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
        conversation_id = record.conversation_id
        metadata["last_message_id"] = record.message_id
        log_event(
            logger,
            "webchat.message_received",
            conversation_id=record.conversation_id,
            message_id=record.message_id,
            session_id=message.session_id,
            author=message.author or "user",
        )
        if record.conversation_id:
            asyncio.create_task(
                _sync_pipeline(
                    record.conversation_id,
                    canal="webchat",
                    metadata={"ultimo_autor": message.author or "user"},
                )
            )
    except storage.StorageError:
        logger.exception("No se pudo registrar el mensaje entrante en Supabase")

    manual_override = False
    if conversation_id:
        try:
            manual_override = await storage.get_manual_override(conversation_id)
        except storage.StorageError:
            logger.exception("No se pudo consultar el modo manual de la conversación")

    if manual_override:
        metadata["manual_mode"] = True
        return WebchatResponse(
            session_id=message.session_id,
            reply="",
            metadata=metadata or None,
        )

    # Recupera conversation_id de OpenAI desde cache/BD (si existe)
    conversation_for_ai = (
        record.conversation_openai_id
        if (
            "record" in locals()
            and record.conversation_openai_id
            and record.conversation_openai_id.startswith("conv")
        )
        else _CONVERSATION_CACHE.get(message.session_id)
    )

    # Si aún no hay conv_..., intenta crearlo explícitamente en OpenAI
    if not conversation_for_ai:
        try:
            client = openai_service.get_assistant_client()
            conversation_for_ai = await _create_openai_conversation_id(client)
            if conversation_for_ai:
                _CONVERSATION_CACHE[message.session_id] = conversation_for_ai
        except Exception:
            # Continuamos sin conversation; el modelo responderá sin memoria
            conversation_for_ai = None

    reply = await _generate_assistant_reply(message, conversation_id=conversation_for_ai)

    try:
        out_metadata = {
            "locale": message.locale,
            "in_reply_to": metadata.get("last_message_id"),
            **request_context,
        }
        # Si obtuvimos un conversation_id de OpenAI, actualiza cache
        if reply.response_conversation_id:
            _CONVERSATION_CACHE[message.session_id] = reply.response_conversation_id

        record = await storage.record_webchat_message(
            session_id=message.session_id,
            author="assistant",
            content=reply.text,
            response_id=reply.response_id,
            metadata={
                key: value
                for key, value in {
                    **out_metadata,
                    "openai_conversation_id": reply.response_conversation_id,
                }.items()
                if value is not None
            },
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


async def _sync_pipeline(conversation_id: str, *, canal: str, metadata: dict[str, Any]) -> None:
    try:
        await _lead_pipeline.ensure_card_for_conversation(
            conversation_id=conversation_id,
            canal=canal,
            metadata=metadata,
        )
    except LeadPipelineError:
        logger.exception(
            "webchat.pipeline_sync_failed",
            extra={"conversation_id": conversation_id, "canal": canal},
        )


async def _generate_assistant_reply(
    message: WebchatMessage, *, conversation_id: str | None = None
) -> AssistantReply:
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

    # Añadimos el identificador de conversación solo si parece válido (conv...)
    if conversation_id and str(conversation_id).startswith("conv"):
        request_payload["conversation"] = conversation_id

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
    response_conv_id = _extract_conversation_id(response)
    return AssistantReply(
        text=reply_text, response_id=response_id, response_conversation_id=response_conv_id
    )


async def get_webchat_history(
    *, session_id: str, limit: int = 50, since: str | None = None
) -> WebchatHistoryResponse:
    """Obtiene historial de mensajes almacenados para un session_id de webchat."""
    try:
        rows = await storage.fetch_webchat_history(session_id=session_id, limit=limit, since=since)
    except storage.StorageError as exc:
        logger.exception("No se pudo obtener historial de webchat", exc_info=exc)
        raise AssistantServiceError("No se pudo recuperar el historial") from exc

    messages: list[dict[str, Any]] = []
    for row in rows:
        metadata = row.get("datos") or {}
        messages.append(
            {
                "message_id": str(row.get("id")),
                "direction": row.get("direccion") or "entrante",
                "content": row.get("texto") or "",
                "created_at": row.get("creado_en"),
                "sender_type": metadata.get("sender_type"),
                "metadata": metadata or None,
            }
        )

    next_since = None
    if rows:
        # Usa timestamp del último mensaje como cursor simple
        next_since = rows[-1].get("creado_en")

    return WebchatHistoryResponse(
        session_id=session_id,
        messages=messages,
        next_since=next_since,
    )


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


def _extract_conversation_id(response: Any) -> str | None:
    """Extrae el ID de conversación de OpenAI (conv_...)."""
    conv = getattr(response, "conversation", None)
    if conv is not None:
        conv_id = getattr(conv, "id", None)
        if isinstance(conv_id, str) and conv_id.startswith("conv"):
            return conv_id

    if hasattr(response, "model_dump"):
        try:
            data = response.model_dump()
            if isinstance(data, dict):
                conv_obj = data.get("conversation")
                if isinstance(conv_obj, dict):
                    conv_id = conv_obj.get("id")
                    if isinstance(conv_id, str) and conv_id.startswith("conv"):
                        return conv_id
                conv_id = data.get("conversation_id")
                if isinstance(conv_id, str) and conv_id.startswith("conv"):
                    return conv_id
        except Exception:  # pragma: no cover - best effort
            return None

    if isinstance(response, dict):
        conv_obj = response.get("conversation")
        if isinstance(conv_obj, dict):
            conv_id = conv_obj.get("id")
            if isinstance(conv_id, str) and conv_id.startswith("conv"):
                return conv_id
        conv_id = response.get("conversation_id")
        if isinstance(conv_id, str) and conv_id.startswith("conv"):
            return conv_id

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


async def _create_openai_conversation_id(client: Any) -> str | None:
    """Crea un nuevo conversation en OpenAI y retorna su id (conv_...)."""
    try:
        # Algunos SDKs exponen `client.conversations.create()`
        conv = await client.conversations.create()  # type: ignore[attr-defined]
        conv_id = getattr(conv, "id", None) or (conv.get("id") if isinstance(conv, dict) else None)
        if isinstance(conv_id, str) and conv_id.startswith("conv"):
            return conv_id
    except Exception:
        return None
    return None
