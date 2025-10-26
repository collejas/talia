"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


@dataclass(slots=True)
class WebchatRecord:
    """Resultado de registrar un mensaje en la conversación webchat."""

    conversation_id: str
    message_id: str
    conversation_openai_id: str | None = None


@dataclass(slots=True)
class WebchatConversationInfo:
    """Información básica para operar una conversación webchat existente."""

    conversation_id: str
    session_id: str
    contact_id: str | None = None


@dataclass(slots=True)
class WebchatStoredMessage:
    """Mensaje persistido en Supabase con metadata adicional."""

    conversation_id: str
    message_id: str
    direction: str | None = None
    content: str | None = None
    metadata: dict[str, Any] | None = None


async def fetch_webchat_conversation_info(conversation_id: str) -> WebchatConversationInfo:
    """Obtiene session_id de webchat asociado a una conversación."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    conv_url = f"{base_url}/rest/v1/conversaciones"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "id,canal,contacto_id",
        "id": f"eq.{conversation_id}",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            conv_resp = await client.get(conv_url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar conversación: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if conv_resp.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener conversación"
            f" (status={conv_resp.status_code}, body={conv_resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = conv_resp.json() or []
    if not rows:
        raise StorageError("Conversación no encontrada")
    row = rows[0]
    canal = row.get("canal")
    if canal != "webchat":
        raise StorageError("La conversación no pertenece al canal webchat")
    contacto_id = row.get("contacto_id")
    if not contacto_id:
        raise StorageError("La conversación no tiene contacto asociado")

    ident_url = f"{base_url}/rest/v1/identidades_canal"
    ident_params = {
        "select": "id_externo",
        "contacto_id": f"eq.{contacto_id}",
        "canal": "eq.webchat",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            ident_resp = await client.get(ident_url, headers=headers, params=ident_params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar identidades: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if ident_resp.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener identidades"
            f" (status={ident_resp.status_code}, body={ident_resp.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    ident_rows = ident_resp.json() or []
    if not ident_rows:
        raise StorageError("No se encontró identidad de canal webchat")
    session_id = ident_rows[0].get("id_externo")
    if not session_id:
        raise StorageError("Identidad webchat sin session_id")

    return WebchatConversationInfo(
        conversation_id=str(conversation_id),
        session_id=str(session_id),
        contact_id=str(contacto_id),
    )


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


async def find_webchat_message_by_client_id(
    *,
    session_id: str,
    client_message_id: str,
) -> WebchatStoredMessage | None:
    """Busca un mensaje previo usando el identificador generado en el cliente."""
    if not client_message_id:
        return None
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/mensajes"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "id,conversacion_id,direccion,texto,datos",
        "order": "creado_en.desc",
        "limit": "1",
        "datos->>session_id": f"eq.{session_id}",
        "datos->>client_message_id": f"eq.{client_message_id}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar mensajes por client_message_id: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al buscar mensajes por client_message_id"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not rows:
        return None
    row = rows[0]
    metadata = row.get("datos")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    elif metadata is None:
        metadata = {}

    conversation_id = row.get("conversacion_id")
    message_id = row.get("id")
    if not conversation_id or not message_id:
        return None
    return WebchatStoredMessage(
        conversation_id=str(conversation_id),
        message_id=str(message_id),
        direction=row.get("direccion"),
        content=row.get("texto"),
        metadata=metadata if isinstance(metadata, dict) else {},
    )


async def fetch_webchat_reply_for_message(
    *,
    conversation_id: str,
    in_reply_to: str,
) -> WebchatStoredMessage | None:
    """Obtiene el mensaje de salida asociado a un mensaje entrante previo."""
    if not in_reply_to:
        return None
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/mensajes"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "id,conversacion_id,direccion,texto,datos",
        "conversacion_id": f"eq.{conversation_id}",
        "direccion": "eq.saliente",
        "datos->>in_reply_to": f"eq.{in_reply_to}",
        "order": "creado_en.desc",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:
        msg = f"Error de red al consultar respuesta asociada: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener respuesta asociada"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    rows = response.json() or []
    if not rows:
        return None
    row = rows[0]
    metadata = row.get("datos")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    elif metadata is None:
        metadata = {}

    message_id = row.get("id")
    text = row.get("texto")
    if not message_id:
        return None
    return WebchatStoredMessage(
        conversation_id=str(conversation_id),
        message_id=str(message_id),
        direction=row.get("direccion"),
        content=text,
        metadata=metadata if isinstance(metadata, dict) else {},
    )


async def fetch_webchat_history(
    *, session_id: str, limit: int = 50, since: str | None = None
) -> list[dict[str, Any]]:
    """Recupera mensajes de webchat asociados a una sesión."""
    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/mensajes"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params: dict[str, str] = {
        "select": "id,direccion,texto,creado_en,datos",
        "order": "creado_en.asc",
        "limit": str(limit),
        "datos->>session_id": f"eq.{session_id}",
    }
    if since:
        params["creado_en"] = f"gt.{since}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.RequestError as exc:  # pragma: no cover
        msg = f"Error de red al consultar historial webchat: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase respondió error al obtener historial webchat"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

    data = response.json() or []
    if not isinstance(data, list):
        return []
    return data  # type: ignore[return-value]


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


async def record_webchat_message(
    *,
    session_id: str,
    author: str,
    content: str,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> WebchatRecord:
    """Invoca la función RPC `registrar_mensaje_webchat` para guardar mensajes.

    Args:
        session_id: Identificador del hilo del usuario.
        author: `user` para mensajes entrantes, cualquier otro valor se trata como asistente.
        content: Contenido plano del mensaje.
        response_id: Identificador opcional devuelto por OpenAI.
        metadata: Campos adicionales a adjuntar en la columna `datos`.
    """

    if not settings.supabase_url or not settings.supabase_service_role:
        raise StorageError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/registrar_mensaje_webchat"

    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    payload: dict[str, Any] = {
        "p_session_id": session_id,
        "p_author": author,
        "p_content": content,
    }
    if response_id:
        payload["p_response_id"] = response_id
    if metadata:
        payload["p_metadata"] = metadata
    # Reglas de inactividad (horas) provenientes de variable de entorno
    if settings.webchat_inactivity_hours:
        payload["p_inactivity_hours"] = int(settings.webchat_inactivity_hours)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:  # pragma: no cover - depende de red
        msg = f"Error de red al llamar a Supabase: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        body_text = response.text
        base_msg = (
            "Supabase RPC respondió con error"
            f" (status={response.status_code}, body={body_text!r})"
        )
        # Fallback: si la función aún no acepta p_inactivity_hours, reintenta sin él
        if (
            response.status_code == 404
            and "p_inactivity_hours" in body_text
            and "registrar_mensaje_webchat" in body_text
        ):
            payload_retry = {k: v for k, v in payload.items() if k != "p_inactivity_hours"}
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(url, headers=headers, json=payload_retry)
            except httpx.RequestError as exc:  # pragma: no cover
                logger.error(base_msg)
                raise StorageError(base_msg) from exc
            if response.status_code >= 400:
                msg = (
                    "Supabase RPC respondió con error (reintento sin p_inactivity_hours)"
                    f" (status={response.status_code}, body={response.text!r})"
                )
                logger.error(msg)
                raise StorageError(msg)
        else:
            logger.error(base_msg)
            raise StorageError(base_msg)

    data = response.json() if response.text else None
    record: dict[str, Any] | None
    if isinstance(data, list):
        record = data[0] if data else None
    else:
        record = data

    if not record or "conversacion_id" not in record:
        msg = f"Respuesta inesperada de Supabase: {data!r}"
        logger.error(msg)
        raise StorageError(msg)

    openai_conv_id = record.get("conversacion_openai_id") or record.get("openai_conversation_id")
    return WebchatRecord(
        conversation_id=str(record["conversacion_id"]),
        message_id=str(record["mensaje_id"]),
        conversation_openai_id=str(openai_conv_id) if openai_conv_id else None,
    )


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
        "select": "id,nombre_completo,correo,telefono_e164,contacto_datos",
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
