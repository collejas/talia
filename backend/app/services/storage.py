"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:  # pragma: no cover - depende de red
        msg = f"Error de red al llamar a Supabase: {exc}"
        logger.exception(msg)
        raise StorageError(msg) from exc

    if response.status_code >= 400:
        msg = (
            "Supabase RPC respondió con error"
            f" (status={response.status_code}, body={response.text!r})"
        )
        logger.error(msg)
        raise StorageError(msg)

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

    return WebchatRecord(
        conversation_id=str(record["conversacion_id"]),
        message_id=str(record["mensaje_id"]),
    )
