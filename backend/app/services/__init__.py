"""Servicios compartidos para integraciones externas."""

from .calendar import (
    CalendarEvent,
    CalendarEventResult,
    CalendarProviderError,
    CalendarService,
    calendar_service,
)

__all__ = [
    "CalendarEvent",
    "CalendarEventResult",
    "CalendarProviderError",
    "CalendarService",
    "calendar_service",
]
