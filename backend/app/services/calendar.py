from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable, Protocol, runtime_checkable
from urllib.parse import urljoin

import httpx
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.logging import get_logger

from . import storage

logger = get_logger(__name__)

CALDAV_TIMEOUT_SECONDS = 10.0
CALDAV_SUCCESS_CODES = {200, 201, 204}
PRODID = "-//Tal-IA//CalendarService//ES"


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


def _escape_ics(value: str | None) -> str:
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _resolve_timezone(dt: datetime, tz_name: str | None) -> datetime:
    if dt.tzinfo is None:
        if tz_name:
            try:
                dt = dt.replace(tzinfo=ZoneInfo(tz_name))
            except Exception:  # pragma: no cover - fallback a UTC
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _format_ics_datetime(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            logger.warning("calendar.invalid_datetime", extra={"value": value})
            return None
    return None


def _normalize_metadata(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("calendar.metadata_invalid_json")
            return {}
        if isinstance(data, dict):
            return dict(data)
    return {}


def build_event_from_cita(cita: dict[str, Any]) -> CalendarEvent:
    """Convierte una cita de Supabase en un evento genérico para el proveedor."""

    metadata = _normalize_metadata(cita.get("metadata"))
    start = _coerce_datetime(cita.get("start_at"))
    if start is None:
        raise CalendarProviderError("La cita no contiene fecha de inicio válida.")

    end = _coerce_datetime(cita.get("end_at"))
    if end is None:
        duration = metadata.get("duration_minutes")
        if isinstance(duration, (int, float)) and duration > 0:
            end = start + timedelta(minutes=float(duration))
        else:
            end = start + timedelta(minutes=45)

    timezone = cita.get("timezone") or metadata.get("timezone")
    summary = (
        metadata.get("summary")
        or metadata.get("title")
        or metadata.get("titulo")
        or "Demostración Tal-IA"
    )
    description = cita.get("notes") or metadata.get("description") or metadata.get("notes")
    location = cita.get("location") or metadata.get("location")

    attendees: list[str] = []
    raw_attendees = metadata.get("attendees") if isinstance(metadata, dict) else None
    if isinstance(raw_attendees, list):
        for entry in raw_attendees:
            if isinstance(entry, str) and entry.strip():
                attendees.append(entry.strip())
            elif isinstance(entry, dict):
                email = entry.get("email")
                if isinstance(email, str) and email.strip():
                    attendees.append(email.strip())

    enriched_metadata = dict(metadata)
    enriched_metadata.setdefault("cita_id", cita.get("id"))
    enriched_metadata.setdefault("tarjeta_id", cita.get("tarjeta_id"))
    enriched_metadata.setdefault("provider_calendar_id", cita.get("provider_calendar_id"))
    if cita.get("meeting_url"):
        enriched_metadata.setdefault("meeting_url", cita.get("meeting_url"))
    if cita.get("external_join_url"):
        enriched_metadata.setdefault("join_url", cita.get("external_join_url"))

    return CalendarEvent(
        summary=summary,
        start=start,
        end=end,
        timezone=timezone,
        description=description,
        location=location,
        attendees=attendees,
        metadata=enriched_metadata,
    )


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
        uid = self._ensure_uid(event)
        resource_url, resource_name = self._build_event_url(
            event.metadata.get("provider_event_id"), uid
        )
        payload = self._build_ics_payload(uid, event)
        headers = {
            "Content-Type": "text/calendar; charset=utf-8",
            "If-None-Match": "*",
        }

        logger.info(
            "calendar.caldav.create_attempt",
            extra={
                "url": resource_url,
                "provider_event_id": event.metadata.get("provider_event_id"),
            },
        )
        response = await self._request("PUT", resource_url, content=payload, headers=headers)
        if response.status_code not in CALDAV_SUCCESS_CODES:
            raise CalendarProviderError(
                f"CalDAV create failed ({response.status_code}): {response.text}"
            )

        join_url = event.metadata.get("join_url") or event.metadata.get("meeting_url")
        raw_payload = {
            "status": response.status_code,
            "url": resource_url,
            "etag": response.headers.get("ETag"),
        }
        logger.info(
            "calendar.caldav.create_success",
            extra={
                "url": resource_url,
                "status": response.status_code,
                "etag": raw_payload["etag"],
            },
        )
        return CalendarEventResult(
            event_id=resource_name, join_url=join_url, raw_response=raw_payload
        )

    async def update_event(
        self,
        event_id: str,
        event: CalendarEvent,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> CalendarEventResult:
        if not event_id:
            raise CalendarProviderError("Event ID requerido para actualizar evento CalDAV")
        resource_hint = event_id.split("/")[-1]
        if resource_hint.endswith(".ics"):
            resource_hint = resource_hint[:-4]
        uid = self._ensure_uid(event, fallback=resource_hint)
        resource_url, resource_name = self._build_event_url(event_id, uid)
        payload = self._build_ics_payload(uid, event)
        headers: dict[str, str] = {
            "Content-Type": "text/calendar; charset=utf-8",
        }
        if metadata and isinstance(metadata, dict):
            etag = metadata.get("etag") or metadata.get("caldav_etag")
            if isinstance(etag, str) and etag:
                headers["If-Match"] = etag

        logger.info(
            "calendar.caldav.update_attempt",
            extra={"event_id": event_id, "url": resource_url, "etag": headers.get("If-Match")},
        )
        response = await self._request("PUT", resource_url, content=payload, headers=headers)
        if response.status_code not in CALDAV_SUCCESS_CODES:
            raise CalendarProviderError(
                f"CalDAV update failed ({response.status_code}): {response.text}"
            )

        join_url = event.metadata.get("join_url") or event.metadata.get("meeting_url")
        raw_payload = {
            "status": response.status_code,
            "url": resource_url,
            "etag": response.headers.get("ETag"),
        }
        logger.info(
            "calendar.caldav.update_success",
            extra={
                "event_id": event_id,
                "status": response.status_code,
                "etag": raw_payload["etag"],
            },
        )
        return CalendarEventResult(
            event_id=resource_name, join_url=join_url, raw_response=raw_payload
        )

    async def delete_event(self, event_id: str) -> None:
        if not event_id:
            raise CalendarProviderError("Event ID requerido para eliminar evento CalDAV")
        resource_url, _ = self._build_event_url(event_id, uid=uuid.uuid4().hex)
        logger.info(
            "calendar.caldav.delete_attempt",
            extra={"event_id": event_id, "url": resource_url},
        )
        response = await self._request("DELETE", resource_url)
        if response.status_code not in CALDAV_SUCCESS_CODES and response.status_code != 404:
            raise CalendarProviderError(
                f"CalDAV delete failed ({response.status_code}): {response.text}"
            )
        logger.info(
            "calendar.caldav.delete_success",
            extra={"event_id": event_id, "status": response.status_code},
        )

    def _calendar_base(self) -> str:
        calendar_url = (self._config.calendar_url or "").strip()
        if not calendar_url:
            raise CalendarProviderError("CalDAV calendar_url no está configurado")
        return calendar_url.rstrip("/") + "/"

    def _build_event_url(self, event_id: str | None, uid: str) -> tuple[str, str]:
        if event_id:
            event_id = event_id.strip()
            if event_id.startswith(("http://", "https://")):
                return event_id, event_id.rstrip("/").split("/")[-1]
            resource_name = event_id.lstrip("/")
            return urljoin(self._calendar_base(), resource_name), resource_name
        resource_name = f"{uid}.ics"
        return urljoin(self._calendar_base(), resource_name), resource_name

    @staticmethod
    def _ensure_uid(event: CalendarEvent, fallback: str | None = None) -> str:
        raw_uid = (
            event.metadata.get("caldav_uid")
            or event.metadata.get("uid")
            or event.metadata.get("provider_event_id")
        )
        if isinstance(raw_uid, str) and raw_uid.strip():
            uid = raw_uid.strip()
        elif fallback:
            uid = fallback.strip()
        else:
            uid = uuid.uuid4().hex
        event.metadata["caldav_uid"] = uid
        return uid

    def _build_ics_payload(self, uid: str, event: CalendarEvent) -> str:
        tz_name = event.timezone or event.metadata.get("timezone")
        start = _resolve_timezone(event.start, tz_name)
        end_reference = event.end or (event.start + timedelta(minutes=45))
        end = _resolve_timezone(end_reference, tz_name)
        now_utc = datetime.now(timezone.utc)

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            f"PRODID:{PRODID}",
            "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT",
            f"UID:{_escape_ics(uid)}",
            f"DTSTAMP:{_format_ics_datetime(now_utc)}",
            f"DTSTART:{_format_ics_datetime(start)}",
            f"DTEND:{_format_ics_datetime(end)}",
        ]

        summary = _escape_ics(event.summary)
        if summary:
            lines.append(f"SUMMARY:{summary}")

        description = _escape_ics(event.description)
        if description:
            lines.append(f"DESCRIPTION:{description}")

        location = _escape_ics(event.location)
        if location:
            lines.append(f"LOCATION:{location}")

        join_url = event.metadata.get("join_url") or event.metadata.get("meeting_url")
        if isinstance(join_url, str) and join_url.strip():
            lines.append(f"URL:{_escape_ics(join_url.strip())}")

        for attendee in event.attendees:
            attendee_value = attendee.strip()
            if not attendee_value:
                continue
            escaped = _escape_ics(attendee_value)
            lines.append(f"ATTENDEE;CN={escaped}:mailto:{escaped}")

        lines.append("END:VEVENT")
        lines.append("END:VCALENDAR")
        return "\r\n".join(lines) + "\r\n"

    async def _request(
        self,
        method: str,
        url: str,
        *,
        content: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        auth = httpx.BasicAuth(self._config.username, self._config.password)
        try:
            async with httpx.AsyncClient(auth=auth, timeout=CALDAV_TIMEOUT_SECONDS) as client:
                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    content=content.encode("utf-8") if isinstance(content, str) else content,
                )
        except httpx.RequestError as exc:  # pragma: no cover - falla de red
            raise CalendarProviderError(f"Error conectando a CalDAV: {exc}") from exc
        return response


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
        calendar_url = settings.calendar_full_calendar_url
        if not username or not password or not server_url or not calendar_url:
            raise CalendarProviderError("CalDAV configuration is incomplete")
        config = CalDAVConfig(
            username=username,
            password=password,
            server_url=server_url,
            calendar_url=calendar_url,
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


async def sync_cita_after_create(cita: dict[str, Any]) -> dict[str, Any]:
    """Crea evento externo tras registrar la cita en Supabase."""

    provider = str(cita.get("provider") or "hosting").lower()
    if provider == "hosting":
        return cita
    cita_id = cita.get("id")
    if not cita_id:
        return cita

    try:
        event = build_event_from_cita(cita)
    except CalendarProviderError as exc:
        logger.warning(
            "calendar.event_build_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita

    logger.info(
        "calendar.sync_create_start",
        extra={"cita_id": cita_id, "provider": provider},
    )
    try:
        result = await calendar_service.create_event(provider, event)
    except CalendarProviderError as exc:
        logger.warning(
            "calendar.create_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita

    logger.info(
        "calendar.sync_create_success",
        extra={
            "cita_id": cita_id,
            "provider": provider,
            "event_id": result.event_id,
            "join_url": result.join_url,
        },
    )
    update_payload: dict[str, Any] = {"p_id": cita_id}
    metadata_updates: dict[str, Any] = {}
    changed = False
    if result.event_id and result.event_id != cita.get("provider_event_id"):
        update_payload["p_provider_event_id"] = result.event_id
        changed = True
    if result.join_url and result.join_url != cita.get("external_join_url"):
        update_payload["p_external_join_url"] = result.join_url
        changed = True
    uid_value = event.metadata.get("caldav_uid")
    if isinstance(uid_value, str) and uid_value:
        metadata_updates["caldav_uid"] = uid_value
    etag_value = None
    if isinstance(result.raw_response, dict):
        etag_value = result.raw_response.get("etag")
    if isinstance(etag_value, str) and etag_value:
        metadata_updates["caldav_etag"] = etag_value
    if metadata_updates:
        update_payload["p_metadata"] = metadata_updates
        update_payload["p_merge_metadata"] = True
        changed = True

    if not changed:
        return cita

    try:
        updated = await storage.upsert_demo_cita(update_payload)
        return updated
    except storage.StorageError as exc:
        logger.warning(
            "calendar.sync_update_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita


async def sync_cita_after_update(
    cita: dict[str, Any],
    *,
    provider_hint: str | None = None,
) -> dict[str, Any]:
    """Actualiza o crea el evento externo tras modificar la cita."""

    provider = provider_hint or cita.get("provider") or "hosting"
    provider = str(provider).strip().lower()
    if provider == "hosting":
        return cita
    cita_id = cita.get("id")
    if not cita_id:
        return cita

    try:
        event = build_event_from_cita(cita)
    except CalendarProviderError as exc:
        logger.warning(
            "calendar.event_build_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita

    raw_event_id = cita.get("provider_event_id")
    event_id = str(raw_event_id).strip() if raw_event_id else ""

    try:
        if event_id:
            logger.info(
                "calendar.sync_update_start",
                extra={"cita_id": cita_id, "provider": provider, "event_id": event_id},
            )
            result = await calendar_service.update_event(
                provider, event_id, event, metadata=event.metadata
            )
        else:
            logger.info(
                "calendar.sync_update_fallback_create",
                extra={"cita_id": cita_id, "provider": provider},
            )
            result = await calendar_service.create_event(provider, event)
            event_id = result.event_id
    except CalendarProviderError as exc:
        logger.warning(
            "calendar.update_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita

    logger.info(
        "calendar.sync_update_success",
        extra={
            "cita_id": cita_id,
            "provider": provider,
            "event_id": event_id,
            "join_url": result.join_url,
        },
    )
    update_payload: dict[str, Any] = {"p_id": cita_id}
    metadata_updates: dict[str, Any] = {}
    changed = False
    if event_id and event_id != cita.get("provider_event_id"):
        update_payload["p_provider_event_id"] = event_id
        changed = True
    if result.join_url and result.join_url != cita.get("external_join_url"):
        update_payload["p_external_join_url"] = result.join_url
        changed = True
    uid_value = event.metadata.get("caldav_uid")
    if isinstance(uid_value, str) and uid_value:
        metadata_updates["caldav_uid"] = uid_value
    if isinstance(result.raw_response, dict):
        etag_value = result.raw_response.get("etag")
        if isinstance(etag_value, str) and etag_value:
            metadata_updates["caldav_etag"] = etag_value
    if metadata_updates:
        update_payload["p_metadata"] = metadata_updates
        update_payload["p_merge_metadata"] = True
        changed = True

    if not changed:
        return cita

    try:
        updated = await storage.upsert_demo_cita(update_payload)
        return updated
    except storage.StorageError as exc:
        logger.warning(
            "calendar.sync_update_failed",
            extra={"provider": provider, "error": str(exc), "cita_id": cita_id},
        )
        return cita


async def sync_cita_after_cancel(
    *,
    previous: dict[str, Any] | None,
    updated: dict[str, Any],
    remove_event: bool,
) -> None:
    """Elimina el evento externo cuando la cita se cancela."""

    if not remove_event:
        return

    base = previous or updated
    provider = str(base.get("provider") or "hosting").lower()
    if provider == "hosting":
        return

    raw_event_id = base.get("provider_event_id") or updated.get("provider_event_id")
    event_id = str(raw_event_id).strip() if raw_event_id else ""
    if not event_id:
        return

    try:
        await calendar_service.delete_event(provider, event_id)
    except CalendarProviderError as exc:
        logger.warning(
            "calendar.delete_failed",
            extra={"provider": provider, "event_id": event_id, "error": str(exc)},
        )
        return
    logger.info(
        "calendar.sync_delete_success",
        extra={"provider": provider, "event_id": event_id},
    )


_BUSY_STATES = {"pendiente", "confirmada", "reprogramada"}
_DAY_NAMES_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
_DURATION_KEYS = ("duration_minutes", "duracion_minutes", "duracion_min", "duracion")


def _parse_work_days(raw: str | None) -> set[int]:
    if not raw:
        return {0, 1, 2, 3, 4}
    entries = {part.strip() for part in raw.split(",") if part.strip()}
    result: set[int] = set()
    for entry in entries:
        try:
            value = int(entry)
        except ValueError:
            continue
        if 0 <= value <= 6:
            result.add(value)
    return result or {0, 1, 2, 3, 4}


def _parse_work_hours(raw: str | None) -> list[tuple[time, time]]:
    if not raw:
        return [(time(hour=9), time(hour=18))]
    ranges: list[tuple[time, time]] = []
    for part in raw.split(","):
        chunk = part.strip()
        if not chunk or "-" not in chunk:
            continue
        start_text, end_text = chunk.split("-", 1)
        try:
            start_time = time.fromisoformat(start_text.strip())
            end_time = time.fromisoformat(end_text.strip())
        except ValueError:
            continue
        if start_time >= end_time:
            continue
        ranges.append((start_time, end_time))
    if not ranges:
        return [(time(hour=9), time(hour=18))]
    return sorted(ranges, key=lambda item: item[0])


def _parse_holidays(raw: str | None) -> set[date]:
    if not raw:
        return set()
    result: set[date] = set()
    for part in raw.split(","):
        chunk = part.strip()
        if not chunk:
            continue
        try:
            result.add(date.fromisoformat(chunk))
        except ValueError:
            continue
    return result


def _merge_intervals(
    intervals: Iterable[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    ordered = sorted(
        [(start, end) for start, end in intervals if start < end],
        key=lambda item: item[0],
    )
    if not ordered:
        return []
    merged: list[tuple[datetime, datetime]] = []
    current_start, current_end = ordered[0]
    for start, end in ordered[1:]:
        if start <= current_end:
            if end > current_end:
                current_end = end
            continue
        merged.append((current_start, current_end))
        current_start, current_end = start, end
    merged.append((current_start, current_end))
    return merged


def _extract_duration_minutes(metadata: dict[str, Any], fallback: int) -> int:
    for key in _DURATION_KEYS:
        value = metadata.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
        if isinstance(value, str) and value.strip():
            try:
                parsed = float(value)
            except ValueError:
                continue
            if parsed > 0:
                return int(parsed)
    return fallback


def _extract_event_interval(
    row: dict[str, Any],
    tz_target: ZoneInfo,
    default_duration: timedelta,
) -> tuple[datetime, datetime] | None:
    start = _coerce_datetime(row.get("start_at"))
    if start is None:
        return None
    tz_name = row.get("timezone") or tz_target.key
    try:
        event_tz = ZoneInfo(tz_name)
    except Exception:
        event_tz = tz_target
    if start.tzinfo is None:
        start = start.replace(tzinfo=event_tz)
    else:
        start = start.astimezone(event_tz)

    end = _coerce_datetime(row.get("end_at"))
    metadata = _normalize_metadata(row.get("metadata"))
    if end is None:
        duration_minutes = _extract_duration_minutes(
            metadata, int(default_duration.total_seconds() // 60) or 45
        )
        end = start + timedelta(minutes=duration_minutes)
    else:
        if end.tzinfo is None:
            end = end.replace(tzinfo=event_tz)
        else:
            end = end.astimezone(event_tz)

    start_local = start.astimezone(tz_target)
    end_local = end.astimezone(tz_target)
    if end_local <= start_local:
        end_local = start_local + default_duration
    return start_local, end_local


def _round_up_to_minute(value: datetime) -> datetime:
    if value.microsecond or value.second:
        value = value.replace(second=0, microsecond=0) + timedelta(minutes=1)
    return value.replace(second=0, microsecond=0)


async def compute_demo_availability(
    *,
    conversation_id: str,
    timezone_name: str | None = None,
    earliest_start: datetime | None = None,
    preferred_start: datetime | None = None,
    days: int | None = None,
    max_slots: int | None = None,
    slot_minutes: int | None = None,
) -> dict[str, Any]:
    tz_candidate = (timezone_name or settings.demo_availability_timezone or "").strip()
    tz_name = tz_candidate or "America/Mexico_City"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        logger.warning(
            "calendar.availability.invalid_timezone",
            extra={"conversation_id": conversation_id, "timezone": timezone_name},
        )
        tz = ZoneInfo("America/Mexico_City")
        tz_name = "America/Mexico_City"

    now_local = datetime.now(tz)
    lead_delta = timedelta(minutes=max(settings.demo_availability_lead_minutes, 0))
    base_start = now_local + lead_delta

    if earliest_start:
        earliest_local = earliest_start.astimezone(tz)
        if earliest_local > base_start:
            base_start = earliest_local
    preferred_local = preferred_start.astimezone(tz) if preferred_start else None

    base_start = base_start.replace(second=0, microsecond=0)
    if preferred_local:
        preferred_local = preferred_local.replace(second=0, microsecond=0)

    lookahead_days = days if isinstance(days, int) else None
    if lookahead_days is None:
        lookahead_days = settings.demo_availability_lookahead_days
    lookahead_days = max(1, min(lookahead_days, 60))

    slots_limit = max_slots if isinstance(max_slots, int) else None
    if slots_limit is None:
        slots_limit = settings.demo_availability_max_slots
    slots_limit = max(1, min(slots_limit, 12))

    slot_length_minutes = slot_minutes if isinstance(slot_minutes, int) else None
    if slot_length_minutes is None or slot_length_minutes <= 0:
        slot_length_minutes = settings.demo_availability_slot_minutes or 45
    slot_duration = timedelta(minutes=slot_length_minutes)
    default_duration = slot_duration
    buffer_delta = timedelta(minutes=max(settings.demo_availability_buffer_minutes, 0))

    work_days = _parse_work_days(settings.demo_availability_work_days)
    work_hours = _parse_work_hours(settings.demo_availability_work_hours)
    holidays = _parse_holidays(settings.demo_availability_holidays)

    fetch_start = base_start - buffer_delta
    fetch_end = base_start + timedelta(days=lookahead_days + 1)

    try:
        busy_rows = await storage.fetch_demo_citas_range(
            start_at=fetch_start.astimezone(timezone.utc),
            end_at=fetch_end.astimezone(timezone.utc),
            estados=_BUSY_STATES,
            limit=600,
        )
    except storage.StorageError as exc:
        logger.warning(
            "calendar.availability.fetch_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        busy_rows = []

    busy_by_day: dict[date, list[tuple[datetime, datetime]]] = {}
    for row in busy_rows:
        estado = str(row.get("estado") or "").strip().lower()
        if estado not in _BUSY_STATES:
            continue
        interval = _extract_event_interval(row, tz, default_duration)
        if not interval:
            continue
        interval_start, interval_end = interval
        day_cursor = interval_start
        while day_cursor.date() <= interval_end.date():
            day_date = day_cursor.date()
            day_start = datetime.combine(day_date, time(0, 0), tzinfo=tz)
            day_end = day_start + timedelta(days=1)
            overlap_start = max(interval_start, day_start)
            overlap_end = min(interval_end, day_end)
            if overlap_start < overlap_end:
                busy_by_day.setdefault(day_date, []).append((overlap_start, overlap_end))
            day_cursor = day_end

    candidates: list[tuple[int, int, date]] = []
    for idx in range(lookahead_days):
        candidate_date = (base_start + timedelta(days=idx)).date()
        priority = idx
        if preferred_local:
            priority = abs((candidate_date - preferred_local.date()).days)
        candidates.append((priority, idx, candidate_date))
    candidates.sort()

    slots: list[dict[str, Any]] = []
    seen_starts: set[str] = set()

    def _append_slot(start_dt: datetime) -> None:
        nonlocal slots, seen_starts
        start_dt = start_dt.replace(second=0, microsecond=0)
        end_dt = start_dt + slot_duration
        if end_dt <= start_dt:
            return
        start_iso = start_dt.isoformat()
        if start_iso in seen_starts:
            return
        seen_starts.add(start_iso)
        weekday_idx = start_dt.weekday()
        label_day = (
            _DAY_NAMES_ES[weekday_idx]
            if 0 <= weekday_idx < len(_DAY_NAMES_ES)
            else start_dt.strftime("%A")
        )
        label = f"{label_day} {start_dt.day:02d}/{start_dt.month:02d} · {start_dt.strftime('%H:%M')} {tz_name}"
        slots.append(
            {
                "start_at": start_iso,
                "end_at": end_dt.isoformat(),
                "timezone": tz_name,
                "weekday": start_dt.isoweekday(),
                "label": label,
                "local_date": start_dt.date().isoformat(),
                "local_time": start_dt.strftime("%H:%M"),
            }
        )

    for _, order_idx, day_date in candidates:
        if len(slots) >= slots_limit:
            break
        if day_date.weekday() not in work_days:
            continue
        if day_date in holidays:
            continue
        day_busy = busy_by_day.get(day_date, [])
        merged_busy = _merge_intervals(day_busy)
        for start_time, end_time in work_hours:
            block_start = datetime.combine(day_date, start_time, tzinfo=tz)
            block_end = datetime.combine(day_date, end_time, tzinfo=tz)
            if block_end <= base_start:
                continue
            cursor = max(block_start, base_start)
            segments: list[tuple[datetime, datetime]] = []
            for busy_start, busy_end in merged_busy:
                expanded_start = busy_start - buffer_delta
                expanded_end = busy_end + buffer_delta
                if expanded_end <= block_start or expanded_start >= block_end:
                    continue
                segments.append(
                    (
                        max(block_start, expanded_start),
                        min(block_end, expanded_end),
                    )
                )
            blocked = _merge_intervals(segments)

            pointer = cursor
            for busy_start, busy_end in blocked:
                if pointer < busy_start:
                    segment_end = busy_start
                    candidate_start = _round_up_to_minute(pointer)
                    while (
                        candidate_start + slot_duration <= segment_end and len(slots) < slots_limit
                    ):
                        _append_slot(candidate_start)
                        candidate_start += slot_duration
                    pointer = segment_end
                pointer = max(pointer, busy_end)
                if pointer >= block_end or len(slots) >= slots_limit:
                    break

            if len(slots) >= slots_limit:
                break

            if pointer < block_end:
                segment_end = block_end
                candidate_start = _round_up_to_minute(pointer)
                while candidate_start + slot_duration <= segment_end and len(slots) < slots_limit:
                    _append_slot(candidate_start)
                    candidate_start += slot_duration

            if len(slots) >= slots_limit:
                break

    slots.sort(key=lambda item: item["start_at"])

    window_end = (base_start + timedelta(days=lookahead_days)).replace(second=0, microsecond=0)
    return {
        "status": "ok",
        "conversation_id": conversation_id,
        "timezone": tz_name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_start": base_start.isoformat(),
        "window_end": window_end.isoformat(),
        "slot_duration_minutes": slot_length_minutes,
        "slots": slots[:slots_limit],
    }
