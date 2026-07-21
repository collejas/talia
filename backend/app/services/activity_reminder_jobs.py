"""Worker periodico que convierte recordatorios de actividades en notificaciones UI."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.user_notifications import (
    UserNotificationAction,
    UserNotificationCreate,
    create_and_publish_user_notification,
)

logger = get_logger(__name__)


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _clean_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _parse_iso_datetime(value: Any) -> datetime | None:
    text = _clean_text(value)
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class ActivityReminderJobsRunner:
    """Procesa actividades vencidas para generar notificaciones persistentes."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "activity_reminder_queue_enabled", True)):
            logger.info("activity_reminder.runner_disabled", extra={"reason": "disabled_by_config"})
            return
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="activity-reminder-jobs")
        logger.info(
            "activity_reminder.runner_started",
            extra={"interval_seconds": int(settings.activity_reminder_runner_interval_seconds)},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            await self._task
            self._task = None
        logger.info("activity_reminder.runner_stopped")

    async def wakeup(self) -> None:
        self._wake.set()

    async def _run_loop(self) -> None:
        interval_seconds = max(5, int(getattr(settings, "activity_reminder_runner_interval_seconds", 30)))
        while not self._stop.is_set():
            try:
                await self._process_cycle()
            except Exception as exc:  # pragma: no cover - defensivo
                logger.exception("activity_reminder.runner_cycle_failed", extra={"error": str(exc)})
            self._wake.clear()
            wait_tasks = [
                asyncio.create_task(self._stop.wait()),
                asyncio.create_task(self._wake.wait()),
            ]
            try:
                done, pending = await asyncio.wait(
                    wait_tasks,
                    timeout=interval_seconds,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    _ = task.result()
            finally:
                for task in wait_tasks:
                    if not task.done():
                        task.cancel()

    async def _process_cycle(self) -> None:
        repo = CRMRepository()
        try:
            activities = await repo.list_due_activities_for_reminders(limit=100)
        except CRMRepositoryError as exc:
            logger.warning("activity_reminder.list_due_failed", extra={"error": str(exc)})
            return
        if not activities:
            return
        for row in activities:
            try:
                await self._process_activity(repo=repo, row=row)
            except Exception as exc:  # pragma: no cover - defensivo por fila
                logger.warning(
                    "activity_reminder.process_row_failed",
                    extra={"error": str(exc), "activity_id": row.get("id")},
                )

    async def _process_activity(self, *, repo: CRMRepository, row: dict[str, Any]) -> None:
        activity_id = _safe_uuid(row.get("id"))
        organizacion_id = _safe_uuid(row.get("organizacion_id"))
        if not activity_id or not organizacion_id:
            return

        usuario_id = _safe_uuid(row.get("asignado_a_usuario_id")) or _safe_uuid(row.get("creado_por_usuario_id"))
        if not usuario_id:
            return

        dedupe_key = f"activity.reminder_due:{activity_id}"
        existing = await repo.get_ui_notification_by_dedupe_key(
            usuario_id=usuario_id,
            organizacion_id=organizacion_id,
            dedupe_key=dedupe_key,
        )

        reminder_at = _parse_iso_datetime(row.get("recordatorio_en"))
        reminder_label = reminder_at.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M UTC") if reminder_at else None
        asunto = _clean_text(row.get("asunto")) or _clean_text(row.get("tipo")) or "Recordatorio"
        oportunidad_id = _safe_uuid(row.get("oportunidad_id"))
        contacto_id = _safe_uuid(row.get("contacto_id"))
        persona_id = _safe_uuid(row.get("persona_id"))
        cuenta_id = _safe_uuid(row.get("cuenta_id"))

        if existing:
            if not row.get("recordatorio_notificado_en"):
                try:
                    await repo.update_activity(
                        organizacion_id=organizacion_id,
                        activity_id=activity_id,
                        payload={
                            "recordatorio_notificado_en": existing.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        },
                    )
                except CRMRepositoryError as exc:
                    logger.warning(
                        "activity_reminder.mark_notified_failed",
                        extra={"activity_id": str(activity_id), "error": str(exc)},
                    )
            return

        message = (
            f"Tienes pendiente: {asunto}"
            + (f" para {reminder_label}." if reminder_label else ".")
        )
        notification = UserNotificationCreate(
            organizacion_id=organizacion_id,
            usuario_id=usuario_id,
            type="activity.reminder_due",
            level="warning",
            title="Recordatorio pendiente",
            message=message,
            category="actividades",
            entity_kind="actividad",
            entity_id=str(activity_id),
            actividad_id=activity_id,
            persona_id=persona_id,
            cuenta_id=cuenta_id,
            oportunidad_id=oportunidad_id,
            action=UserNotificationAction(
                label="Abrir registro",
                href=(
                    f"/embudo?oportunidadId={oportunidad_id}"
                    if oportunidad_id
                    else f"/personas/{persona_id}"
                    if persona_id
                    else f"/cuentas/{cuenta_id}"
                    if cuenta_id
                    else "/embudo"
                ),
            ),
            meta={
                "actividad_id": str(activity_id),
                "oportunidad_id": str(oportunidad_id) if oportunidad_id else None,
                "contacto_id": str(contacto_id) if contacto_id else None,
                "asunto": asunto,
                "tipo": _clean_text(row.get("tipo")),
                "recordatorio_en": row.get("recordatorio_en"),
            },
            dedupe_key=dedupe_key,
            group_key=f"activity.reminder_due:{usuario_id}",
        )
        try:
            created = await create_and_publish_user_notification(repo=repo, notification=notification)
        except CRMRepositoryError as exc:
            logger.warning(
                "activity_reminder.notification_failed",
                extra={"activity_id": str(activity_id), "error": str(exc)},
            )
            return

        try:
            await repo.update_activity(
                organizacion_id=organizacion_id,
                activity_id=activity_id,
                payload={
                    "recordatorio_notificado_en": created.get("created_at") or datetime.now(timezone.utc).isoformat(),
                },
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "activity_reminder.mark_notified_after_create_failed",
                extra={"activity_id": str(activity_id), "error": str(exc)},
            )


activity_reminder_jobs_runner = ActivityReminderJobsRunner()
