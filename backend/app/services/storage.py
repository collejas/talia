"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

import httpx
from fastapi import UploadFile

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


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
    """Invoca la función RPC `registrar_mensaje_webchat` y retorna IDs clave."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/registrar_mensaje_webchat"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    payload: dict[str, Any] = {
        "p_session_id": session_id,
        "p_author": author,
        "p_content": content,
        "p_metadata": metadata or {},
    }
    if response_id:
        payload["p_response_id"] = response_id
    if inactivity_hours is not None:
        payload["p_inactivity_hours"] = inactivity_hours
    if attachments:
        payload["p_attachments"] = attachments

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al registrar mensaje webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al registrar mensaje webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, list) or not data:
        raise StorageError(f"Respuesta inesperada registrar_mensaje_webchat: {data!r}")
    row = data[0]
    return {
        "conversation_id": row.get("conversacion_id"),
        "message_id": row.get("mensaje_id"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
    }


async def fetch_webchat_conversation(conversation_id: str) -> dict[str, Any]:
    """Recupera metadatos de la conversación incluyendo control manual."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "id": f"eq.{conversation_id}",
        "select": (
            "id,contacto_id,canal,conversacion_openai_id,last_response_id,"
            "conversaciones_controles(manual_override)"
        ),
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar conversación webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar conversación webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list) or not data:
        raise StorageError(f"Conversación {conversation_id} no encontrada")
    row = data[0]
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


async def get_webchat_contact_id(session_id: str) -> str | None:
    """Devuelve el contacto asociado a un session_id para el canal webchat."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }

    idents_url = f"{base_url}/rest/v1/identidades_canal"
    ident_params = {
        "select": "contacto_id",
        "canal": "eq.webchat",
        "id_externo": f"eq.{session_id}",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            ident_resp = await client.get(idents_url, headers=headers, params=ident_params)
    except httpx.RequestError as exc:
        msg = f"Error de red al resolver contacto webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if ident_resp.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar identidades de canal"
            f" (status={ident_resp.status_code}, body={ident_resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    ident_data = ident_resp.json() or []
    if not isinstance(ident_data, list) or not ident_data:
        return None
    contact_id = ident_data[0].get("contacto_id")
    return str(contact_id) if contact_id else None


async def fetch_webchat_session_id(contact_id: str) -> str | None:
    """Obtiene el session_id asociado al contacto para el canal webchat."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/identidades_canal"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "id_externo",
        "contacto_id": f"eq.{contact_id}",
        "canal": "eq.webchat",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar session_id de contacto: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar session_id de contacto "
            f"(status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list) or not data:
        return None
    session_id = data[0].get("id_externo")
    return str(session_id) if session_id else None


async def resolve_webchat_conversation_from_session(session_id: str) -> dict[str, Any] | None:
    """Obtiene la última conversación webchat asociada a un session_id."""
    contact_id = await get_webchat_contact_id(session_id)
    if not contact_id:
        return None

    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }

    conv_url = f"{base_url}/rest/v1/conversaciones"
    conv_params = {
        "select": (
            "id,contacto_id,canal,conversacion_openai_id,last_response_id,"
            "conversaciones_controles(manual_override)"
        ),
        "contacto_id": f"eq.{contact_id}",
        "canal": "eq.webchat",
        "order": "iniciada_en.desc",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            conv_resp = await client.get(conv_url, headers=headers, params=conv_params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar conversación webchat por contacto: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if conv_resp.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar conversaciones webchat"
            f" (status={conv_resp.status_code}, body={conv_resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    conv_data = conv_resp.json() or []
    if not isinstance(conv_data, list) or not conv_data:
        return None
    row = conv_data[0]
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
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/webchat_session_closures"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    payload = {"session_id": session_id}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al registrar cierre de sesión webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al registrar cierre de sesión webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)


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
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/record_webchat_visitante"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }

    payload: dict[str, Any] = {"p_session_id": session_id}
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
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al registrar visitante webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al registrar visitante webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)


async def update_conversation(conversation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos de una conversación."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }
    params = {"id": f"eq.{conversation_id}", "limit": "1"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.patch(url, headers=headers, params=params, json=patch)
    except httpx.RequestError as exc:
        msg = f"Error de red al actualizar conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al actualizar conversación"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not rows:
        raise StorageError("No se encontró la conversación a actualizar")
    return rows[0]


async def upsert_conversation_insights(
    *,
    conversation_id: str,
    resumen: str | None = None,
    intencion: str | None = None,
    siguiente_accion: str | None = None,
) -> None:
    """Actualiza o inserta insights de conversación."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones_insights"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    payload: dict[str, Any] = {"conversacion_id": conversation_id}
    if resumen is not None:
        payload["resumen"] = resumen
    if intencion is not None:
        payload["intencion"] = intencion
    if siguiente_accion is not None:
        payload["siguiente_accion"] = siguiente_accion
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al guardar insights de conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al guardar insights de conversación"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)


async def get_manual_override(conversation_id: str) -> bool:
    """Indica si la conversación está en modo manual (sin asistente)."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones_controles"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "manual_override",
        "conversacion_id": f"eq.{conversation_id}",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar controles de conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar controles de conversación"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list) or not data:
        return False
    row = data[0]
    return bool(row.get("manual_override"))


async def fetch_manual_overrides(conversation_ids: list[str]) -> dict[str, bool]:
    """Obtiene flags manual_override para un conjunto de conversaciones."""
    if not conversation_ids:
        return {}
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones_controles"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    ids = ",".join(str(cid) for cid in conversation_ids)
    params = {
        "select": "conversacion_id,manual_override",
        "conversacion_id": f"in.({ids})",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar controles de conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar controles de conversación"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list):
        return {}
    result: dict[str, bool] = {}
    for row in data:
        cid = row.get("conversacion_id")
        if cid:
            result[str(cid)] = bool(row.get("manual_override"))
    return result


async def set_manual_override(conversation_id: str, manual: bool) -> None:
    """Activa o desactiva el modo manual para una conversación."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/conversaciones_controles"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates",
    }
    payload = {
        "conversacion_id": conversation_id,
        "manual_override": manual,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al actualizar controles de conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al actualizar controles de conversación"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)


async def fetch_recent_messages(*, conversation_id: str, limit: int = 8) -> list[dict[str, Any]]:
    """Obtiene los últimos mensajes de una conversación para construir historial.

    Retorna elementos con claves: direccion (entrante/saliente), texto, creado_en, datos.
    """
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/mensajes"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    params = {
        "select": "id,direccion,texto,creado_en,datos,attachments:adjuntos(id,url,mime,tamano_bytes,size_bytes,proveedor_id,nombre,path)",
        "conversacion_id": f"eq.{conversation_id}",
        "order": "creado_en.asc",
        "limit": str(limit),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:  # pragma: no cover
        msg = f"Error de red al consultar mensajes: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc
    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener mensajes"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)
    data = response.json() or []
    if not isinstance(data, list):
        return []
    return data  # type: ignore[return-value]


async def upload_webchat_attachment(
    *,
    file: UploadFile,
    session_id: str | None,
    conversation_id: str | None,
) -> dict[str, Any]:
    """Sube un adjunto al bucket `webchat` y devuelve metadatos normalizados."""

    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo a subir está vacío")

    original_name = file.filename or "adjunto"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    prefix = conversation_id or session_id or "general"
    key = f"{prefix}/{uuid4().hex}{extension}"

    base_url = settings.supabase_url.rstrip("/")
    upload_url = f"{base_url}/storage/v1/object/webchat/{key}"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": file.content_type or "application/octet-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                upload_url,
                headers=headers,
                content=content,
                params={"upsert": "true"},
            )
    except httpx.RequestError as exc:  # pragma: no cover - errores de red reales
        msg = f"Error de red al subir adjunto: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al guardar adjunto"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    public_path = (
        response.json().get("Key")
        if response.headers.get("content-type") == "application/json"
        else None
    )
    if not public_path:
        public_path = f"webchat/{key}" if not str(key).startswith("webchat/") else key
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
        "provider_id": public_path,
        "path": public_path,
    }


async def fetch_contact(contact_id: str) -> dict[str, Any]:
    """Obtiene la representación del contacto indicado."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/contactos"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": (
            "id,nombre_completo,correo,telefono_e164,company_name,notes,necesidad_proposito,"
            "contacto_datos"
        ),
        "id": f"eq.{contact_id}",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar contacto: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener contacto"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not rows:
        raise StorageError("Contacto no encontrado")
    row = rows[0]
    datos = row.get("contacto_datos")
    if isinstance(datos, str):
        try:
            row["contacto_datos"] = json.loads(datos)
        except json.JSONDecodeError:
            row["contacto_datos"] = {}
    elif datos is None:
        row["contacto_datos"] = {}
    return row


async def fetch_email_template(slug: str = "default") -> dict[str, Any] | None:
    """Recupera el template de correo configurado para envíos manuales."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/panel_email_templates"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "slug": f"eq.{slug}",
        "select": "slug,intro,highlights,resources,closing,updated_at",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar template de correo: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener template de correo"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0]

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

    return {
        "intro": intro_text,
        "highlights": highlights,
        "resources": resources,
        "closing": closing_text,
        "updated_at": row.get("updated_at"),
    }


async def update_contact(contact_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos del contacto indicado y devuelve la fila resultante."""
    if not patch:
        raise StorageError("No se proporcionaron datos para actualizar el contacto")
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/contactos"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    params = {"id": f"eq.{contact_id}", "limit": "1"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.patch(url, headers=headers, params=params, json=patch)
    except httpx.RequestError as exc:
        msg = f"Error de red al actualizar contacto: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al actualizar contacto"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not rows:
        raise StorageError("Contacto no encontrado o sin cambios")
    row = rows[0]
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
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_visitantes_sin_chat_estados"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload or None)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar visitantes sin chat por estado: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar visitantes sin chat por estado"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada de visitantes por estado: {data!r}")
    return data


async def fetch_visitantes_municipios(
    state_code: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por municipio."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_visitantes_sin_chat_municipios"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"p_estado": state_code}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar visitantes sin chat por municipio: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar visitantes sin chat por municipio"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada de visitantes por municipio: {data!r}")
    return data


async def fetch_visitantes_paises(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes agrupados por país."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_visitantes_world_paises"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload or None)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar visitantes por país: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar visitantes por país"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada de visitantes por país: {data!r}")
    return data


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
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_webchat_visitas_detalle"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar visitas webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code == 400:
        try:
            error_json = response.json()
        except ValueError:
            error_json = None
        if (
            isinstance(error_json, dict)
            and error_json.get("code") == "PGRST203"
            and "p_country" not in payload
            and "p_city" not in payload
        ):
            retry_payload = dict(payload)
            retry_payload["p_country"] = country or None
            retry_payload["p_city"] = city or None
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(url, headers=headers, json=retry_payload)
            except httpx.RequestError as exc:
                msg = f"Error de red al consultar visitas webchat: {exc}"
                logger.exception(msg)
                raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar visitas webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list):
        raise StorageError(f"Respuesta inesperada de visitas webchat: {data!r}")

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
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_leads_geo_estados"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {}
    if channels:
        payload["p_canales"] = ",".join(channels)
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload or None)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar leads por estado: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar leads por estado"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada de leads por estado: {data!r}")
    return data


async def fetch_leads_municipios(
    state_code: str,
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por municipio."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/panel_leads_geo_municipios"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"p_estado": state_code}
    if channels:
        payload["p_canales"] = ",".join(channels)
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar leads por municipio: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar leads por municipio"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json()
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada de leads por municipio: {data!r}")
    return data


async def upsert_demo_cita(payload: dict[str, Any]) -> dict[str, Any]:
    """Crea o actualiza una cita demo utilizando la función RPC fn_cita_upsert."""
    data = await _call_supabase_rpc("fn_cita_upsert", payload)
    if isinstance(data, list):
        if not data:
            raise StorageError("fn_cita_upsert respondió una lista vacía")
        first = data[0]
        if not isinstance(first, dict):
            raise StorageError(f"Respuesta inesperada fn_cita_upsert: {first!r}")
        return first
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada fn_cita_upsert: {data!r}")
    return data


async def cancel_demo_cita(payload: dict[str, Any]) -> dict[str, Any]:
    """Cancela una cita demo utilizando la función RPC fn_cita_cancel."""
    data = await _call_supabase_rpc("fn_cita_cancel", payload)
    if isinstance(data, list):
        if not data:
            raise StorageError("fn_cita_cancel respondió una lista vacía")
        first = data[0]
        if not isinstance(first, dict):
            raise StorageError(f"Respuesta inesperada fn_cita_cancel: {first!r}")
        return first
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada fn_cita_cancel: {data!r}")
    return data


async def schedule_demo_cita(payload: dict[str, Any]) -> dict[str, Any]:
    """Agenda una cita utilizando la función RPC fn_cita_schedule_json_v2."""
    normalized: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, datetime):
            normalized[key] = value.isoformat()
        elif isinstance(value, date):
            normalized[key] = datetime.combine(
                value, datetime.min.time(), tzinfo=timezone.utc
            ).isoformat()
        else:
            normalized[key] = value

    data = await _call_supabase_rpc("fn_cita_schedule_json_v2", normalized)
    if isinstance(data, list):
        if not data:
            raise StorageError("fn_cita_schedule respondió una lista vacía")
        first = data[0]
        if not isinstance(first, dict):
            raise StorageError(f"Respuesta inesperada fn_cita_schedule: {first!r}")
        return first
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada fn_cita_schedule: {data!r}")
    return data


async def reschedule_demo_cita(payload: dict[str, Any]) -> dict[str, Any]:
    """Reprograma una cita utilizando la función RPC fn_cita_reschedule."""
    data = await _call_supabase_rpc("fn_cita_reschedule", payload)
    if isinstance(data, list):
        if not data:
            raise StorageError("fn_cita_reschedule respondió una lista vacía")
        first = data[0]
        if not isinstance(first, dict):
            raise StorageError(f"Respuesta inesperada fn_cita_reschedule: {first!r}")
        return first
    if not isinstance(data, dict):
        raise StorageError(f"Respuesta inesperada fn_cita_reschedule: {data!r}")
    return data


async def get_demo_cita(cita_id: str) -> dict[str, Any] | None:
    """Obtiene una cita demo por ID directo desde Supabase."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/citas"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {"id": f"eq.{cita_id}", "limit": "1"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar citas"
            f" (status={resp.status_code}, body={resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = resp.json() or []
    if isinstance(rows, list) and rows:
        first = rows[0]
        if isinstance(first, dict):
            return first
    if isinstance(rows, dict):
        return rows
    return None


async def fetch_demo_citas_range(
    *,
    start_at: datetime,
    end_at: datetime,
    estados: Iterable[str] | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Recupera citas dentro de un rango para validar disponibilidad."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
    if end_at <= start_at:
        return []

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/panel_agenda_calendario"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }

    start_iso = start_at.astimezone(timezone.utc).isoformat()
    end_iso = end_at.astimezone(timezone.utc).isoformat()
    params: dict[str, Any] = {
        "select": "id,start_at,end_at,timezone,estado,metadata,tarjeta_id,contacto_id,provider",
        "order": "start_at.asc",
        "limit": str(max(1, limit)),
        "and": f"(start_at.gte.{start_iso},start_at.lte.{end_iso})",
    }
    estados_norm = (
        [str(item).strip().lower() for item in estados if str(item).strip()] if estados else None
    )
    if estados_norm:
        if len(estados_norm) == 1:
            params["estado"] = f"eq.{estados_norm[0]}"
        else:
            params["estado"] = f"in.({','.join(sorted(set(estados_norm)))})"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code >= 400:
        msg = (
            "Supabase respondió error al consultar citas para disponibilidad"
            f" (status={resp.status_code}, body={resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = resp.json() or []
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


async def fetch_agenda_slots(
    *,
    conversation_id: str,
    start_date: date,
    end_date: date,
    calendario_id: str | None,
    slot_minutes: int,
    buffer_minutes: int,
    timezone_name: str,
    max_slots: int,
    exclude_cita_id: str | None = None,
) -> list[dict[str, Any]]:
    """Consulta la disponibilidad real desde fn_agenda_slots_disponibles."""
    payload: dict[str, Any] = {
        "p_conversacion_id": conversation_id,
        "p_fecha_inicio": start_date.isoformat(),
        "p_fecha_fin": end_date.isoformat(),
        "p_slot_minutes": slot_minutes,
        "p_buffer_minutes": buffer_minutes,
        "p_timezone": timezone_name,
        "p_max_slots": max_slots,
    }
    if calendario_id:
        payload["p_calendario_id"] = calendario_id
    if exclude_cita_id:
        payload["p_exclude_cita_id"] = exclude_cita_id

    data = await _call_supabase_rpc("fn_agenda_slots_disponibles", payload)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    raise StorageError(f"Respuesta inesperada fn_agenda_slots_disponibles: {data!r}")


async def ensure_lead_tarjeta(
    *,
    tarjeta_id: str | None,
    conversation_id: str,
    contact_id: str | None,
) -> str:
    """Resuelve o crea una tarjeta de lead asociada a la conversación actual."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/lead_tarjetas"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:

        async def _fetch(params: dict[str, Any]) -> dict[str, Any] | None:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code >= 400:
                msg = (
                    "Supabase respondió error al consultar lead_tarjetas"
                    f" (status={resp.status_code}, body={resp.text!r})"
                )
                logger.error(msg)
                raise StorageError(msg)
            rows = resp.json() or []
            if isinstance(rows, list) and rows:
                return rows[0]
            return None

        async def _update_card(card_id: str, patch: dict[str, Any]) -> None:
            if not patch:
                return
            patch_headers = {
                **headers,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }
            params = {"id": f"eq.{card_id}", "limit": "1"}
            resp = await client.patch(url, headers=patch_headers, params=params, json=patch)
            if resp.status_code >= 400:
                msg = (
                    "Supabase respondió error al actualizar lead_tarjetas"
                    f" (status={resp.status_code}, body={resp.text!r})"
                )
                logger.warning(msg)

        def _extract_id(row: dict[str, Any]) -> str:
            resolved_id = row.get("id")
            if not resolved_id:
                raise StorageError("La tarjeta de lead recuperada no contiene id")
            return str(resolved_id)

        # 1. Validar tarjeta explícita.
        if tarjeta_id:
            row = await _fetch(
                {
                    "id": f"eq.{tarjeta_id}",
                    "select": "id,conversacion_id,contacto_id",
                    "limit": "1",
                }
            )
            if not row:
                logger.warning(
                    "storage.ensure_lead_tarjeta.id_not_found",
                    extra={"tarjeta_id": tarjeta_id, "conversation_id": conversation_id},
                )
            else:
                if conversation_id and not row.get("conversacion_id"):
                    await _update_card(_extract_id(row), {"conversacion_id": conversation_id})
                return _extract_id(row)

        # 2. Buscar por conversación actual.
        row = await _fetch(
            {
                "conversacion_id": f"eq.{conversation_id}",
                "select": "id,conversacion_id,contacto_id",
                "limit": "1",
            }
        )
        if row:
            return _extract_id(row)

        # 3. Buscar por contacto asociado.
        if contact_id:
            row = await _fetch(
                {
                    "contacto_id": f"eq.{contact_id}",
                    "select": "id,conversacion_id,contacto_id",
                    "order": "creado_en.desc",
                    "limit": "1",
                }
            )
            if row:
                if conversation_id and not row.get("conversacion_id"):
                    await _update_card(_extract_id(row), {"conversacion_id": conversation_id})
                return _extract_id(row)

        if not contact_id:
            raise StorageError("No fue posible resolver contacto para crear la tarjeta del lead")

        # 4. Crear tarjeta mínima enlazada a la conversación.
        insert_headers = {
            **headers,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        payload = {
            "contacto_id": contact_id,
            "conversacion_id": conversation_id,
            "fuente": "asistente",
        }
        resp = await client.post(url, headers=insert_headers, json=payload)
        if resp.status_code == 409:
            # Probablemente ya existe una tarjeta para este contacto/tablero.
            row = await _fetch(
                {
                    "contacto_id": f"eq.{contact_id}",
                    "select": "id,conversacion_id,contacto_id",
                    "order": "creado_en.desc",
                    "limit": "1",
                }
            )
            if row:
                if conversation_id and not row.get("conversacion_id"):
                    await _update_card(_extract_id(row), {"conversacion_id": conversation_id})
                return _extract_id(row)
            msg = (
                "Supabase devolvió conflicto al crear lead_tarjetas pero no se encontró la tarjeta"
                f" (contacto_id={contact_id})"
            )
            logger.error(msg)
            raise StorageError(msg)

        if resp.status_code >= 400:
            msg = (
                "Supabase respondió error al crear lead_tarjetas"
                f" (status={resp.status_code}, body={resp.text!r})"
            )
            logger.error(msg)
            raise StorageError(msg)

        data = resp.json() or []
        if isinstance(data, list) and data:
            return _extract_id(data[0])
        if isinstance(data, dict) and data:
            return _extract_id(data)
        raise StorageError("Respuesta inesperada al crear la tarjeta del lead")


async def _call_supabase_rpc(function_name: str, payload: dict[str, Any]) -> Any:
    """Invoca una función RPC en Supabase usando el service role."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/{function_name}"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        msg = f"Error de red al llamar {function_name}: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            f"Supabase respondió error en {function_name}"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    if response.status_code == 204:
        return {}

    try:
        return response.json()
    except ValueError as exc:
        msg = f"Respuesta inválida de {function_name}: {exc}"
        logger.error(msg)
        raise StorageError(msg) from exc


async def update_cita_fields(cita_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Actualiza columnas directas de la cita mediante REST."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    payload = {key: value for key, value in fields.items() if value is not None}
    if not payload:
        raise StorageError("No se proporcionaron campos para actualizar la cita")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/citas"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    params = {"id": f"eq.{cita_id}", "limit": "1"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(url, headers=headers, params=params, json=payload)

    if resp.status_code >= 400:
        msg = (
            "Supabase respondió error al actualizar la cita"
            f" (status={resp.status_code}, body={resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = resp.json() or []
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            return first
    if isinstance(data, dict):
        return data
    raise StorageError("Respuesta inesperada al actualizar la cita")


async def merge_cita_metadata(
    cita_id: str,
    current_metadata: dict[str, Any] | None,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Combina metadatos existentes con un diccionario nuevo."""
    base_metadata = dict(current_metadata or {})
    merged = {**base_metadata, **updates}
    return await update_cita_fields(cita_id, {"metadata": merged})


async def update_cita_invite_status(
    cita_id: str,
    status: str,
    *,
    sent_at: datetime | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    """Actualiza columnas de invitación de la cita."""
    if status not in {"pendiente", "enviado", "fallido"}:
        raise StorageError(f"Estado de invitación inválido: {status}")

    payload: dict[str, Any] = {"invite_status": status}
    if sent_at is not None:
        payload["invite_sent_at"] = sent_at.astimezone(timezone.utc).isoformat()
    if message_id is not None:
        payload["invite_message_id"] = message_id

    return await update_cita_fields(cita_id, payload)
