"""Servicios del canal webchat."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, status
from openai import AsyncOpenAI

from app.assistants import registry
from app.assistants.manager import AssistantConfig
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import geolocation, leads_geo, storage
from app.services import openai as openai_service

from . import schemas

logger = get_logger("app.channels.webchat")

DEFAULT_FALLBACK = (
    "Tu mensaje quedó registrado, pero tuve un problema momentáneo al responder. "
    "Intentemos nuevamente en unos instantes."
)


@dataclass(slots=True)
class WebchatContext:
    """Contexto mínimo necesario para resolver function calls."""

    conversation_id: str
    contact_id: str
    session_id: str


@dataclass(slots=True)
class AssistantSpec:
    """Especificación resuelta del asistente remoto."""

    model: str
    instructions: str | None
    tools: list[dict[str, Any]]


_ASSISTANT_CACHE: dict[str, AssistantSpec] = {}


def _extract_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        for chunk in forwarded.split(","):
            candidate = chunk.strip()
            if candidate:
                return candidate
    client = request.client
    return client.host if client else None


def _normalise_device_type(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip().lower()
    if text in {"mobile", "tablet", "desktop", "laptop", "phone"}:
        if text == "laptop":
            return "desktop"
        if text == "phone":
            return "mobile"
        return text
    return None


def _classify_device_type(user_agent: str | None, client_meta: dict[str, Any]) -> str | None:
    device = _normalise_device_type(client_meta.get("device_type"))
    if device:
        return device
    ua = (client_meta.get("user_agent") or user_agent or "").lower()
    if not ua:
        return None
    if "mobile" in ua or "iphone" in ua or "ipod" in ua or "windows phone" in ua:
        return "mobile"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "android" in ua:
        if "mobile" in ua:
            return "mobile"
        return "tablet"
    return "desktop"


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


async def _maybe_enrich_contact_metadata(
    contact_id: str,
    *,
    client_context: dict[str, Any],
    device_type: str | None,
    geo_ip_data: dict[str, Any] | None,
    estado_clave: str | None,
    estado_nombre: str | None,
    municipio_clave: str | None,
    municipio_nombre: str | None,
    cvegeo: str | None,
    referrer: str | None,
    landing_url: str | None,
) -> None:
    try:
        contact = await storage.fetch_contact(contact_id)
    except storage.StorageError as exc:
        logger.exception(
            "webchat.contact_fetch_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return

    contacto_datos = _safe_dict(contact.get("contacto_datos"))
    if contacto_datos:
        try:
            updated_data = json.loads(json.dumps(contacto_datos))
        except (TypeError, ValueError):
            updated_data = dict(contacto_datos)
    else:
        updated_data = {}

    ubicacion_actual = _safe_dict(updated_data.get("ubicacion"))
    ubicacion_nueva = dict(ubicacion_actual)

    def _set_if(value: Any, key: str) -> None:
        if value is not None and value != "":
            formatted = str(value)
            if ubicacion_nueva.get(key) != formatted:
                ubicacion_nueva[key] = formatted

    _set_if(estado_clave, "cve_ent")
    _set_if(estado_nombre, "nom_ent")
    _set_if(municipio_clave, "cve_mun")
    _set_if(municipio_nombre, "nom_mun")
    _set_if(cvegeo, "cvegeo")

    if geo_ip_data:
        if geo_ip_data.get("latitude") is not None:
            ubicacion_nueva.setdefault("lat", geo_ip_data.get("latitude"))
        if geo_ip_data.get("longitude") is not None:
            ubicacion_nueva.setdefault("lng", geo_ip_data.get("longitude"))
        if geo_ip_data.get("timezone"):
            ubicacion_nueva.setdefault("timezone", geo_ip_data.get("timezone"))

    if ubicacion_nueva != ubicacion_actual and any(ubicacion_nueva.values()):
        updated_data["ubicacion"] = ubicacion_nueva

    dispositivo_actual = _safe_dict(updated_data.get("dispositivo"))
    dispositivo_nuevo = dict(dispositivo_actual)
    user_agent = (
        client_context.get("user_agent")
        if isinstance(client_context.get("user_agent"), str)
        else None
    )
    platform = (
        client_context.get("platform") if isinstance(client_context.get("platform"), str) else None
    )
    timezone = (
        client_context.get("timezone") if isinstance(client_context.get("timezone"), str) else None
    )
    language = (
        client_context.get("language") if isinstance(client_context.get("language"), str) else None
    )
    screen_info = _safe_dict(client_context.get("screen"))

    device_type_norm = _normalise_device_type(device_type)
    if device_type_norm and dispositivo_nuevo.get("tipo") != device_type_norm:
        dispositivo_nuevo["tipo"] = device_type_norm
    if user_agent and dispositivo_nuevo.get("user_agent") != user_agent:
        dispositivo_nuevo["user_agent"] = user_agent
    if platform and dispositivo_nuevo.get("plataforma") != platform:
        dispositivo_nuevo["plataforma"] = platform
    if timezone and dispositivo_nuevo.get("timezone") != timezone:
        dispositivo_nuevo["timezone"] = timezone
    if language and dispositivo_nuevo.get("idioma") != language:
        dispositivo_nuevo["idioma"] = language
    if screen_info:
        dispositivo_nuevo.setdefault("pantalla", {})
        for key, value in screen_info.items():
            if dispositivo_nuevo["pantalla"].get(key) != value:
                dispositivo_nuevo["pantalla"][key] = value
        if not dispositivo_nuevo["pantalla"]:
            dispositivo_nuevo.pop("pantalla", None)

    prefers_dark = client_context.get("prefers_dark_mode")
    if prefers_dark is not None and dispositivo_nuevo.get("prefiere_modo_oscuro") != prefers_dark:
        dispositivo_nuevo["prefiere_modo_oscuro"] = bool(prefers_dark)

    if dispositivo_nuevo != dispositivo_actual and dispositivo_nuevo:
        updated_data["dispositivo"] = dispositivo_nuevo

    trazabilidad_actual = _safe_dict(updated_data.get("trazabilidad"))
    trazabilidad_nueva = dict(trazabilidad_actual)
    if referrer and trazabilidad_nueva.get("referrer") != referrer:
        trazabilidad_nueva["referrer"] = referrer
    if landing_url and trazabilidad_nueva.get("landing") != landing_url:
        trazabilidad_nueva["landing"] = landing_url
    if trazabilidad_nueva != trazabilidad_actual and trazabilidad_nueva:
        updated_data["trazabilidad"] = trazabilidad_nueva

    if updated_data == contacto_datos:
        return

    try:
        await storage.update_contact(contact_id, {"contacto_datos": updated_data})
    except storage.StorageError as exc:
        logger.exception(
            "webchat.contact_update_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )


async def _register_webchat_visit(
    session_id: str,
    *,
    request: Request | None,
    metadata: dict[str, Any] | None,
    contact_id_hint: str | None = None,
) -> str | None:
    """Registra la visita para métricas y enriquece metadatos del contacto."""
    client_meta = _safe_dict(metadata)
    client_context = _safe_dict(client_meta.get("client"))

    client_ip = _extract_client_ip(request)
    user_agent_header = request.headers.get("user-agent") if request else None
    device_type = _classify_device_type(user_agent_header, client_context)

    geo_ip_data: dict[str, Any] | None = None
    if client_ip:
        try:
            geo_ip_data = await geolocation.lookup_ip(client_ip)
        except Exception:  # pragma: no cover - best effort
            logger.exception(
                "webchat.geo_lookup_failed",
                extra={"session_id": session_id},
            )
            geo_ip_data = None

    client_geo = _safe_dict(client_context.get("geo"))
    geo_source: dict[str, Any] = {}
    if geo_ip_data:
        country_ip = geo_ip_data.get("country")
        if country_ip:
            geo_source["country"] = str(country_ip).upper()
        region_ip = geo_ip_data.get("region")
        if region_ip:
            geo_source["region"] = region_ip
            geo_source.setdefault("state", region_ip)
        city_ip = geo_ip_data.get("city")
        if city_ip:
            geo_source["city"] = city_ip
    if client_geo:
        country_client = client_geo.get("country_code") or client_geo.get("country")
        if country_client:
            geo_source["country"] = str(country_client).upper()
        for key in ("region", "state", "nom_ent", "city", "nom_mun"):
            value = client_geo.get(key)
            if value:
                geo_source[key] = value

    estado_clave: str | None
    estado_nombre: str | None
    municipio_clave: str | None
    municipio_nombre: str | None
    cvegeo: str | None
    estado_clave, estado_nombre, municipio_clave, municipio_nombre, cvegeo = (
        leads_geo.location_from_geo_metadata(geo_source or None)
    )

    visitor_geo_payload: dict[str, Any] = {}
    if geo_ip_data:
        visitor_geo_payload["ip_lookup"] = geo_ip_data
    if client_geo:
        visitor_geo_payload["client"] = client_geo
    if estado_nombre:
        visitor_geo_payload.setdefault("nom_ent", estado_nombre)
    if municipio_nombre:
        visitor_geo_payload.setdefault("nom_mun", municipio_nombre)

    referrer = (
        client_context.get("referrer") if isinstance(client_context.get("referrer"), str) else None
    )
    landing_url = (
        client_context.get("location_href")
        if isinstance(client_context.get("location_href"), str)
        else None
    )

    try:
        await storage.record_webchat_visit(
            session_id,
            ip=client_ip,
            device_type=device_type,
            geo=visitor_geo_payload or None,
            cve_ent=estado_clave,
            nom_ent=estado_nombre,
            cve_mun=municipio_clave,
            nom_mun=municipio_nombre,
            cvegeo=cvegeo,
            referrer=referrer,
            landing_url=landing_url,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.record_visit_failed",
            extra={"session_id": session_id, "error": str(exc)},
        )

    contact_id = str(contact_id_hint) if contact_id_hint else None
    if not contact_id:
        try:
            contact_id = await storage.get_webchat_contact_id(session_id)
        except storage.StorageError as exc:
            logger.exception(
                "webchat.resolve_contact_failed",
                extra={"session_id": session_id, "error": str(exc)},
            )
            contact_id = None

    if contact_id:
        try:
            await _maybe_enrich_contact_metadata(
                contact_id,
                client_context=client_context,
                device_type=device_type,
                geo_ip_data=geo_ip_data,
                estado_clave=estado_clave,
                estado_nombre=estado_nombre,
                municipio_clave=municipio_clave,
                municipio_nombre=municipio_nombre,
                cvegeo=cvegeo,
                referrer=referrer,
                landing_url=landing_url,
            )
        except Exception:  # pragma: no cover - best effort
            logger.exception(
                "webchat.contact_enrich_failed",
                extra={"contact_id": contact_id},
            )

    return contact_id


async def register_visit(
    session_id: str,
    *,
    metadata: dict[str, Any] | None,
    request: Request | None,
) -> str | None:
    """Endpoint público para registrar la visita aunque no haya mensajes."""
    return await _register_webchat_visit(
        session_id,
        request=request,
        metadata=metadata,
    )


async def handle_message(
    payload: schemas.MessageRequest,
    *,
    request: Request | None = None,
) -> schemas.MessageResponse:
    """Orquesta la recepción de un mensaje y delega en OpenAI/Supabase."""
    if payload.author != "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sólo se aceptan mensajes de usuario desde el widget.",
        )

    metadata_dict = payload.metadata if isinstance(payload.metadata, dict) else None

    try:
        registration = await storage.register_webchat_message(
            session_id=payload.session_id,
            author="user",
            content=payload.content,
            inactivity_hours=settings.webchat_inactivity_hours,
            metadata={
                "client_message_id": payload.client_message_id,
                "locale": payload.locale,
                "fresh_load": payload.fresh_load,
                "extra": payload.metadata or {},
            },
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.register_failed",
            extra={"session_id": payload.session_id, "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="No fue posible registrar el mensaje") from exc

    conversation_id = registration.get("conversation_id")
    if not conversation_id:
        raise HTTPException(status_code=500, detail="No se pudo identificar la conversación")

    try:
        conversation_meta = await storage.fetch_webchat_conversation(conversation_id)
    except storage.StorageError as exc:
        logger.exception(
            "webchat.conversation_lookup_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="No se pudo recuperar la conversación") from exc

    openai_conversation_id = registration.get("openai_conversation_id") or conversation_meta.get(
        "openai_conversation_id"
    )
    manual_mode = bool(conversation_meta.get("manual_override"))
    metadata = schemas.MessageMetadata(
        conversation_id=str(conversation_id),
        openai_conversation_id=openai_conversation_id,
        previous_response_id=conversation_meta.get("last_response_id"),
        client_message_id=payload.client_message_id,
        manual_mode=manual_mode,
    )

    if manual_mode:
        log_event(
            logger,
            "webchat.manual_mode",
            conversation_id=str(conversation_id),
            session_id=payload.session_id,
        )
        return schemas.MessageResponse(reply=None, metadata=metadata)

    contact_id = conversation_meta.get("contact_id")
    if not contact_id:
        raise HTTPException(
            status_code=500, detail="No se pudo asociar la conversación al contacto"
        )

    contact_id_value = await _register_webchat_visit(
        payload.session_id,
        request=request,
        metadata=metadata_dict,
        contact_id_hint=str(contact_id),
    )
    contact_id = contact_id_value or str(contact_id)

    assistant: AssistantConfig
    try:
        assistant = registry.resolve_assistant("landing")
    except ValueError as exc:  # pragma: no cover - configuración inválida
        logger.exception("webchat.assistant_resolve_failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="Asistente no configurado") from exc

    client = openai_service.get_assistant_client()
    assistant_spec: AssistantSpec | None = None
    if assistant.is_prompt:
        if not assistant.prompt_id:
            raise HTTPException(status_code=500, detail="No se configuró el prompt de OpenAI")
    else:
        if not assistant.assistant_id:
            raise HTTPException(status_code=500, detail="No se configuró el asistente de OpenAI")
        try:
            assistant_spec = await _resolve_assistant_spec(client, assistant.assistant_id)
        except Exception as exc:  # pragma: no cover - configuración remota inválida
            logger.exception("webchat.assistant_spec_failed", extra={"error": str(exc)})
            raise HTTPException(
                status_code=500, detail="No se pudo cargar la configuración del asistente"
            ) from exc
    context = WebchatContext(
        conversation_id=str(conversation_id),
        contact_id=str(contact_id),
        session_id=payload.session_id,
    )

    try:
        (
            assistant_reply,
            response_payload,
            tools_called,
            tool_call_ids,
            resolved_openai_conversation,
        ) = await _run_assistant_turn(
            client=client,
            assistant=assistant,
            assistant_spec=assistant_spec,
            context=context,
            user_message=payload,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=conversation_meta.get("last_response_id"),
        )
    except Exception as exc:  # pragma: no cover - se registra y responde fallback
        logger.exception(
            "webchat.assistant_turn_failed",
            extra={"conversation_id": str(conversation_id), "error": str(exc)},
        )
        return schemas.MessageResponse(
            reply=DEFAULT_FALLBACK,
            metadata=metadata,
        )

    metadata.openai_conversation_id = (
        resolved_openai_conversation or metadata.openai_conversation_id
    )
    metadata.assistant_response_id = (
        response_payload.get("id") if isinstance(response_payload, dict) else None
    )
    metadata.tools_called = tools_called or None
    metadata.tool_call_ids = tool_call_ids or None

    if assistant_reply:
        try:
            await storage.register_webchat_message(
                session_id=payload.session_id,
                author="assistant",
                content=assistant_reply,
                response_id=metadata.assistant_response_id,
                inactivity_hours=settings.webchat_inactivity_hours,
                metadata={
                    "openai_conversation_id": metadata.openai_conversation_id,
                    "tools_called": tools_called,
                    "tool_call_ids": tool_call_ids,
                },
            )
        except storage.StorageError as exc:
            logger.exception(
                "webchat.register_assistant_failed",
                extra={
                    "conversation_id": str(conversation_id),
                    "response_id": metadata.assistant_response_id,
                    "error": str(exc),
                },
            )

    return schemas.MessageResponse(reply=assistant_reply, metadata=metadata)


async def fetch_history(session_id: str, limit: int) -> schemas.HistoryResponse:
    """Devuelve mensajes recientes asociados al session_id del widget."""
    try:
        conversation = await storage.resolve_webchat_conversation_from_session(session_id)
    except storage.StorageError as exc:
        logger.exception("webchat.history_resolve_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=500, detail="No fue posible consultar la conversación"
        ) from exc

    if not conversation:
        return schemas.HistoryResponse(conversation_id=None, messages=[], manual_mode=False)

    try:
        rows = await storage.fetch_recent_messages(
            conversation_id=str(conversation["id"]),
            limit=limit,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.history_fetch_failed",
            extra={"conversation_id": conversation.get("id"), "error": str(exc)},
        )
        raise HTTPException(
            status_code=500, detail="No fue posible recuperar el historial"
        ) from exc

    messages: list[schemas.HistoryMessage] = []
    for row in rows:
        raw_metadata = row.get("datos")
        metadata: dict[str, Any] | None = None
        if isinstance(raw_metadata, dict):
            metadata = raw_metadata
        elif isinstance(raw_metadata, str) and raw_metadata:
            try:
                metadata = json.loads(raw_metadata)
            except json.JSONDecodeError:
                metadata = None
        messages.append(
            schemas.HistoryMessage(
                id=str(row.get("id")),
                direction=str(row.get("direccion") or "entrante"),
                content=row.get("texto") or "",
                created_at=row.get("creado_en"),
                metadata=metadata,
            )
        )

    return schemas.HistoryResponse(
        conversation_id=str(conversation["id"]),
        messages=messages,
        manual_mode=bool(conversation.get("manual_override")),
    )


async def close_session(
    session_id: str,
    *,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Registra el cierre explícito de una sesión."""
    try:
        await storage.record_webchat_session_closure(session_id)
    except storage.StorageError as exc:
        logger.exception(
            "webchat.session_close_failed", extra={"session_id": session_id, "error": str(exc)}
        )
        raise HTTPException(status_code=502, detail="No fue posible registrar el cierre") from exc

    try:
        await _register_webchat_visit(
            session_id,
            request=request,
            metadata=metadata,
        )
    except Exception:  # pragma: no cover - best effort
        logger.exception(
            "webchat.visit_capture_failed",
            extra={"session_id": session_id},
        )


async def _run_assistant_turn(
    *,
    client: AsyncOpenAI,
    assistant: AssistantConfig,
    assistant_spec: AssistantSpec | None,
    context: WebchatContext,
    user_message: schemas.MessageRequest,
    openai_conversation_id: str | None,
    previous_response_id: str | None,
) -> tuple[str | None, dict[str, Any], list[str], list[str], str | None]:
    """Gestiona la interacción con OpenAI y la resolución de tool calls."""
    metadata_payload = {
        "session_id": context.session_id,
        "conversation_id": context.conversation_id,
        "client_message_id": user_message.client_message_id,
        "locale": user_message.locale,
    }
    # Elimina claves con valores nulos
    sanitized_metadata = {k: v for k, v in metadata_payload.items() if v is not None}

    base_input = [
        {
            "role": "user",
            "content": [{"type": "input_text", "text": user_message.content}],
        }
    ]
    request_kwargs: dict[str, Any] = {"input": base_input, "store": True}
    if assistant.is_prompt:
        prompt_payload = _build_prompt_payload(assistant, context)
        request_kwargs["prompt"] = prompt_payload
        request_kwargs["text"] = {"format": {"type": "text"}}
    else:
        if not assistant_spec:
            raise ValueError("No se pudo resolver la configuración del asistente")
        request_kwargs["model"] = assistant_spec.model
        if assistant_spec.instructions:
            request_kwargs["instructions"] = assistant_spec.instructions
        if assistant_spec.tools:
            request_kwargs["tools"] = assistant_spec.tools

    if sanitized_metadata:
        request_kwargs["metadata"] = sanitized_metadata
    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    tools_called: list[str] = []
    tool_call_ids: list[str] = []
    final_response: dict[str, Any] | None = None
    latest_openai_conversation = openai_conversation_id
    assistant_reply: str | None = None
    latest_response_id = previous_response_id

    while True:
        response = await client.responses.create(**request_kwargs)
        response_dict = response.model_dump()
        final_response = response_dict
        latest_response_id = response_dict.get("id") or latest_response_id
        conversation_obj = response_dict.get("conversation") or {}
        latest_openai_conversation = conversation_obj.get("id") or latest_openai_conversation

        output_items = response_dict.get("output") or []
        pending_calls = [item for item in output_items if item.get("type") == "function_call"]

        # Extrae texto de mensajes (si ya existe).
        text_fragments: list[str] = []
        for item in output_items:
            if item.get("type") != "message":
                continue
            for content in item.get("content") or []:
                if content.get("type") == "output_text":
                    text = content.get("text")
                    if text:
                        text_fragments.append(text)
        if text_fragments:
            assistant_reply = "\n".join(fragment.strip() for fragment in text_fragments if fragment)

        if not pending_calls:
            break

        follow_up_inputs: list[dict[str, Any]] = []
        for call in pending_calls:
            name = call.get("name")
            call_id = call.get("call_id")
            arguments = call.get("arguments")
            try:
                result = await _execute_function_call(name, arguments, context)
            except Exception as exc:  # pragma: no cover - se reporta al modelo
                logger.exception(
                    "webchat.tool_execution_failed",
                    extra={
                        "conversation_id": context.conversation_id,
                        "tool": name,
                        "error": str(exc),
                    },
                )
                result = {"status": "error", "message": str(exc)}

            payload = {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result, ensure_ascii=False),
            }
            follow_up_inputs.append(payload)

            if name:
                tools_called.append(str(name))
            if call_id:
                tool_call_ids.append(str(call_id))

        request_kwargs = {
            "input": follow_up_inputs,
            "store": True,
        }
        if latest_openai_conversation:
            request_kwargs["conversation"] = latest_openai_conversation
        elif latest_response_id:
            request_kwargs["previous_response_id"] = latest_response_id
        if assistant.is_prompt and assistant.prompt_id:
            request_kwargs["prompt"] = _build_prompt_payload(assistant, context)
            request_kwargs["text"] = {"format": {"type": "text"}}
        elif assistant_spec:
            request_kwargs["model"] = assistant_spec.model
            if assistant_spec.instructions:
                request_kwargs["instructions"] = assistant_spec.instructions
            if assistant_spec.tools:
                request_kwargs["tools"] = assistant_spec.tools

    return (
        assistant_reply,
        final_response or {},
        tools_called,
        tool_call_ids,
        latest_openai_conversation,
    )


async def _execute_function_call(
    name: str | None,
    arguments_payload: Any,
    context: WebchatContext,
) -> dict[str, Any]:
    """Ejecuta la acción solicitada por el asistente."""
    if not name:
        raise ValueError("Nombre de función ausente en tool call")

    if isinstance(arguments_payload, str):
        try:
            arguments = json.loads(arguments_payload)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Arguments inválidos para {name}: {arguments_payload!r}") from exc
    elif isinstance(arguments_payload, dict):
        arguments = arguments_payload
    else:
        raise ValueError(
            f"Tipo de argumentos no soportado para {name}: {type(arguments_payload)!r}"
        )

    conv_id = str(arguments.get("conversacion_id") or "")
    if conv_id and conv_id != context.conversation_id:
        raise ValueError(
            f"El conversacion_id recibido ({conv_id}) no coincide con la conversación activa"
        )

    if name == "set_full_name":
        full_name = (arguments.get("full_name") or "").strip()
        if not full_name:
            raise ValueError("full_name requerido para set_full_name")
        await storage.update_contact(context.contact_id, {"nombre_completo": full_name})
        return {"status": "ok", "full_name": full_name}

    if name == "set_email":
        email = (arguments.get("email") or "").strip()
        if not email:
            raise ValueError("email requerido para set_email")
        await storage.update_contact(context.contact_id, {"correo": email.lower()})
        return {"status": "ok", "email": email.lower()}

    if name == "set_phone_number":
        phone_number = (arguments.get("phone_number") or "").strip()
        if not phone_number:
            raise ValueError("phone_number requerido para set_phone_number")
        await storage.update_contact(context.contact_id, {"telefono_e164": phone_number})
        return {"status": "ok", "phone_number": phone_number}

    if name == "set_company_name":
        company_name = (arguments.get("company_name") or "").strip()
        if not company_name:
            raise ValueError("company_name requerido para set_company_name")
        await storage.update_contact(context.contact_id, {"company_name": company_name})
        return {"status": "ok", "company_name": company_name}

    if name == "close_lead":
        notes = (arguments.get("notes") or "").strip()
        necesidad = (arguments.get("necesidad_proposito") or "").strip()
        siguiente_accion = (arguments.get("siguiente_accion") or "").strip() or None
        if not notes or not necesidad:
            raise ValueError("notes y necesidad_proposito son requeridos para close_lead")
        await storage.update_contact(
            context.contact_id,
            {"notes": notes, "necesidad_proposito": necesidad},
        )
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=notes,
            intencion=necesidad,
            siguiente_accion=siguiente_accion,
        )
        return {
            "status": "ok",
            "notes": notes,
            "necesidad_proposito": necesidad,
            "siguiente_accion": siguiente_accion,
        }

    logger.warning(
        "webchat.unknown_tool_call",
        extra={"tool": name, "conversation_id": context.conversation_id},
    )
    return {"status": "ignored", "tool": name}


async def _resolve_assistant_spec(client: AsyncOpenAI, assistant_id: str) -> AssistantSpec:
    """Recupera la configuración completa del asistente y la cachea en memoria."""
    cached = _ASSISTANT_CACHE.get(assistant_id)
    if cached:
        return cached
    record = await client.beta.assistants.retrieve(assistant_id=assistant_id)
    dump = record.model_dump()
    tools_dump = dump.get("tools") or []
    tools: list[dict[str, Any]] = []
    for tool in tools_dump:
        if isinstance(tool, dict):
            tools.append(tool)
        else:  # pragma: no cover
            try:
                tools.append(tool.model_dump(exclude_none=True))
            except AttributeError:
                tools.append(dict(tool))
    spec = AssistantSpec(
        model=_extract_model(dump, assistant_id),
        instructions=dump.get("instructions"),
        tools=tools,
    )
    _ASSISTANT_CACHE[assistant_id] = spec
    return spec


def _extract_model(dump: dict[str, Any], assistant_id: str) -> str:
    """Obtiene el modelo declarado en el asistente o lanza error descriptivo."""
    model = dump.get("model")
    if not model:
        raise ValueError(f"El asistente {assistant_id} no tiene modelo configurado")
    return str(model)


def _build_prompt_payload(assistant: AssistantConfig, context: WebchatContext) -> dict[str, Any]:
    """Compone el payload requerido por Responses cuando se usa un prompt fijo."""
    if not assistant.prompt_id:
        raise ValueError("No se definió prompt_id para el asistente configurado")
    variables: dict[str, Any] = {
        "conversacion_id": context.conversation_id,
    }
    payload: dict[str, Any] = {"id": assistant.prompt_id, "variables": variables}
    if assistant.prompt_version:
        payload["version"] = assistant.prompt_version
    return payload
