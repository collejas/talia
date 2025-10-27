"""Servicios asociados al canal webchat."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
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


class AssistantConfigError(RuntimeError):
    """Se lanza cuando faltan configuraciones requeridas para el asistente."""


class AssistantServiceError(RuntimeError):
    """Errores generales al interactuar con el asistente."""


logger = get_logger(__name__)

REGISTER_LEAD_TOOL: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "register_lead",
        "function": {
            "name": "register_lead",
            "description": (
                "Registra en la base de datos los datos captados del prospecto cuando ya "
                "cuentas con al menos correo o teléfono para contactarlo."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "full_name": {
                        "type": "string",
                        "description": "Nombre completo del cliente potencial.",
                    },
                    "email": {
                        "type": "string",
                        "description": "Correo electrónico validado con formato estándar.",
                    },
                    "phone_number": {
                        "type": "string",
                        "description": "Teléfono en formato internacional (idealmente E.164).",
                    },
                    "company_name": {
                        "type": "string",
                        "description": "Nombre de la empresa o negocio del prospecto.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notas adicionales relevantes sobre el cliente.",
                    },
                    "necesidad_proposito": {
                        "type": "string",
                        "description": "Necesidad principal o propósito mencionado por el prospecto.",
                    },
                },
                "required": [
                    "full_name",
                    "email",
                    "phone_number",
                    "company_name",
                    "notes",
                ],
                "additionalProperties": False,
            },
        },
    }
]

# Cache en memoria para mapear session_id -> OpenAI conversation_id ("conv_...")
_CONVERSATION_CACHE: dict[str, str] = {}


@dataclass(slots=True)
class AssistantReply:
    """Modelo interno con la respuesta del asistente y metadatos."""

    text: str
    response_id: str | None = None
    response_conversation_id: str | None = None


@dataclass(slots=True)
class ToolCall:
    """Representa una invocación de herramienta emitida por el asistente."""

    id: str
    name: str
    arguments: dict[str, Any]


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PHONE_DIGITS = 8


async def handle_webchat_message(
    message: WebchatMessage, *, request: Request | None = None
) -> WebchatResponse:
    """Orquesta la conversación con el asistente y formatea la respuesta."""
    metadata: dict[str, Any] = {"manual_mode": False}
    request_context = await _extract_request_context(request)

    conversation_id: str | None = None
    incoming_record: storage.WebchatRecord | None = None
    existing_message: storage.WebchatStoredMessage | None = None

    if message.client_message_id:
        metadata["client_message_id"] = message.client_message_id
        try:
            existing_message = await storage.find_webchat_message_by_client_id(
                session_id=message.session_id,
                client_message_id=message.client_message_id,
            )
        except storage.StorageError:
            logger.exception("No se pudo verificar duplicados del mensaje entrante")

    if existing_message:
        conversation_id = existing_message.conversation_id
        metadata["conversation_id"] = existing_message.conversation_id
        metadata["last_message_id"] = existing_message.message_id
        log_event(
            logger,
            "webchat.message_duplicate_detected",
            conversation_id=existing_message.conversation_id,
            message_id=existing_message.message_id,
            session_id=message.session_id,
        )
    else:
        try:
            incoming_record = await storage.record_webchat_message(
                session_id=message.session_id,
                author=message.author or "user",
                content=message.content,
                metadata={
                    key: value
                    for key, value in {
                        "locale": message.locale,
                        "client_message_id": message.client_message_id,
                        **request_context,
                    }.items()
                    if value is not None
                },
            )
            metadata["conversation_id"] = incoming_record.conversation_id
            conversation_id = incoming_record.conversation_id
            metadata["last_message_id"] = incoming_record.message_id
            log_event(
                logger,
                "webchat.message_received",
                conversation_id=incoming_record.conversation_id,
                message_id=incoming_record.message_id,
                session_id=message.session_id,
                author=message.author or "user",
            )
        except storage.StorageError:
            logger.exception("No se pudo registrar el mensaje entrante en Supabase")

    manual_override = False
    if conversation_id:
        try:
            manual_override = await storage.get_manual_override(conversation_id)
        except storage.StorageError:
            logger.exception("No se pudo consultar el modo manual de la conversación")

    metadata["manual_mode"] = manual_override
    if manual_override:
        return WebchatResponse(
            session_id=message.session_id,
            reply="",
            metadata=metadata,
        )

    reuse_reply: storage.WebchatStoredMessage | None = None
    if existing_message and conversation_id and metadata.get("last_message_id"):
        try:
            reuse_reply = await storage.fetch_webchat_reply_for_message(
                conversation_id=conversation_id,
                in_reply_to=str(metadata["last_message_id"]),
            )
        except storage.StorageError:
            logger.exception("No se pudo recuperar respuesta previa para mensaje duplicado")

    if reuse_reply and reuse_reply.content is not None:
        stored_meta = reuse_reply.metadata or {}
        if isinstance(stored_meta, dict):
            response_id = stored_meta.get("assistant_response_id")
            if isinstance(response_id, str):
                metadata["assistant_response_id"] = response_id
            conv_hint = stored_meta.get("openai_conversation_id")
            if isinstance(conv_hint, str) and conv_hint.startswith("conv"):
                _CONVERSATION_CACHE[message.session_id] = conv_hint
        metadata["assistant_message_id"] = reuse_reply.message_id
        metadata.setdefault("conversation_id", reuse_reply.conversation_id)
        metadata["manual_mode"] = False
        return WebchatResponse(
            session_id=message.session_id,
            reply=reuse_reply.content or "",
            metadata=metadata,
        )

    conversation_for_ai: str | None = None
    recently_closed = False
    try:
        recently_closed = await storage.is_webchat_session_recently_closed(message.session_id)
    except storage.StorageError:
        recently_closed = False

    force_reset = bool(message.fresh_load)
    if force_reset:
        log_event(
            logger,
            "webchat.conversation_reset_reason",
            reason="fresh_load",
            session_id=message.session_id,
        )

    if recently_closed or force_reset:
        _CONVERSATION_CACHE.pop(message.session_id, None)

    if (
        not (recently_closed or force_reset)
        and incoming_record
        and incoming_record.conversation_openai_id
    ):
        conv_candidate = incoming_record.conversation_openai_id
        if isinstance(conv_candidate, str) and conv_candidate.startswith("conv"):
            conversation_for_ai = conv_candidate
    if (
        not (recently_closed or force_reset)
        and not conversation_for_ai
        and existing_message
        and existing_message.metadata
    ):
        conv_candidate = existing_message.metadata.get("openai_conversation_id")
        if isinstance(conv_candidate, str) and conv_candidate.startswith("conv"):
            conversation_for_ai = conv_candidate

    # Recupera conversation_id de OpenAI desde cache/BD (si existe)
    if not (recently_closed or force_reset) and not conversation_for_ai:
        conversation_for_ai = _CONVERSATION_CACHE.get(message.session_id)

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

    reply = await _generate_assistant_reply(
        message,
        conversation_id=conversation_for_ai,
        talia_conversation_id=metadata.get("conversation_id"),
    )

    try:
        out_metadata = {
            "locale": message.locale,
            "in_reply_to": metadata.get("last_message_id"),
            **request_context,
        }
        # Si obtuvimos un conversation_id de OpenAI, actualiza cache
        if reply.response_conversation_id:
            _CONVERSATION_CACHE[message.session_id] = reply.response_conversation_id

        response_record = await storage.record_webchat_message(
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
        metadata["assistant_message_id"] = response_record.message_id
        metadata.setdefault("conversation_id", response_record.conversation_id)
        if reply.response_id:
            metadata["assistant_response_id"] = reply.response_id
        log_event(
            logger,
            "webchat.message_sent",
            conversation_id=response_record.conversation_id,
            message_id=response_record.message_id,
            session_id=message.session_id,
            response_id=reply.response_id,
        )
    except storage.StorageError:
        logger.exception("No se pudo registrar la respuesta del asistente en Supabase")

    metadata["manual_mode"] = metadata.get("manual_mode", False)
    return WebchatResponse(
        session_id=message.session_id,
        reply=reply.text,
        metadata=metadata,
    )


async def close_session_conversation(session_id: str) -> None:
    """Cierra la conversación activa para un session_id y limpia cache/contexto.

    - Limpia el cache en memoria que mapea session_id -> conv_...
    - Inserta un mensaje de sistema en Supabase marcando el cierre de la sesión
      y solicitando a la capa de persistencia que cierre la conversación (estado="cerrada").
    """
    # Limpia cache local de conversación de OpenAI
    try:
        if session_id in _CONVERSATION_CACHE:
            _CONVERSATION_CACHE.pop(session_id, None)
    except Exception:
        pass

    # Intenta registrar un evento de cierre para que la lógica en BD cierre el hilo
    log_event(logger, "webchat.session_close_received", session_id=session_id)
    try:
        await storage.mark_webchat_session_closed(session_id)
        log_event(logger, "webchat.session_closed_marked", session_id=session_id)
        await storage.record_webchat_message(
            session_id=session_id,
            author="system",
            content="[webchat] session_closed",
            metadata={"event": "session_closed", "reason": "view_unload"},
        )
    except storage.StorageError:
        # Propaga como error de servicio para que el caller decida ignorar o no
        log_event(logger, "webchat.session_closed_mark_failed", session_id=session_id)
        raise AssistantServiceError("No se pudo registrar cierre de conversación")


async def _generate_assistant_reply(
    message: WebchatMessage,
    *,
    conversation_id: str | None = None,
    talia_conversation_id: str | None = None,
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

    # Política: solo habilitar tools cuando ya tengamos los 5 campos requeridos
    def _has_all_required_fields(text: str) -> bool:
        # Heurística simple basada en presencia de patrones; en producción, consultar estado/BD
        # Requeridos: full_name, email, phone_number, company_name, notes
        has_email = bool(EMAIL_REGEX.search(text))
        has_phone = bool(re.search(r"\+?\d[\d\s\-()]{7,}", text))
        has_name = bool(
            re.search(r"\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+){1,}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b", text)
        )
        has_company = bool(
            re.search(
                r"empresa|compañía|compania|S\.A\.|SAS|SRL|SL|LLC|Inc|\bSA\b", text, re.IGNORECASE
            )
        )
        has_notes = bool(
            len(text.strip()) > 40
        )  # pobre, pero evita tool prematura con saludo corto
        return has_email and has_phone and has_name and has_company and has_notes

    if _has_all_required_fields(message.content):
        request_payload["tools"] = REGISTER_LEAD_TOOL

    # Añadimos el identificador de conversación solo si parece válido (conv...)
    if conversation_id and str(conversation_id).startswith("conv"):
        request_payload["conversation"] = conversation_id

    identifier = assistant_cfg.assistant_id
    if identifier.startswith("pmpt_"):
        request_payload["prompt"] = {"id": identifier}
    else:
        request_payload["assistant_id"] = identifier

    # Serializa por conversación para evitar `conversation_locked`
    _locks: dict[str, asyncio.Lock] = getattr(_generate_assistant_reply, "_locks", {})  # type: ignore[attr-defined]
    if not _locks:
        setattr(_generate_assistant_reply, "_locks", _locks)  # type: ignore[attr-defined]

    lock_key = conversation_id or message.session_id
    lock = _locks.setdefault(lock_key, asyncio.Lock())

    try:
        async with lock:
            # 1) Crear respuesta inicial
            response = await client.responses.create(**request_payload)
            # 2) Procesar tool_calls ANTES de intentar extraer texto
            response = await _handle_tool_calls(
                client=client,
                response=response,
                talia_conversation_id=talia_conversation_id,
            )
    except Exception as exc:  # pragma: no cover - dependerá de SDK
        logger.exception("Error llamando al asistente de OpenAI")
        raise AssistantServiceError("Error al llamar al asistente") from exc

    # Importante: solo evaluamos texto después de procesar tool_calls
    reply_text = _extract_text_from_response(response)
    if not reply_text:
        logger.warning("Respuesta sin texto", extra={"response": _safe_dump(response)})
        # Fallback adicional: si hay function_call en raíz, enviar tool_output missing_fields
        try:
            raw = (
                response.model_dump()
                if hasattr(response, "model_dump")
                else (response if isinstance(response, dict) else {})
            )
            output_arr = raw.get("output") if isinstance(raw, dict) else None
            fallback_call_id = None
            fallback_wrapper_id = None
            # Obtener response_id de forma estricta del mismo objeto crudo
            raw_response_id = None
            if isinstance(raw, dict):
                rid = raw.get("id")
                if isinstance(rid, str):
                    raw_response_id = rid
            parsed_call_args: dict[str, Any] | None = None
            if isinstance(output_arr, list):
                for itm in output_arr:
                    if isinstance(itm, dict) and itm.get("type") in {"function_call", "tool_call"}:
                        # Formatos posibles
                        tool_call = itm.get("tool_call") or itm
                        # La API espera el call_id; algunos payloads traen ambos
                        fallback_call_id = (
                            tool_call.get("call_id") or tool_call.get("id") or itm.get("call_id")
                        )
                        fallback_wrapper_id = itm.get("id")
                        # Intentar leer argumentos si existen
                        args_raw = (
                            tool_call.get("function", {}).get("arguments")
                            if isinstance(tool_call.get("function"), dict)
                            else tool_call.get("arguments")
                        )
                        if isinstance(args_raw, str):
                            try:
                                parsed_call_args = json.loads(args_raw) if args_raw.strip() else {}
                            except json.JSONDecodeError:
                                parsed_call_args = {}
                        elif isinstance(args_raw, dict):
                            parsed_call_args = args_raw
                        else:
                            parsed_call_args = {}
                        break
            if fallback_call_id:
                log_event(
                    logger,
                    "webchat.tool_calls_fallback_detected",
                    response_id=raw_response_id or _extract_response_id(response),
                    call_id=fallback_call_id,
                    wrapper_id=fallback_wrapper_id,
                )
                # Si hay argumentos completos, procesar la herramienta; si no, missing_fields
                if isinstance(raw_response_id, str) and raw_response_id.startswith("resp_"):
                    tool_result: dict[str, Any]
                    if parsed_call_args and any(parsed_call_args.values()):
                        # Construir objeto ToolCall simulado para reutilizar _process_lead_capture_tool
                        sim_call = ToolCall(
                            id=str(fallback_call_id),
                            name="register_lead",
                            arguments=parsed_call_args,
                        )
                        tool_result = await _process_lead_capture_tool(
                            call=sim_call,
                            talia_conversation_id=talia_conversation_id,
                        )
                    else:
                        tool_result = {
                            "status": "error",
                            "message": "missing_fields",
                            "fields": [
                                "full_name",
                                "email",
                                "phone_number",
                                "company_name",
                                "notes",
                            ],
                        }
                    try:
                        response = await client.responses.submit_tool_outputs(  # type: ignore[attr-defined]
                            response_id=raw_response_id,
                            tool_outputs=[
                                {
                                    "tool_call_id": str(fallback_call_id),
                                    "output": json.dumps(tool_result, ensure_ascii=False),
                                }
                            ],
                        )
                    except Exception:
                        # Si incluso el submit falla, devolvemos mensaje guía y cortamos el ciclo
                        guide = "Para registrarte necesito 5 datos: nombre completo, correo, teléfono, empresa y una nota breve del contexto. ¿Me los confirmas?"
                        return AssistantReply(
                            text=guide,
                            response_id=None,
                            response_conversation_id=_extract_conversation_id(response),
                        )
                else:
                    log_event(
                        logger,
                        "webchat.tool_outputs_fallback_response_id_missing",
                        response_hint=_safe_dump(response),
                        call_id=fallback_call_id,
                    )
                    # Sin response_id válido, evita errores 400 devolviendo texto guía
                    guide = "Para registrarte necesito 5 datos: nombre completo, correo, teléfono, empresa y una nota breve del contexto. ¿Me los compartes?"
                    return AssistantReply(
                        text=guide,
                        response_id=None,
                        response_conversation_id=_extract_conversation_id(response),
                    )
                # Intentar extraer texto otra vez tras el submit
                reply_text = _extract_text_from_response(response)
        except Exception:
            # Ignorar errores en fallback y seguir al siguiente intento
            pass
        # Fallback final: solicitar un mini-turno de continuación
        if not reply_text:
            try:
                followup = await client.responses.create(
                    input=[
                        {
                            "role": "user",
                            "content": [{"type": "input_text", "text": "Continúa, por favor."}],
                        }
                    ],
                    conversation=_extract_conversation_id(response)
                    or request_payload.get("conversation"),
                    tools=REGISTER_LEAD_TOOL,
                    metadata=request_payload.get("metadata"),
                    assistant_id=request_payload.get("assistant_id"),
                    prompt=request_payload.get("prompt"),
                )
                reply_text = _extract_text_from_response(followup) or ""
                response = followup
            except Exception:
                # Si el fallback falla, devolvemos error como antes
                pass
        # Si aún no hay texto tras todos los intentos, devuelve guía para no cortar con 502
        if not reply_text:
            guide = "Para avanzar necesito: nombre completo, correo, teléfono, empresa y una nota breve. ¿Me los confirmas?"
            return AssistantReply(
                text=guide,
                response_id=None,
                response_conversation_id=_extract_conversation_id(response),
            )
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


async def _handle_tool_calls(
    *,
    client: Any,
    response: Any,
    talia_conversation_id: str | None,
) -> Any:
    """Gestiona los tool_calls devueltos por OpenAI (p.ej., register_lead)."""
    while True:
        tool_calls = _extract_tool_calls(response)
        if not tool_calls:
            return response

        log_event(
            logger,
            "webchat.tool_calls_detected",
            tool_calls=[
                {"id": call.id, "name": call.name, "arguments": call.arguments}
                for call in tool_calls
            ],
        )

        tool_outputs: list[dict[str, Any]] = []
        for call in tool_calls:
            if call.name != "register_lead":
                tool_outputs.append(
                    {
                        "tool_call_id": call.id,
                        "output": json.dumps(
                            {"status": "ignored", "reason": "unsupported_tool", "name": call.name}
                        ),
                    }
                )
                continue
            # Si los argumentos vienen vacíos, responde con missing_fields para cerrar el ciclo
            if not call.arguments:
                result = {
                    "status": "error",
                    "message": "missing_fields",
                    "fields": [
                        "full_name",
                        "email",
                        "phone_number",
                        "company_name",
                        "notes",
                    ],
                }
            else:
                result = await _process_lead_capture_tool(
                    call=call,
                    talia_conversation_id=talia_conversation_id,
                )
            tool_outputs.append(
                {"tool_call_id": call.id, "output": json.dumps(result, ensure_ascii=False)}
            )

        if not tool_outputs:
            return response

        response_id = getattr(response, "id", None)
        if response_id is None and isinstance(response, dict):
            response_id = response.get("id")
        if not response_id:
            logger.warning("Respuesta sin identificador, no se pueden enviar tool_outputs")
            return response

        try:
            log_event(
                logger,
                "webchat.tool_outputs_submitting",
                response_id=response_id,
                tool_outputs=tool_outputs,
            )
            try:
                response = await client.responses.submit_tool_outputs(  # type: ignore[attr-defined]
                    response_id=str(response_id),
                    tool_outputs=tool_outputs,
                )
            except Exception:
                # Reintento único con un pequeño backoff
                await asyncio.sleep(0.3)
                response = await client.responses.submit_tool_outputs(  # type: ignore[attr-defined]
                    response_id=str(response_id),
                    tool_outputs=tool_outputs,
                )
        except Exception:
            logger.exception(
                "No se pudieron enviar los resultados de herramienta a OpenAI (tras reintento)"
            )
            return response


def _extract_tool_calls(response: Any) -> list[ToolCall]:
    """Obtiene tool_calls (function calls) presentes en la respuesta."""
    output = getattr(response, "output", None)
    if output is None and hasattr(response, "model_dump"):
        try:
            data = response.model_dump()
            output = data.get("output")
        except Exception:
            output = None
    if output is None and isinstance(response, dict):
        output = response.get("output")
    if not output:
        return []

    calls: list[ToolCall] = []

    def _parse_call(data: dict[str, Any]) -> ToolCall | None:
        tool_info = data.get("tool_call") or data
        function_data = tool_info.get("function") or {}
        name = function_data.get("name")
        if not name:
            return None
        call_id = tool_info.get("id") or data.get("id")
        arguments = function_data.get("arguments")
        parsed_args: dict[str, Any]
        if isinstance(arguments, str):
            try:
                parsed_args = json.loads(arguments)
            except json.JSONDecodeError:
                parsed_args = {}
        elif isinstance(arguments, dict):
            parsed_args = arguments
        else:
            parsed_args = {}
        return ToolCall(id=str(call_id or name), name=str(name), arguments=parsed_args)

    for item in output:
        data = _to_dict(item)
        item_type = data.get("type")
        if item_type == "tool_call":
            call = _parse_call(data)
            if call:
                calls.append(call)
        elif item_type == "message":
            message = data.get("message") or {}
            tool_calls = message.get("tool_calls") or []
            for raw_call in tool_calls:
                call = _parse_call(_to_dict(raw_call))
                if call:
                    calls.append(call)
    return calls


async def _process_lead_capture_tool(
    *,
    call: ToolCall,
    talia_conversation_id: str | None,
) -> dict[str, Any]:
    """Ejecuta el registro de lead solicitado por el asistente."""
    if not talia_conversation_id:
        return {"status": "error", "message": "conversation_not_available"}

    args = call.arguments or {}
    full_name = (args.get("full_name") or "").strip()
    email_raw = (args.get("email") or "").strip()
    phone_raw = (args.get("phone_number") or "").strip()
    company = (args.get("company_name") or "").strip()
    notes = (args.get("notes") or "").strip()
    purpose = (args.get("necesidad_proposito") or "").strip()

    # Reglas: exigir al menos un dato de contacto (correo o teléfono)
    has_email = bool(email_raw)
    has_phone = bool(phone_raw)
    if not (has_email or has_phone):
        return {"status": "error", "message": "contact_info_required"}

    email = email_raw if has_email and EMAIL_REGEX.match(email_raw) else ""
    if has_email and not email:
        return {"status": "error", "message": "invalid_email"}

    sanitized_phone = _sanitize_phone_number(phone_raw)

    try:
        info = await storage.fetch_webchat_conversation_info(str(talia_conversation_id))
        if not info.contact_id:
            return {"status": "error", "message": "contact_not_found"}
        contact = await storage.fetch_contact(info.contact_id)
    except storage.StorageError:
        logger.exception("No se pudo obtener contacto para registrar lead")
        return {"status": "error", "message": "storage_error"}

    contacto_datos = contact.get("contacto_datos")
    if not isinstance(contacto_datos, dict):
        contacto_datos = {}
    merged_datos = dict(contacto_datos)
    if company:
        merged_datos["company_name"] = company
    if purpose:
        merged_datos["necesidad_proposito"] = purpose
    merged_datos["lead_capture_source"] = merged_datos.get("lead_capture_source") or "webchat"
    merged_datos["lead_capture_completed_at"] = datetime.now(timezone.utc).isoformat()
    merged_datos["lead_registered_by"] = "webchat"
    if email:
        merged_datos["email"] = email
    if phone_raw:
        merged_datos["phone_number"] = sanitized_phone or phone_raw
    if notes:
        merged_datos["lead_capture_notes"] = notes

    patch: dict[str, Any] = {"contacto_datos": merged_datos}
    if full_name:
        patch["nombre_completo"] = full_name
    if email:
        patch["correo"] = email
    if sanitized_phone:
        patch["telefono_e164"] = sanitized_phone
    elif phone_raw:
        patch["telefono_e164"] = phone_raw
    if company and not contact.get("origen"):
        patch.setdefault("origen", "webchat")
    if company:
        patch["company_name"] = company
    if notes:
        patch["notes"] = notes
    if purpose:
        patch["necesidad_proposito"] = purpose

    log_event(
        logger,
        "webchat.lead_capture_patch_built",
        contact_id=info.contact_id,
        patch=patch,
    )
    try:
        updated_contact = await storage.update_contact(info.contact_id, patch)
    except storage.StorageError:
        logger.exception("No se pudo actualizar el contacto capturado")
        return {"status": "error", "message": "contact_update_failed"}

    log_event(
        logger,
        "webchat.lead_capture_stored",
        conversation_id=talia_conversation_id,
        contact_id=info.contact_id,
        company=company,
    )

    return {
        "status": "success",
        "contact_id": info.contact_id,
        "applied_patch": patch,
        "updated_fields": {
            key: value
            for key, value in {
                "nombre_completo": full_name or contact.get("nombre_completo"),
                "correo": email or contact.get("correo"),
                "telefono_e164": sanitized_phone or phone_raw or contact.get("telefono_e164"),
                "company_name": company or contact.get("company_name"),
                "notes": notes or contact.get("notes"),
                "necesidad_proposito": purpose or contact.get("necesidad_proposito"),
            }.items()
            if value
        },
        "contacto_datos": updated_contact.get("contacto_datos"),
    }


def _sanitize_phone_number(value: str) -> str | None:
    """Normaliza un teléfono a formato +E.164 básico."""
    if not value:
        return None
    cleaned = re.sub(r"[^\d+]", "", value.strip())
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    digits_only = re.sub(r"\D", "", cleaned)
    if len(digits_only) < MIN_PHONE_DIGITS:
        return None
    if cleaned.startswith("+"):
        return "+" + digits_only
    return "+" + digits_only
