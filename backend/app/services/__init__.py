"""Servicios compartidos para integraciones externas."""

from .calendar import (
    CalendarEvent,
    CalendarEventResult,
    CalendarProviderError,
    CalendarService,
    build_event_from_cita,
    calendar_service,
    sync_cita_after_cancel,
    sync_cita_after_create,
    sync_cita_after_update,
)

__all__ = [
    "CalendarEvent",
    "CalendarEventResult",
    "CalendarProviderError",
    "CalendarService",
    "build_event_from_cita",
    "calendar_service",
    "sync_cita_after_cancel",
    "sync_cita_after_create",
    "sync_cita_after_update",
]
