"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


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
        "select": "direccion,texto,creado_en,datos",
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
