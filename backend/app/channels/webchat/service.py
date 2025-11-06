"""Servicios del canal webchat."""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx
from fastapi import HTTPException, Request, UploadFile, status
from openai import AsyncOpenAI

from app.assistants import registry
from app.assistants.manager import AssistantConfig
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import geolocation, leads_geo, storage
from app.services import openai as openai_service

from . import schemas

logger = get_logger("app.channels.webchat")
visit_logger = get_logger("app.analytics.visitas")

MAX_ATTACHMENTS_PER_MESSAGE = 3
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024  # 8 MB
MAX_TEXT_ATTACHMENT_CHARS = 4000
TEXT_MIME_PREFIXES = ("text/",)
TEXT_MIME_WHITELIST = {
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
}
TEXT_EXTENSION_WHITELIST = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".log",
}

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


def _guess_extension(name: str | None, url: str | None) -> str:
    candidates: list[str] = []
    if name:
        candidates.append(Path(name).suffix.lower())
    if url:
        parsed = urlparse(url)
        candidates.append(Path(parsed.path).suffix.lower())
    for candidate in candidates:
        if candidate:
            return candidate
    return ""


def _is_image_mime(mime: str | None, *, extension: str) -> bool:
    if not mime and extension:
        return extension in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"}
    return bool(mime and mime.startswith("image/"))


def _is_text_attachment(mime: str | None, *, extension: str) -> bool:
    if mime:
        if mime.startswith(TEXT_MIME_PREFIXES):
            return True
        if mime in TEXT_MIME_WHITELIST:
            return True
    if extension in TEXT_EXTENSION_WHITELIST:
        return True
    return False


def _derive_filename(name: str | None, url: str | None) -> str:
    if name:
        return Path(name).name
    if url:
        parsed = urlparse(url)
        candidate = Path(parsed.path).name
        if candidate:
            return candidate
    return "adjunto"


def _trim_text_payload(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit], True


async def _prepare_user_content_with_attachments(
    client: AsyncOpenAI,
    user_message: schemas.MessageRequest,
) -> list[dict[str, Any]]:
    """Construye el payload `content` considerando adjuntos compatibles."""

    content_items: list[dict[str, Any]] = [
        {
            "type": "input_text",
            "text": user_message.content,
        }
    ]
    attachments = user_message.attachments or []
    if not attachments:
        return content_items

    processed = 0
    warnings: list[str] = []
    http_client: httpx.AsyncClient | None = None

    async def _ensure_http_client() -> httpx.AsyncClient:
        nonlocal http_client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
        return http_client

    try:
        for attachment in attachments:
            if processed >= MAX_ATTACHMENTS_PER_MESSAGE:
                warnings.append(
                    f"Se ignoraron adjuntos extra; límite {MAX_ATTACHMENTS_PER_MESSAGE} por mensaje."
                )
                break
            url = attachment.url
            if not url:
                warnings.append("Se omitió un adjunto sin URL accesible.")
                continue
            name = _derive_filename(attachment.name, url)
            size_hint = attachment.size
            if size_hint and size_hint > MAX_ATTACHMENT_BYTES:
                warnings.append(
                    f"El archivo {name} supera el límite permitido de {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
                )
                continue

            mime = attachment.mime.lower() if attachment.mime else None
            extension = _guess_extension(attachment.name, attachment.url)

            data_bytes: bytes | None = None
            try:
                client_http = await _ensure_http_client()
                response = await client_http.get(url)
                response.raise_for_status()
                data_bytes = response.content
            except Exception as exc:  # pragma: no cover - dependiente de red
                logger.warning(
                    "webchat.attachment_download_failed",
                    extra={"url": url, "error": str(exc)},
                )
                warnings.append(f"No se pudo descargar {name}.")
                continue

            if len(data_bytes) > MAX_ATTACHMENT_BYTES:
                warnings.append(
                    f"El archivo {name} supera el límite permitido de {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
                )
                continue

            if _is_image_mime(mime, extension=extension):
                content_items.append(
                    {
                        "type": "input_image",
                        "image_url": url,
                    }
                )
                processed += 1
                continue

            if extension == ".docx":
                try:
                    doc_text = _extract_docx_text(data_bytes)
                except Exception as exc:  # pragma: no cover - archivos corruptos
                    logger.warning(
                        "webchat.attachment_docx_parse_failed",
                        extra={"name": name, "error": str(exc)},
                    )
                    warnings.append(f"No pude leer {name} (DOCX).")
                    continue
                trimmed_text, truncated = _trim_text_payload(doc_text, MAX_TEXT_ATTACHMENT_CHARS)
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name} (extraído de DOCX):\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            if extension in {".xlsx", ".xlsm"}:
                try:
                    sheet_text = _extract_xlsx_text(data_bytes)
                except Exception as exc:  # pragma: no cover - archivos corruptos
                    logger.warning(
                        "webchat.attachment_xlsx_parse_failed",
                        extra={"name": name, "error": str(exc)},
                    )
                    warnings.append(f"No pude leer {name} (XLSX).")
                    continue
                trimmed_text, truncated = _trim_text_payload(sheet_text, MAX_TEXT_ATTACHMENT_CHARS)
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name} (extraído de Excel):\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            if _is_text_attachment(mime, extension=extension):
                encoding = "utf-8"
                try:
                    text_content = data_bytes.decode(encoding)
                except UnicodeDecodeError:
                    text_content = data_bytes.decode("utf-8", errors="replace")
                trimmed_text, truncated = _trim_text_payload(
                    text_content, MAX_TEXT_ATTACHMENT_CHARS
                )
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name}:\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            # Fallback: subir archivo a OpenAI y referenciarlo como input_file
            file_tuple = (
                name,
                io.BytesIO(data_bytes),
                mime or "application/octet-stream",
            )
            try:
                upload = await client.files.create(file=file_tuple, purpose="assistants")
            except Exception as exc:  # pragma: no cover - dependiente de API
                logger.warning(
                    "webchat.attachment_upload_failed",
                    extra={"name": name, "error": str(exc)},
                )
                warnings.append(f"No se pudo compartir {name} con el asistente.")
                continue

            content_items.append(
                {
                    "type": "input_file",
                    "file_id": upload.id,
                }
            )
            processed += 1
    finally:
        if http_client:
            await http_client.aclose()

    if warnings:
        content_items.append(
            {
                "type": "input_text",
                "text": (
                    "Nota interna: Algunos adjuntos no pudieron procesarse. "
                    + " ".join(warnings)
                    + " Pide al visitante que los reenvíe en otro formato."
                ),
            }
        )

    return content_items


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

    visit_logger.info(
        "visit.metadata_resolved",
        extra={
            "session_id": session_id,
            "visit": {
                "ip": client_ip,
                "device_type": device_type,
                "resolved_location": {
                    "cve_ent": estado_clave,
                    "nom_ent": estado_nombre,
                    "cve_mun": municipio_clave,
                    "nom_mun": municipio_nombre,
                    "cvegeo": cvegeo,
                },
                "referrer": referrer,
                "landing_url": landing_url,
                "geo_ip": geo_ip_data,
                "geo_client": client_geo,
                "client_context": client_context,
            },
        },
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
    attachments_payload = payload.attachments or []

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
            attachments=[attachment.model_dump(mode="json") for attachment in attachments_payload],
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
    attachments_models = [
        schemas.Attachment(
            id=None,
            url=attachment.url,
            mime=attachment.mime,
            size=attachment.size,
            name=attachment.name,
            provider_id=attachment.provider_id,
            path=attachment.path,
        )
        for attachment in attachments_payload
    ]

    if manual_mode:
        log_event(
            logger,
            "webchat.manual_mode",
            conversation_id=str(conversation_id),
            session_id=payload.session_id,
        )
        return schemas.MessageResponse(
            reply=None,
            metadata=metadata,
            attachments=attachments_models or None,
        )

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

    return schemas.MessageResponse(
        reply=assistant_reply,
        metadata=metadata,
        attachments=attachments_models or None,
    )


async def append_manual_agent_context(
    *,
    conversation_meta: dict[str, Any],
    session_id: str,
    content: str,
    locale: str | None = None,
) -> None:
    """Agrega una nota del agente humano al contexto del asistente sin generar respuesta."""
    if not content:
        return

    conversation_id = conversation_meta.get("id")
    contact_id = conversation_meta.get("contact_id")
    if not conversation_id or not contact_id:
        return

    openai_conversation_id = conversation_meta.get("openai_conversation_id")
    previous_response_id = conversation_meta.get("last_response_id")

    try:
        assistant = registry.resolve_assistant("landing")
    except ValueError as exc:  # pragma: no cover - configuración inválida
        logger.exception("webchat.manual_context.assistant_unavailable", extra={"error": str(exc)})
        return

    client = openai_service.get_assistant_client()
    assistant_spec: AssistantSpec | None = None
    if not assistant.is_prompt:
        if not assistant.assistant_id:
            logger.warning("webchat.manual_context.missing_assistant_id")
            return
        try:
            assistant_spec = await _resolve_assistant_spec(client, assistant.assistant_id)
        except Exception as exc:  # pragma: no cover - configuración remota inválida
            logger.exception("webchat.manual_context.resolve_failed", extra={"error": str(exc)})
            return

    context = WebchatContext(
        conversation_id=str(conversation_id),
        contact_id=str(contact_id),
        session_id=session_id,
    )

    manual_text_parts = [
        "Nota del agente humano:",
        content,
        "",
        "El asistente no debe responder a esta nota; únicamente utilízala como contexto en turnos futuros.",
    ]
    manual_text = "\n".join(part for part in manual_text_parts if part is not None)

    request_kwargs: dict[str, Any] = {
        "input": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": manual_text,
                    }
                ],
            }
        ],
        "store": True,
        "metadata": {
            "source": "panel_manual",
            "skip_user_delivery": "true",
        },
    }
    if locale:
        request_kwargs["metadata"]["locale"] = locale

    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    if assistant.is_prompt:
        try:
            request_kwargs["prompt"] = _build_prompt_payload(assistant, context)
        except ValueError as exc:
            logger.exception(
                "webchat.manual_context.prompt_payload_failed", extra={"error": str(exc)}
            )
            return
        request_kwargs["text"] = {"format": {"type": "text"}}
    else:
        if not assistant_spec:
            return
        request_kwargs["model"] = assistant_spec.model
        instructions = assistant_spec.instructions or ""
        note = (
            "Nota interna: si recibes un mensaje marcado como nota del agente humano, "
            "no generes una respuesta para el visitante; únicamente incorpora el contenido al contexto."
        )
        request_kwargs["instructions"] = f"{instructions}\n\n{note}".strip()
        if assistant_spec.tools:
            request_kwargs["tools"] = assistant_spec.tools

    try:
        await client.responses.create(**request_kwargs)
    except Exception as exc:  # pragma: no cover - errores de OpenAI
        logger.exception(
            "webchat.manual_context.append_failed",
            extra={
                "conversation_id": str(conversation_id),
                "session_id": session_id,
                "error": str(exc),
            },
        )
    else:
        logger.info(
            "webchat.manual_context.appended",
            extra={
                "conversation_id": str(conversation_id),
                "session_id": session_id,
            },
        )


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

        raw_attachments = row.get("attachments") or row.get("adjuntos")
        attachments: list[schemas.Attachment] = []

        candidate_sources: list[Any] = []
        if raw_attachments is not None:
            candidate_sources.append(raw_attachments)
        if metadata and isinstance(metadata.get("attachments"), list):
            candidate_sources.append(metadata.get("attachments"))

        for source in candidate_sources:
            if not isinstance(source, list):
                continue
            for item in source:
                if not isinstance(item, dict):
                    continue
                size_value = item.get("size")
                size_int: int | None = None
                if isinstance(size_value, (int, float)):
                    size_int = int(size_value)
                elif isinstance(size_value, str):
                    try:
                        size_int = int(size_value)
                    except ValueError:
                        size_int = None
                url_value = item.get("url")
                if not url_value:
                    continue
                attachments.append(
                    schemas.Attachment(
                        id=str(item.get("id")) if item.get("id") else None,
                        url=str(url_value),
                        mime=item.get("mime"),
                        size=size_int,
                        name=item.get("name"),
                        provider_id=item.get("provider_id"),
                        path=item.get("path"),
                    )
                )

        messages.append(
            schemas.HistoryMessage(
                id=str(row.get("id")),
                direction=str(row.get("direccion") or "entrante"),
                content=row.get("texto") or "",
                created_at=row.get("creado_en"),
                metadata=metadata,
                attachments=attachments,
            )
        )

    return schemas.HistoryResponse(
        conversation_id=str(conversation["id"]),
        messages=messages,
        manual_mode=bool(conversation.get("manual_override")),
    )


async def upload_attachment(
    file: UploadFile,
    *,
    session_id: str | None = None,
    conversation_id: str | None = None,
) -> schemas.UploadResponse:
    """Recibe un archivo y lo almacena en el bucket designado."""

    resolved_conversation_id: str | None = conversation_id

    if not resolved_conversation_id and session_id:
        try:
            conversation_meta = await storage.resolve_webchat_conversation_from_session(session_id)
        except storage.StorageError as exc:
            logger.exception(
                "webchat.upload.resolve_failed",
                extra={"session_id": session_id, "error": str(exc)},
            )
            raise HTTPException(
                status_code=502, detail="No se pudo obtener la conversación"
            ) from exc
        if conversation_meta:
            resolved_conversation_id = conversation_meta.get("id")

    try:
        uploaded = await storage.upload_webchat_attachment(
            file=file,
            session_id=session_id,
            conversation_id=resolved_conversation_id,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.upload_failed",
            extra={"error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="No se pudo cargar el archivo") from exc

    return schemas.UploadResponse(**uploaded)


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

    try:
        user_content = await _prepare_user_content_with_attachments(client, user_message)
    except Exception as exc:  # pragma: no cover - defensivo ante adjuntos inesperados
        logger.exception(
            "webchat.build_user_content_failed",
            extra={
                "conversation_id": context.conversation_id,
                "session_id": context.session_id,
                "error": str(exc),
            },
        )
        user_content = [
            {
                "type": "input_text",
                "text": user_message.content,
            }
        ]

    base_input = [
        {
            "role": "user",
            "content": user_content,
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


def _extract_docx_text(data: bytes) -> str:
    """Extrae texto legible de un archivo DOCX."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        try:
            xml_bytes = archive.read("word/document.xml")
        except KeyError as exc:
            raise ValueError("Documento DOCX sin document.xml") from exc

    root = ET.fromstring(xml_bytes)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", ns):
        runs = []
        for text_node in para.findall(".//w:t", ns):
            if text_node.text:
                runs.append(text_node.text)
        if runs:
            paragraphs.append("".join(runs))
    return "\n\n".join(paragraphs).strip()


def _extract_xlsx_text(data: bytes) -> str:
    """Extrae texto tabular de un archivo XLSX/XLSM."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        shared_strings: list[str] = []
        ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for si in shared_root.findall(".//main:si", ns):
                fragments: list[str] = []
                for text_node in si.findall(".//main:t", ns):
                    if text_node.text:
                        fragments.append(text_node.text)
                shared_strings.append("".join(fragments))

        rows_out: list[str] = []
        for name in archive.namelist():
            if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):
                continue
            sheet_root = ET.fromstring(archive.read(name))
            for row in sheet_root.findall(".//main:row", ns):
                values: list[str] = []
                for cell in row.findall("main:c", ns):
                    cell_type = cell.get("t")
                    value_text = ""
                    if cell_type == "s":
                        idx_text = cell.findtext("main:v", default="", namespaces=ns)
                        if idx_text.isdigit():
                            idx = int(idx_text)
                            if 0 <= idx < len(shared_strings):
                                value_text = shared_strings[idx]
                    elif cell_type == "inlineStr":
                        value_text = "".join(t.text or "" for t in cell.findall(".//main:t", ns))
                    else:
                        raw = cell.findtext("main:v", default="", namespaces=ns)
                        value_text = raw
                    values.append(value_text.strip())
                if any(values):
                    rows_out.append("\t".join(values).strip())

        return "\n".join(rows_out).strip()


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
