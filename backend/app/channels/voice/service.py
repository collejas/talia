"""Servicios para el canal de voz."""

from __future__ import annotations

import asyncio
import html
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import twilio as twilio_service
from app.services.metrics import metrics
from app.services.prospeccion_progress import progress_hub

from .schemas import VoiceStatusCallback

logger = get_logger(__name__)


@dataclass(slots=True)
class VoiceCallResult:
    """Resultado resumido al iniciar una llamada."""

    sid: str | None
    status: str | None
    error: str | None = None


async def handle_voice_status(callback: VoiceStatusCallback) -> None:
    """Placeholder para manejar estatus de llamadas Twilio."""
    log_event(
        logger,
        "voice.status_stub",
        call_sid=callback.call_sid,
        call_status=callback.call_status,
        direction=callback.direction,
    )
    await _sync_envio_status_from_voice(callback)


async def _sync_envio_status_from_voice(callback: VoiceStatusCallback) -> None:
    """Sincroniza el envío de llamadas con los callbacks de Twilio."""

    estado_envio = _map_voice_status_to_estado(callback.call_status)
    if not estado_envio:
        return
    try:
        repo = CRMRepository()
    except CRMRepositoryError as exc:
        log_event(logger, "voice.status_repo_error", error=str(exc))
        return
    try:
        envio = await repo.worker_get_envio_by_mensaje(mensaje_id=callback.call_sid)
    except CRMRepositoryError as exc:
        log_event(logger, "voice.status_envio_fetch_failed", error=str(exc))
        return
    if not envio:
        return
    envio_id = envio.get("id")
    if not envio_id:
        return
    try:
        envio_uuid = UUID(str(envio_id))
    except (TypeError, ValueError):
        log_event(logger, "voice.status_invalid_envio_id", envio_id=envio_id)
        return
    current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
    merged_detalle = {
        **current_detalle,
        "status": callback.call_status,
        "direction": callback.direction,
    }
    payload = {
        "estado": estado_envio,
        "detalle": merged_detalle,
        "error": None if estado_envio != "fallido" else callback.call_status,
        "procesado_en": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await repo.worker_complete_envio(envio_id=envio_uuid, payload=payload)
        metrics.increment("llamada", payload["estado"])
        batch_id_value = envio.get("batch_id")
        if batch_id_value:
            await progress_hub.publish(
                str(batch_id_value),
                {
                    "type": "envio",
                    "batch_id": batch_id_value,
                    "envio_id": str(envio_uuid),
                    "estado": payload["estado"],
                },
            )
        await repo.worker_insert_contact_logs(
            [
                {
                    "prospecto_id": (
                        str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None
                    ),
                    "canal": "llamada",
                    "estado": estado_envio,
                    "detalle": {
                        "status": callback.call_status,
                        "direction": callback.direction,
                    },
                    "error": callback.call_status if estado_envio == "fallido" else None,
                    "batch_id": str(envio.get("batch_id")) if envio.get("batch_id") else None,
                    "envio_id": str(envio_uuid),
                }
            ]
        )
        batch_state = None
        if estado_envio == "fallido" and batch_id_value:
            batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id_value)))
        if batch_state and batch_id_value:
            await progress_hub.publish(
                str(batch_id_value),
                {
                    "type": "batch",
                    "batch_id": batch_id_value,
                    "estado": batch_state,
                },
            )
    except CRMRepositoryError as exc:
        log_event(
            logger,
            "voice.status_envio_update_failed",
            error=str(exc),
            call_sid=callback.call_sid,
        )


def _map_voice_status_to_estado(status: str | None) -> str | None:
    if not status:
        return None
    normalized = status.strip().lower()
    mapping = {
        "queued": "enviado",
        "ringing": "enviado",
        "in-progress": "enviado",
        "answered": "entregado",
        "completed": "entregado",
        "completed-with-recording": "entregado",
        "busy": "fallido",
        "failed": "fallido",
        "no-answer": "fallido",
        "canceled": "fallido",
    }
    return mapping.get(normalized)


async def start_outbound_call(*, to_number: str, message: str) -> VoiceCallResult:
    """Inicia una llamada mediante Twilio Voice y lee el mensaje provisto."""

    if (
        not settings.twilio_account_sid
        or not settings.twilio_auth_token
        or not settings.twilio_phone_number
    ):
        logger.warning("voice.twilio_not_configured")
        return VoiceCallResult(sid=None, status="skipped", error="twilio_not_configured")
    normalized_to = to_number.strip()
    if not normalized_to:
        return VoiceCallResult(sid=None, status="skipped", error="telefono_invalid")
    client = twilio_service.get_twilio_client()
    twiml_message = (
        "<Response><Say language=\"es-MX\" voice=\"Polly.Mia\">"
        f"{html.escape(message or 'Tal IA marcó esta llamada de seguimiento.')}"
        "</Say></Response>"
    )
    try:
        call = await asyncio.to_thread(
            client.calls.create,
            to=normalized_to,
            from_=settings.twilio_phone_number,
            twiml=twiml_message,
        )
    except Exception as exc:  # pragma: no cover - errores propios del SDK
        logger.exception("voice.twilio_call_failed", extra={"error": str(exc)})
        return VoiceCallResult(sid=None, status="failed", error=str(exc))
    return VoiceCallResult(
        sid=getattr(call, "sid", None),
        status=getattr(call, "status", None),
        error=None,
    )
