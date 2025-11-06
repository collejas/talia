from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class CalendarEvent:
    """Payload base para crear/actualizar eventos en calendarios externos."""

    summary: str
    start: datetime
    end: datetime | None = None
    timezone: str | None = None
    description: str | None = None
    location: str | None = None
    attendees: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CalendarEventResult:
    """Respuesta simplificada al interactuar con un proveedor de calendario."""

    event_id: str
    join_url: str | None = None
    raw_response: dict[str, Any] | None = None


class CalendarProviderError(RuntimeError):
    """Errores específicos al interactuar con proveedores externos."""


@runtime_checkable
class CalendarProvider(Protocol):
    """Contrato mínimo para integrar proveedores de calendario."""

    name: str

    async def create_event(self, event: CalendarEvent) -> CalendarEventResult: ...

    async def update_event(
        self,
        event_id: str,
        event: CalendarEvent,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> CalendarEventResult: ...

    async def delete_event(self, event_id: str) -> None: ...


@dataclass(slots=True)
class CalDAVConfig:
    """Configuración necesaria para operar contra un servidor CalDAV/CardDAV."""

    username: str
    password: str
    server_url: str
    calendar_url: str | None = None
    contacts_url: str | None = None
    principal_url: str | None = None


class CalDAVProvider:
    """Proveedor basado en CalDAV/CardDAV (servidor propio)."""

    name = "caldav"

    def __init__(self, config: CalDAVConfig) -> None:
        self._config = config

    async def create_event(self, event: CalendarEvent) -> CalendarEventResult:
        raise CalendarProviderError("CalDAV provider is not implemented yet")

    async def update_event(
        self,
        event_id: str,
        event: CalendarEvent,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> CalendarEventResult:
        raise CalendarProviderError("CalDAV provider is not implemented yet")

    async def delete_event(self, event_id: str) -> None:
        raise CalendarProviderError("CalDAV provider is not implemented yet")


class GoogleCalendarProvider:
    """Proveedor para Google Calendar (API v3)."""

    name = "google"

    async def create_event(self, event: CalendarEvent) -> CalendarEventResult:
        raise CalendarProviderError("Google Calendar provider is not implemented yet")

    async def update_event(
        self,
        event_id: str,
        event: CalendarEvent,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> CalendarEventResult:
        raise CalendarProviderError("Google Calendar provider is not implemented yet")

    async def delete_event(self, event_id: str) -> None:
        raise CalendarProviderError("Google Calendar provider is not implemented yet")


class CalendarService:
    """Orquestador que selecciona el proveedor adecuado para sincronizar citas."""

    def __init__(self) -> None:
        self._providers: dict[str, CalendarProvider] = {}

    def _build_caldav_provider(self) -> CalDAVProvider:
        username = settings.calendar_username
        password = settings.calendar_password
        server_url = settings.calendar_server_url
        if not username or not password or not server_url:
            raise CalendarProviderError("CalDAV configuration is incomplete")
        config = CalDAVConfig(
            username=username,
            password=password,
            server_url=server_url,
            calendar_url=settings.calendar_full_calendar_url,
            contacts_url=settings.calendar_full_contact_list_url,
            principal_url=settings.calendar_server_url_alternate,
        )
        return CalDAVProvider(config=config)

    def _get_or_create_provider(self, provider: str) -> CalendarProvider:
        normalized = provider.strip().lower()
        if normalized not in self._providers:
            if normalized == "google":
                self._providers[normalized] = GoogleCalendarProvider()
            elif normalized == "caldav":
                self._providers[normalized] = self._build_caldav_provider()
            else:
                raise CalendarProviderError(f"Proveedor de calendario desconocido: {provider!r}")
        return self._providers[normalized]

    def ensure_provider(self, provider: str) -> bool:
        """Valida que exista un proveedor configurado y listo para usarse."""
        try:
            self._get_or_create_provider(provider)
            return True
        except CalendarProviderError as exc:
            logger.warning(
                "calendar.provider_unavailable", extra={"provider": provider, "error": str(exc)}
            )
            return False

    async def create_event(self, provider: str, event: CalendarEvent) -> CalendarEventResult:
        """Crea un evento usando el proveedor solicitado."""
        backend = self._get_or_create_provider(provider)
        return await backend.create_event(event)

    async def update_event(
        self,
        provider: str,
        event_id: str,
        event: CalendarEvent,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> CalendarEventResult:
        backend = self._get_or_create_provider(provider)
        return await backend.update_event(event_id, event, metadata=metadata)

    async def delete_event(self, provider: str, event_id: str) -> None:
        backend = self._get_or_create_provider(provider)
        await backend.delete_event(event_id)


calendar_service = CalendarService()
