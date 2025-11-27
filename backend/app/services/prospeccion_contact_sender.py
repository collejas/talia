"""Worker asíncrono para procesar envíos de prospección."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence
from uuid import UUID

from app.channels.voice.service import VoiceCallResult, start_outbound_call
from app.channels.whatsapp.service import TwilioSendResult, _send_whatsapp_reply
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import EmailSendError, send_email
from app.services.metrics import metrics
from app.services.prospeccion_progress import progress_hub

logger = get_logger("prospeccion.contact_sender")

DEFAULT_BACKOFF_SECONDS: tuple[int, ...] = (30, 120, 300, 600)


@dataclass(slots=True)
class ContactEnvioResult:
    """Resultado simplificado del intento de envío."""

    estado: str
    detalle: dict[str, Any]
    error: str | None = None
    mensaje_id: str | None = None
    retryable: bool = False


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _prospecto_whatsapp_allowed(info: dict[str, Any]) -> bool:
    if info.get("whatsapp_permitido"):
        return True
    carrier_type = _clean_text(info.get("carrier_type")) or ""
    return carrier_type.lower() == "mobile"


def _prospecto_llamada_permitida(info: dict[str, Any]) -> bool:
    if info.get("llamada_permitida"):
        return True
    carrier_type = _clean_text(info.get("carrier_type")) or ""
    return carrier_type.lower() in {"mobile", "landline"}


def _merge_detalle(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base or {})
    merged.update(extra or {})
    return merged


def _build_contact_log_entry(
    *,
    prospecto_id: Any,
    canal: str,
    estado: str,
    detalle: dict[str, Any],
    error: str | None = None,
    batch_id: Any | None = None,
    envio_id: Any | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "prospecto_id": str(prospecto_id),
        "canal": canal,
        "estado": estado,
        "detalle": detalle,
    }
    if error:
        entry["error"] = error
    if batch_id:
        entry["batch_id"] = str(batch_id)
    if envio_id:
        entry["envio_id"] = str(envio_id)
    return entry


async def _broadcast_batch_event(batch_id: Any, payload: dict[str, Any]) -> None:
    """Envía eventos de actualización a los suscriptores SSE."""

    if not batch_id:
        return
    enriched = dict(payload)
    enriched.setdefault("batch_id", str(batch_id))
    await progress_hub.publish(str(batch_id), enriched)


async def _send_whatsapp_message(to_number: str, body: str) -> TwilioSendResult:
    if not body:
        return TwilioSendResult(sid=None, status="skipped", error="empty_body")
    return await _send_whatsapp_reply(to_number=to_number, body=body)


async def _run_envio_correo(envio: dict[str, Any], payload: dict[str, Any]) -> ContactEnvioResult:
    email_value = _clean_text(envio.get("email"))
    if not email_value:
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "sin_correo"},
        )
    subject = _clean_text(payload.get("subject"))
    body = payload.get("body")
    if not subject or not body:
        return ContactEnvioResult(
            estado="error",
            detalle={"reason": "correo_payload_incompleto"},
            error="correo_payload_incompleto",
        )
    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text=body,
            recipients=[email_value],
        )
    except EmailSendError as exc:
        return ContactEnvioResult(
            estado="error",
            detalle={"email": email_value},
            error=str(exc),
            retryable=True,
        )
    return ContactEnvioResult(
        estado="enviado",
        detalle={"email": email_value},
        mensaje_id=message_id,
    )


async def _run_envio_whatsapp(envio: dict[str, Any], payload: dict[str, Any]) -> ContactEnvioResult:
    telefono = _clean_text(envio.get("phone"))
    if not telefono or not _prospecto_whatsapp_allowed(envio):
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "whatsapp_no_permitido"},
        )
    body = _clean_text(payload.get("body"))
    if not body:
        return ContactEnvioResult(
            estado="error",
            detalle={"reason": "whatsapp_payload_incompleto"},
            error="whatsapp_payload_incompleto",
        )
    wa_result = await _send_whatsapp_message(to_number=telefono, body=body)
    estado = "enviado" if not wa_result.error else "error"
    return ContactEnvioResult(
        estado=estado,
        detalle={"status": wa_result.status, "sid": wa_result.sid},
        error=wa_result.error,
        mensaje_id=wa_result.sid,
        retryable=bool(wa_result.error),
    )


async def _run_envio_llamada(envio: dict[str, Any], payload: dict[str, Any]) -> ContactEnvioResult:
    telefono = _clean_text(envio.get("phone"))
    if not telefono or not _prospecto_llamada_permitida(envio):
        return ContactEnvioResult(
            estado="omitido",
            detalle={"reason": "llamada_no_permitida"},
        )
    message = _clean_text(payload.get("message")) or "Llamada programada desde Tal IA."
    call_result: VoiceCallResult = await start_outbound_call(
        to_number=telefono,
        message=message,
    )
    if call_result.error:
        return ContactEnvioResult(
            estado="error",
            detalle={"status": call_result.status},
            error=call_result.error,
            retryable=True,
        )
    status_value = (call_result.status or "").lower()
    estado = (
        "enviado"
        if status_value in {"queued", "ringing", "in-progress"}
        else (call_result.status or "enviado")
    )
    return ContactEnvioResult(
        estado=estado,
        detalle={"status": call_result.status, "sid": call_result.sid},
        mensaje_id=call_result.sid,
    )


class ProspeccionContactSender:
    """Procesa envíos pendientes de forma asíncrona."""

    def __init__(
        self,
        *,
        poll_interval: float = 5.0,
        batch_size: int = 25,
        retry_backoff: Sequence[int] = DEFAULT_BACKOFF_SECONDS,
    ) -> None:
        self._poll_interval = poll_interval
        self._batch_size = batch_size
        self._retry_backoff = tuple(int(value) for value in retry_backoff if value > 0) or (
            DEFAULT_BACKOFF_SECONDS
        )
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._enabled = True

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            log_event(
                logger,
                "prospeccion.sender_disabled",
                reason="supabase_config_missing",
            )
            return
        self._enabled = True
        self._stop_event.clear()
        self._wake_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="prospeccion-contact-sender")
        log_event(logger, "prospeccion.sender_started")

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        self._wake_event.set()
        try:
            await self._task
        finally:
            self._task = None
        log_event(logger, "prospeccion.sender_stopped")

    def notify_new_envios(self) -> None:
        """Despierta el worker para procesar de inmediato."""
        if not self._task or not self._enabled:
            return
        self._wake_event.set()

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            processed = False
            try:
                processed = await self._process_pending_envios()
            except CRMRepositoryError as exc:
                log_event(logger, "prospeccion.sender_repo_error", error=str(exc))
                processed = False
            except Exception as exc:  # pragma: no cover - fallos inesperados
                logger.exception("prospeccion.sender_unhandled", extra={"error": str(exc)})
                processed = False

            wait_timeout = 0 if processed else self._poll_interval
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=wait_timeout)
            except asyncio.TimeoutError:
                continue
            finally:
                self._wake_event.clear()

    async def _process_pending_envios(self) -> bool:
        repo = CRMRepository()
        envios = await repo.worker_list_pending_envios(limit=self._batch_size)
        if not envios:
            return False

        for envio in envios:
            try:
                await self._process_envio(repo, envio)
            except CRMRepositoryError:
                raise
            except Exception as exc:  # pragma: no cover - protección adicional
                logger.exception(
                    "prospeccion.sender_envio_failed",
                    extra={"envio_id": envio.get("id"), "error": str(exc)},
                )
        return len(envios) >= self._batch_size

    async def _process_envio(self, repo: CRMRepository, envio: dict[str, Any]) -> None:
        envio_id_value = envio.get("id")
        try:
            envio_id = UUID(str(envio_id_value))
        except (TypeError, ValueError):
            log_event(logger, "prospeccion.sender_invalid_envio_id", envio_id=envio_id_value)
            return

        intento_actual = int(envio.get("intento_actual") or 0) + 1
        max_reintentos = max(int(envio.get("max_reintentos") or 1), 1)
        claimed = await repo.worker_mark_envio_processing(
            envio_id=envio_id,
            attempt=intento_actual,
        )
        if not claimed:
            return

        canal = _clean_text(envio.get("canal")) or ""
        detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
        payload = envio.get("payload") if isinstance(envio.get("payload"), dict) else {}

        if canal == "correo":
            result = await _run_envio_correo(detalle, payload)
        elif canal == "whatsapp":
            result = await _run_envio_whatsapp(detalle, payload)
        elif canal == "llamada":
            result = await _run_envio_llamada(detalle, payload)
        else:
            result = ContactEnvioResult(
                estado="omitido",
                detalle={"reason": "canal_no_soportado"},
                error="canal_no_soportado",
            )

        update_payload = self._build_envio_update_payload(
            envio=envio,
            envio_id=envio_id,
            result=result,
            intento=intento_actual,
            max_reintentos=max_reintentos,
        )
        await repo.worker_complete_envio(envio_id=envio_id, payload=update_payload)

        await _broadcast_batch_event(
            batch_id=envio.get("batch_id"),
            payload={
                "type": "envio",
                "envio_id": str(envio_id),
                "estado": update_payload["estado"],
            },
        )
        metrics.increment(canal or "desconocido", update_payload["estado"])

        log_entry = _build_contact_log_entry(
            prospecto_id=envio.get("prospecto_id"),
            canal=canal,
            estado=result.estado if update_payload["estado"] != "pendiente" else "reintento",
            detalle=result.detalle,
            error=result.error,
            batch_id=envio.get("batch_id"),
            envio_id=envio_id,
        )
        await repo.worker_insert_contact_logs([log_entry])

        batch_id = envio.get("batch_id")
        batch_state: str | None = None
        if batch_id:
            try:
                batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id)))
            except (ValueError, CRMRepositoryError):
                log_event(logger, "prospeccion.sender_batch_sync_failed", batch_id=batch_id)
        if batch_state:
            await _broadcast_batch_event(
                batch_id=batch_id,
                payload={
                    "type": "batch",
                    "estado": batch_state,
                },
            )

    def _build_envio_update_payload(
        self,
        *,
        envio: dict[str, Any],
        envio_id: UUID,
        result: ContactEnvioResult,
        intento: int,
        max_reintentos: int,
    ) -> dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        current_detalle = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
        merged_detalle = _merge_detalle(current_detalle, result.detalle)

        payload: dict[str, Any] = {
            "estado": result.estado,
            "detalle": merged_detalle,
            "procesado_en": now_iso,
            "error": result.error,
        }
        if result.mensaje_id:
            payload["mensaje_id"] = result.mensaje_id

        should_retry = result.estado == "error" and result.retryable and intento < max_reintentos
        if should_retry:
            payload["estado"] = "pendiente"
            backoff_seconds = self._next_backoff(intento)
            payload["programado_en"] = (
                datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
            ).isoformat()
        return payload

    def _next_backoff(self, intento: int) -> int:
        index = max(0, intento - 1)
        if index >= len(self._retry_backoff):
            return self._retry_backoff[-1]
        return self._retry_backoff[index]


contact_sender = ProspeccionContactSender()

__all__ = [
    "ContactEnvioResult",
    "ProspeccionContactSender",
    "contact_sender",
]
