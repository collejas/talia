"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger(__name__)


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


def _normalize_manual_override(raw: Any) -> bool:
    """Normaliza diferentes formas de representar manual_override."""
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return False
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in {"true", "t", "1", "yes", "y"}:
            return True
        if lowered in {"false", "f", "0", "no", "n", ""}:
            return False
        return False
    if isinstance(raw, dict):
        if "manual_override" in raw:
            return _normalize_manual_override(raw.get("manual_override"))
        # Si viene anidado con otra clave, intenta con el primer valor.
        for value in raw.values():
            normalized = _normalize_manual_override(value)
            if normalized:
                return True
        return False
    if isinstance(raw, Iterable):
        for item in raw:
            if _normalize_manual_override(item):
                return True
        return False
    return False


async def register_webchat_message(
    *,
    session_id: str,
    author: str,
    content: str,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
) -> dict[str, str | None]:
    """Invoca la RPC `registrar_mensaje_webchat` a través del repositorio CRM."""
    repo = CRMRepository()
    try:
        result = await repo.register_webchat_message(
            session_id=session_id,
            author=author,
            content=content,
            response_id=response_id,
            metadata=metadata or {},
            inactivity_hours=inactivity_hours,
            attachments=attachments or [],
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    return result


async def register_whatsapp_message(
    *,
    direction: Literal["entrante", "saliente"],
    wa_id: str | None,
    phone_e164: str | None,
    body: str | None,
    message_sid: str | None,
    profile_name: str | None = None,
    conversation_id: str | None = None,
    contact_id: str | None = None,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    webhook_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Invoca registrar_mensaje_whatsapp para almacenar interacciones del canal y ligar el webhook."""
    repo = CRMRepository()
    try:
        return await repo.register_whatsapp_message(
            direction=direction,
            wa_id=wa_id,
            phone_e164=phone_e164,
            body=body,
            message_sid=message_sid,
            profile_name=profile_name,
            conversation_id=conversation_id,
            contact_id=contact_id,
            response_id=response_id,
            metadata=metadata,
            inactivity_hours=inactivity_hours,
            attachments=attachments,
            webhook_payload=webhook_payload,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_conversation(conversation_id: str) -> dict[str, Any]:
    """Recupera metadatos de una conversación incluyendo control manual."""
    repo = CRMRepository()
    try:
        row = await repo.get_conversation_with_controls(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    ctrl = row.get("conversaciones_controles")
    manual_override = _normalize_manual_override(ctrl)
    return {
        "id": row.get("id"),
        "contact_id": row.get("contacto_id"),
        "channel": row.get("canal"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "manual_override": manual_override,
    }


async def fetch_webchat_conversation(conversation_id: str) -> dict[str, Any]:
    """Alias mantenido por compatibilidad para el canal webchat."""
    return await fetch_conversation(conversation_id)


async def get_webchat_contact_id(session_id: str) -> str | None:
    """Devuelve el contacto asociado a un session_id para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_contact_id_by_session(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_session_id(contact_id: str) -> str | None:
    """Obtiene el session_id asociado al contacto para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_session_by_contact(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def resolve_webchat_conversation_from_session(
    session_id: str,
) -> dict[str, Any] | None:
    """Obtiene la última conversación webchat asociada a un session_id."""
    contact_id = await get_webchat_contact_id(session_id)
    if not contact_id:
        return None

    repo = CRMRepository()
    try:
        row = await repo.get_latest_webchat_conversation(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None
    ctrl = row.get("conversaciones_controles")
    manual_override = _normalize_manual_override(ctrl)
    return {
        "id": row.get("id"),
        "contact_id": row.get("contacto_id"),
        "channel": row.get("canal"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "manual_override": manual_override,
    }


async def record_webchat_session_closure(session_id: str) -> None:
    """Persiste el cierre explícito de una sesión webchat."""
    repo = CRMRepository()
    try:
        await repo.record_webchat_session_closure(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_webchat_visit(
    session_id: str,
    *,
    ip: str | None = None,
    device_type: str | None = None,
    geo: dict[str, Any] | None = None,
    cve_ent: str | None = None,
    nom_ent: str | None = None,
    cve_mun: str | None = None,
    nom_mun: str | None = None,
    cvegeo: str | None = None,
    referrer: str | None = None,
    landing_url: str | None = None,
) -> None:
    """Actualiza/crea el registro del visitante con metadata adicional."""
    repo = CRMRepository()

    payload: dict[str, Any] = {}
    if ip:
        payload["p_ip"] = ip
    if device_type:
        payload["p_device_type"] = device_type
    if geo:
        payload["p_geo"] = geo
    if cve_ent:
        payload["p_cve_ent"] = cve_ent
    if nom_ent:
        payload["p_nom_ent"] = nom_ent
    if cve_mun:
        payload["p_cve_mun"] = cve_mun
    if nom_mun:
        payload["p_nom_mun"] = nom_mun
    if cvegeo:
        payload["p_cvegeo"] = cvegeo
    if referrer:
        payload["p_referrer"] = referrer
    if landing_url:
        payload["p_landing_url"] = landing_url

    try:
        await repo.record_webchat_visit(session_id=session_id, payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def update_conversation(conversation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos de una conversación."""
    repo = CRMRepository()
    try:
        return await repo.update_conversation(conversation_id=conversation_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upsert_conversation_insights(
    *,
    conversation_id: str,
    resumen: str | None = None,
    intencion: str | None = None,
    siguiente_accion: str | None = None,
) -> None:
    """Actualiza o inserta insights de conversación."""
    repo = CRMRepository()
    try:
        await repo.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=resumen,
            intencion=intencion,
            siguiente_accion=siguiente_accion,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def get_manual_override(conversation_id: str) -> bool:
    """Indica si la conversación está en modo manual (sin asistente)."""
    repo = CRMRepository()
    try:
        return await repo.get_manual_override(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_manual_overrides(conversation_ids: list[str]) -> dict[str, bool]:
    """Obtiene flags manual_override para un conjunto de conversaciones."""
    repo = CRMRepository()
    try:
        return await repo.fetch_manual_overrides(conversation_ids=conversation_ids)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def set_manual_override(conversation_id: str, manual: bool) -> None:
    """Activa o desactiva el modo manual para una conversación."""
    repo = CRMRepository()
    try:
        await repo.set_manual_override(conversation_id=conversation_id, manual=manual)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_recent_messages(*, conversation_id: str, limit: int = 8) -> list[dict[str, Any]]:
    """Obtiene los últimos mensajes de una conversación para construir historial.

    Retorna elementos con claves: direccion (entrante/saliente), texto, creado_en, datos.
    """
    repo = CRMRepository()
    try:
        return await repo.fetch_recent_messages(conversation_id=conversation_id, limit=limit)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upload_webchat_attachment(
    *,
    file: UploadFile,
    session_id: str | None,
    conversation_id: str | None,
) -> dict[str, Any]:
    """Sube un adjunto al bucket `webchat` y devuelve metadatos normalizados."""

    content = await file.read()
    if not content:
        raise StorageError("El archivo a subir está vacío")

    original_name = file.filename or "adjunto"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    prefix = conversation_id or session_id or "general"
    key = f"{prefix}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_webchat_object(
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/") if settings.supabase_url else ""
    public_url = f"{base_url}/storage/v1/object/public/{public_path}" if base_url else public_path

    return {
        "url": public_url,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
        "provider_id": public_path,
        "path": public_path,
    }


async def upload_quote_document(
    *,
    content: bytes,
    filename: str,
    lead_id: str,
    content_type: str = "application/pdf",
) -> dict[str, str]:
    """Sube el PDF de una cotización al bucket `quotes`."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    safe_name = Path(filename).name or "cotizacion.pdf"
    key = f"{lead_id}/{uuid4().hex}-{safe_name}"
    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="quotes",
            object_key=key,
            content=content,
            content_type=content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
    }


async def upload_logo_asset(*, file: UploadFile, folder: str = "general") -> dict[str, str]:
    """Sube un logo general al bucket `logos` y devuelve metadatos básicos."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de logo está vacío")

    original_name = file.filename or "logo.png"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix or ".png"
    key = f"{folder}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="logos",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type or "application/octet-stream",
    }


async def upload_cliente_document(
    *, file: UploadFile, cliente_id: str, document_type: str
) -> dict[str, Any]:
    """Sube un documento de cliente al bucket `clientes`."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de cliente está vacío")

    original_name = file.filename or "documento"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    key = f"{cliente_id}/{document_type}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="clientes",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    storage_url = f"{base_url}/storage/v1/object/{public_path}"

    return {
        "url": storage_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
    }


async def fetch_contact(contact_id: str) -> dict[str, Any]:
    """Obtiene la representación del contacto indicado."""
    repo = CRMRepository()
    try:
        row = await repo.get_contact_by_id(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        raise StorageError("Contacto no encontrado")
    datos = row.get("contacto_datos")
    if isinstance(datos, str):
        try:
            row["contacto_datos"] = json.loads(datos)
        except json.JSONDecodeError:
            row["contacto_datos"] = {}
    elif datos is None:
        row["contacto_datos"] = {}
    return row


async def fetch_contact_identities(contact_id: str) -> list[dict[str, Any]]:
    """Recupera identidades de canal asociadas al contacto."""
    repo = CRMRepository()
    try:
        return await repo.list_contact_identities(contact_id=contact_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_delivery_event(
    *,
    provider: str,
    message_sid: str,
    event: str,
    raw_payload: dict[str, Any] | None = None,
    error_code: str | None = None,
    provider_timestamp: str | None = None,
) -> None:
    """Inserta un registro en eventos_entrega vinculado a un mensaje."""
    repo = CRMRepository()
    try:
        await repo.record_delivery_event(
            provider=provider,
            message_sid=message_sid,
            event=event,
            raw_payload=raw_payload,
            error_code=error_code,
            provider_timestamp=provider_timestamp,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_settings() -> dict[str, Any]:
    """Obtiene la configuración de recordatorios del calendario (activación y offset)."""
    repo = CRMRepository()
    try:
        record = await repo.get_calendar_settings()
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    return {
        "reminder_enabled": bool(record.get("reminder_enabled", True)),
        "reminder_offset_minutes": int(record.get("reminder_offset_minutes") or 120),
        "updated_at": record.get("updated_at"),
    }


async def update_calendar_booking_metadata(
    *,
    booking_id: str,
    metadata_patch: dict[str, Any],
    current_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fusiona y persiste metadata asociada a una reserva del calendario."""
    if not metadata_patch:
        return current_metadata or {}
    merged: dict[str, Any] = {}
    if current_metadata:
        merged.update(current_metadata)
    merged.update(metadata_patch)

    repo = CRMRepository()
    try:
        await repo.update_calendar_booking_metadata(booking_id=booking_id, metadata=merged)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return merged


async def fetch_email_template(slug: str = "default") -> dict[str, Any] | None:
    """Recupera el template de correo configurado para envíos manuales."""
    repo = CRMRepository()
    try:
        row = await repo.get_email_template(slug=slug)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None

    intro = row.get("intro")
    intro_text = intro.strip() if isinstance(intro, str) else ""

    closing = row.get("closing")
    closing_text = closing.strip() if isinstance(closing, str) else ""

    highlights_raw = row.get("highlights")
    if isinstance(highlights_raw, str):
        try:
            highlights_raw = json.loads(highlights_raw)
        except json.JSONDecodeError:
            highlights_raw = []
    if not isinstance(highlights_raw, list):
        highlights_raw = []
    highlights = [
        str(item).strip()
        for item in highlights_raw
        if isinstance(item, (str, int, float)) and str(item).strip()
    ]

    resources_raw = row.get("resources")
    if isinstance(resources_raw, str):
        try:
            resources_raw = json.loads(resources_raw)
        except json.JSONDecodeError:
            resources_raw = []
    if not isinstance(resources_raw, list):
        resources_raw = []
    resources: list[dict[str, str]] = []
    for entry in resources_raw:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label") or "").strip()
        url = str(entry.get("url") or "").strip()
        if not label or not url:
            continue
        resources.append({"label": label, "url": url})

    use_summary = row.get("use_summary")
    use_highlights = row.get("use_highlights")
    use_resources = row.get("use_resources")

    signature_salutation = row.get("signature_salutation")
    signature_text = row.get("signature")

    return {
        "intro": intro_text,
        "highlights": highlights,
        "resources": resources,
        "closing": closing_text,
        "use_summary": (bool(use_summary) if isinstance(use_summary, bool) else use_summary),
        "use_highlights": (
            bool(use_highlights) if isinstance(use_highlights, bool) else use_highlights
        ),
        "use_resources": (
            bool(use_resources) if isinstance(use_resources, bool) else use_resources
        ),
        "signature_salutation": (
            signature_salutation.strip()
            if isinstance(signature_salutation, str)
            else signature_salutation
        ),
        "signature": (
            signature_text.strip() if isinstance(signature_text, str) else signature_text
        ),
        "updated_at": row.get("updated_at"),
    }


async def update_contact(contact_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos del contacto indicado y devuelve la fila resultante."""
    if not patch:
        raise StorageError("No se proporcionaron datos para actualizar el contacto")
    repo = CRMRepository()
    try:
        row = await repo.update_contact_by_id(contact_id=contact_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    datos = row.get("contacto_datos")
    if isinstance(datos, str):
        try:
            row["contacto_datos"] = json.loads(datos)
        except json.JSONDecodeError:
            row["contacto_datos"] = {}
    elif datos is None:
        row["contacto_datos"] = {}
    return row


async def fetch_visitantes_estados(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por estado."""
    repo = CRMRepository()
    try:
        return await repo.visitas_estados(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_municipios(
    state_code: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.visitas_municipios(
            state_code=state_code,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_paises(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes agrupados por país."""
    repo = CRMRepository()
    try:
        return await repo.visitas_paises(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_visitas_detalle(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    has_chat: bool | None = None,
    session: str | None = None,
    ip: str | None = None,
    state: str | None = None,
    country: str | None = None,
    city: str | None = None,
    search: str | None = None,
    visit_min: int | None = None,
    visit_max: int | None = None,
    first_from: datetime | None = None,
    first_to: datetime | None = None,
    last_from: datetime | None = None,
    last_to: datetime | None = None,
    stay_min: float | None = None,
    stay_max: float | None = None,
    avg_stay_min: float | None = None,
    avg_stay_max: float | None = None,
    contact_status: str | None = None,
    device_types: list[str] | None = None,
    referrer: str | None = None,
    landing: str | None = None,
    order_by: str | None = None,
    order_dir: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Consulta visitas (con y sin chat) del webchat para el panel."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    country_value = country.strip() if isinstance(country, str) else country
    if isinstance(country_value, str) and not country_value:
        country_value = None
    city_value = city.strip() if isinstance(city, str) else city
    if isinstance(city_value, str) and not city_value:
        city_value = None

    payload: dict[str, Any] = {
        "p_limit": limit,
        "p_offset": offset,
        "p_country": country_value,
        "p_city": city_value,
    }
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()
    if has_chat is not None:
        payload["p_has_chat"] = has_chat
    if state:
        payload["p_state"] = state
    if search:
        payload["p_search"] = search
    if session:
        payload["p_session"] = session
    if ip:
        payload["p_ip"] = ip
    if visit_min is not None:
        payload["p_visit_min"] = visit_min
    if visit_max is not None:
        payload["p_visit_max"] = visit_max
    if first_from:
        payload["p_first_from"] = first_from.isoformat()
    if first_to:
        payload["p_first_to"] = first_to.isoformat()
    if last_from:
        payload["p_last_from"] = last_from.isoformat()
    if last_to:
        payload["p_last_to"] = last_to.isoformat()
    if stay_min is not None:
        payload["p_stay_min"] = stay_min
    if stay_max is not None:
        payload["p_stay_max"] = stay_max
    if avg_stay_min is not None:
        payload["p_avg_stay_min"] = avg_stay_min
    if avg_stay_max is not None:
        payload["p_avg_stay_max"] = avg_stay_max
    if contact_status:
        payload["p_contact_status"] = contact_status
    if device_types:
        payload["p_device_types"] = device_types
    if referrer:
        payload["p_referrer"] = referrer
    if landing:
        payload["p_landing"] = landing
    if order_by:
        payload["p_order_by"] = order_by
    if order_dir:
        payload["p_order_dir"] = order_dir

    repo = CRMRepository()
    try:
        data = await repo.visitas_detalle_custom(payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    total = 0
    total_chat = 0
    total_no_chat = 0
    cleaned: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        if total == 0:
            try:
                total = int(row.get("total_rows") or 0)
            except (TypeError, ValueError):
                total = 0
        if total_chat == 0:
            try:
                total_chat = int(row.get("total_chat_rows") or 0)
            except (TypeError, ValueError):
                total_chat = 0
        if total_no_chat == 0:
            try:
                total_no_chat = int(row.get("total_no_chat_rows") or 0)
            except (TypeError, ValueError):
                total_no_chat = 0
        row.pop("total_rows", None)
        row.pop("total_chat_rows", None)
        row.pop("total_no_chat_rows", None)
        cleaned.append(row)

    return {
        "items": cleaned,
        "total": total,
        "total_chat": total_chat,
        "total_no_chat": total_no_chat,
        "limit": limit,
        "offset": offset,
    }


async def fetch_leads_states(
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por estado."""
    repo = CRMRepository()
    try:
        return await repo.leads_estados(
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_leads_municipios(
    state_code: str,
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.leads_municipios(
            state_code=state_code,
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def ensure_conversation_opportunity(
    *,
    conversation_id: str,
    contact_id: str | None,
    channel: str | None = None,
) -> str:
    """Resuelve o crea una oportunidad CRM asociada a la conversación actual."""

    if not contact_id:
        raise StorageError("No fue posible resolver contacto para crear la oportunidad")

    contact = await fetch_contact(contact_id)
    organizacion_value = contact.get("organizacion_id")
    if not organizacion_value:
        raise StorageError("El contacto no tiene organizacion_id asociado")

    try:
        organizacion_uuid = UUID(str(organizacion_value))
    except (TypeError, ValueError) as exc:
        raise StorageError("organizacion_id_invalido") from exc

    try:
        contacto_uuid = UUID(str(contact_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("contacto_id_invalido") from exc

    repo = CRMRepository()
    try:
        oportunidad_id = await repo.ensure_conversation_opportunity(
            organizacion_id=organizacion_uuid,
            contacto_id=contacto_uuid,
            conversation_id=conversation_id,
            canal=channel,
            contacto_nombre=contact.get("nombre_completo"),
            contacto_empresa=contact.get("company_name"),
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    return str(oportunidad_id)


async def ensure_lead_tarjeta(
    *,
    tarjeta_id: str | None,
    conversation_id: str,
    contact_id: str | None,
    channel: str | None = None,
) -> str:
    """Compatibilidad: delega a ensure_conversation_opportunity."""

    return await ensure_conversation_opportunity(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel=channel,
    )


async def promote_opportunity_stage(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    stage_code: str,
    source: str | None = None,
    channel: str | None = None,
) -> bool:
    """Promueve una oportunidad a la etapa indicada (por código) si aún no ha llegado ahí."""
    normalized_code = (stage_code or "").strip().lower()
    if not normalized_code:
        return False

    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    log_context = {
        "oportunidad_id": str(opp_uuid),
        "organizacion_id": str(org_uuid),
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
    }
    try:
        stage = await repo.get_stage_by_code(
            organizacion_id=org_uuid,
            codigo=normalized_code,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not stage:
        log_event(logger, "promote_stage.stage_not_found", **log_context)
        return False

    stage_id = stage.get("id")
    if not isinstance(stage_id, UUID):
        try:
            stage_id = UUID(str(stage_id))
        except (TypeError, ValueError) as exc:
            raise StorageError("opportunity_stage_invalid_target") from exc

    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        log_event(logger, "promote_stage.opportunity_missing", **log_context)
        return False

    current_stage_value = opportunity.get("etapa_id")
    try:
        current_stage_uuid = UUID(str(current_stage_value)) if current_stage_value else None
    except (TypeError, ValueError):
        current_stage_uuid = None

    if current_stage_uuid == stage_id:
        log_event(logger, "promote_stage.already_in_stage", **log_context)
        return False

    current_stage_order = (opportunity.get("etapa") or {}).get("orden")
    target_order = stage.get("orden")
    if isinstance(current_stage_order, (int, float)) and isinstance(target_order, (int, float)):
        if current_stage_order >= target_order:
            log_event(
                logger,
                "promote_stage.skipped_order",
                current_stage_order=current_stage_order,
                target_order=target_order,
                **log_context,
            )
            return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    auto_stage = _ensure_dict(metadata.get("auto_stage"))
    auto_stage[normalized_code] = {
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    metadata["auto_stage"] = auto_stage

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"etapa_id": str(stage_id), "metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    log_event(logger, "promote_stage.success", **log_context)
    return True


async def capture_opportunity_if_ready(
    *,
    conversation_id: str,
    contact_id: str,
    channel: str | None = None,
) -> bool:
    """Crea/promueve la oportunidad cuando el contacto ya tiene al menos un dato válido."""
    capture_channel = channel or "assistant"
    log_context = {
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "channel": capture_channel,
    }

    try:
        contact = await fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.contact_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        log_event(
            logger,
            "capture_opportunity.contact_lookup_failed",
            error=str(exc),
            **log_context,
        )
        return False

    correo = str(contact.get("correo") or "").strip()
    telefono = str(contact.get("telefono_e164") or "").strip()
    if not correo and not telefono:
        log_event(logger, "capture_opportunity.skipped_no_contact_data", **log_context)
        return False

    try:
        oportunidad_id = await ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.ensure_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.ensure_failed",
            error=str(exc),
            **log_context,
        )
        return False

    organizacion_id = contact.get("organizacion_id")
    if not organizacion_id:
        log_event(
            logger,
            "capture_opportunity.no_org_context",
            opportunity_id=oportunidad_id,
            **log_context,
        )
        return True

    try:
        await promote_opportunity_stage(
            oportunidad_id=oportunidad_id,
            organizacion_id=str(organizacion_id),
            stage_code="captado",
            source="capture_opportunity",
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.promote_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.promote_failed",
            opportunity_id=oportunidad_id,
            error=str(exc),
            **log_context,
        )
        return True

    log_event(
        logger,
        "capture_opportunity.promoted",
        opportunity_id=oportunidad_id,
        stage_code="captado",
        **log_context,
    )
    return True


async def capture_lead_if_ready(
    *,
    conversation_id: str,
    contact_id: str,
    channel: str | None = None,
) -> bool:
    """Compatibilidad: delega a capture_opportunity_if_ready."""

    return await capture_opportunity_if_ready(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel=channel,
    )
