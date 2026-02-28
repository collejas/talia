"""Worker IMAP para capturar respuestas de correo de prospección."""

from __future__ import annotations

import asyncio
import email
from email import policy
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
import imaplib
import re
from typing import Any, Sequence

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.brevo import process_brevo_inbound_emails
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID, get_mail_runtime_settings

logger = get_logger("prospeccion.email_inbound_reader")

DEFAULT_POLL_INTERVAL_SECONDS = 20.0
DEFAULT_BATCH_SIZE = 25
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def _decode_header_text(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(make_header(decode_header(value))).strip() or None
    except Exception:
        trimmed = value.strip()
        return trimmed or None


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _extract_plain_text(msg: Message) -> str | None:
    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition") or "").lower()
            if "attachment" in content_disposition:
                continue
            content_type = (part.get_content_type() or "").lower()
            if content_type != "text/plain":
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                payload = None
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                text = payload.decode(charset, errors="replace")
            except Exception:
                text = payload.decode("utf-8", errors="replace")
            cleaned = _clean_text(text)
            if cleaned:
                return cleaned
    else:
        content_type = (msg.get_content_type() or "").lower()
        if content_type == "text/plain":
            try:
                payload = msg.get_payload(decode=True)
            except Exception:
                payload = None
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    text = payload.decode(charset, errors="replace")
                except Exception:
                    text = payload.decode("utf-8", errors="replace")
                cleaned = _clean_text(text)
                if cleaned:
                    return cleaned
    return None


def _extract_html_text(msg: Message) -> str | None:
    html_value: str | None = None
    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition") or "").lower()
            if "attachment" in content_disposition:
                continue
            content_type = (part.get_content_type() or "").lower()
            if content_type != "text/html":
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                payload = None
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                html_value = payload.decode(charset, errors="replace")
            except Exception:
                html_value = payload.decode("utf-8", errors="replace")
            break
    else:
        if (msg.get_content_type() or "").lower() == "text/html":
            try:
                payload = msg.get_payload(decode=True)
            except Exception:
                payload = None
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    html_value = payload.decode(charset, errors="replace")
                except Exception:
                    html_value = payload.decode("utf-8", errors="replace")
    if not html_value:
        return None
    text = HTML_TAG_RE.sub(" ", html_value)
    normalized = WHITESPACE_RE.sub(" ", text).strip()
    return normalized or None


def _message_to_inbound_event(message_bytes: bytes) -> dict[str, Any] | None:
    parsed = email.message_from_bytes(message_bytes, policy=policy.default)
    if not isinstance(parsed, Message):
        return None

    from_header = str(parsed.get("From") or "")
    _, sender_email = parseaddr(from_header)
    sender_email = sender_email.strip().lower() if sender_email else ""
    if "@" not in sender_email:
        return None

    subject = _decode_header_text(str(parsed.get("Subject") or ""))
    message_id = _clean_text(str(parsed.get("Message-Id") or "")) or _clean_text(
        str(parsed.get("Message-ID") or "")
    )
    in_reply_to = _clean_text(str(parsed.get("In-Reply-To") or ""))
    references = _clean_text(str(parsed.get("References") or ""))
    date_header = _clean_text(str(parsed.get("Date") or ""))
    received_at: str | None = None
    if date_header:
        try:
            received_at = parsedate_to_datetime(date_header).isoformat()
        except Exception:
            received_at = date_header

    body_text = _extract_plain_text(parsed) or _extract_html_text(parsed)
    if not body_text:
        body_text = "(correo entrante sin texto)"

    event: dict[str, Any] = {
        "from": sender_email,
        "subject": subject,
        "text": body_text,
        "Message-Id": message_id,
        "In-Reply-To": in_reply_to,
        "References": references,
        "Date": received_at,
    }
    return {key: value for key, value in event.items() if value not in (None, "")}


def _imap_fetch_unseen_events(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool,
    batch_size: int,
) -> list[dict[str, Any]]:
    if use_ssl:
        conn: imaplib.IMAP4 | imaplib.IMAP4_SSL = imaplib.IMAP4_SSL(host=host, port=port)
    else:
        conn = imaplib.IMAP4(host=host, port=port)

    events: list[dict[str, Any]] = []
    try:
        conn.login(username, password)
        conn.select("INBOX")
        status, data = conn.search(None, "UNSEEN")
        if status != "OK" or not data:
            return events
        message_nums = data[0].split()[-batch_size:]
        for message_num in message_nums:
            status_fetch, msg_data = conn.fetch(message_num, "(RFC822)")
            if status_fetch != "OK" or not msg_data:
                continue
            raw_bytes: bytes | None = None
            for chunk in msg_data:
                if isinstance(chunk, tuple) and len(chunk) >= 2 and isinstance(chunk[1], (bytes, bytearray)):
                    raw_bytes = bytes(chunk[1])
                    break
            if not raw_bytes:
                continue
            inbound_event = _message_to_inbound_event(raw_bytes)
            if inbound_event:
                events.append(inbound_event)
            # Evita reprocesar el mismo correo en cada ciclo.
            conn.store(message_num, "+FLAGS", "\\Seen")
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            conn.logout()
        except Exception:
            pass
    return events


class ProspeccionEmailInboundReader:
    """Lector IMAP de correos entrantes para marcar respuestas en prospección."""

    def __init__(
        self,
        *,
        poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> None:
        self._poll_interval = poll_interval
        self._batch_size = max(1, batch_size)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._enabled = True

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            log_event(logger, "prospeccion.email_inbound_reader_disabled", reason="supabase_config_missing")
            return
        self._enabled = True
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="prospeccion-email-inbound-reader")
        log_event(logger, "prospeccion.email_inbound_reader_started")

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        try:
            await self._task
        finally:
            self._task = None
        log_event(logger, "prospeccion.email_inbound_reader_stopped")

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._process_once()
            except Exception as exc:  # pragma: no cover - defensivo en worker continuo
                logger.exception("prospeccion.email_inbound_reader_unhandled", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_interval)
            except asyncio.TimeoutError:
                continue

    async def _process_once(self) -> None:
        mail_settings = await get_mail_runtime_settings(organizacion_id=MASTER_ORGANIZACION_ID)
        host = _clean_text(mail_settings.incoming_server)
        username = _clean_text(mail_settings.username)
        password = _clean_text(mail_settings.password)
        port = int(mail_settings.incoming_port_imap or 993)
        if not host or not username or not password:
            log_event(
                logger,
                "prospeccion.email_inbound_reader_mail_config_missing",
                host=bool(host),
                username=bool(username),
                password=bool(password),
            )
            return

        events = await asyncio.to_thread(
            _imap_fetch_unseen_events,
            host=host,
            port=port,
            username=username,
            password=password,
            use_ssl=bool(mail_settings.use_ssl),
            batch_size=self._batch_size,
        )
        if not events:
            return

        repo = CRMRepository()
        processed_total = 0
        for event in events:
            try:
                processed = await process_brevo_inbound_emails(repo=repo, events=[event])
                processed_total += int(processed or 0)
            except CRMRepositoryError as exc:
                log_event(logger, "prospeccion.email_inbound_reader_repo_error", error=str(exc))
            except Exception as exc:  # pragma: no cover
                logger.exception(
                    "prospeccion.email_inbound_reader_event_failed",
                    extra={"error": str(exc), "from": event.get("from")},
                )
        log_event(
            logger,
            "prospeccion.email_inbound_reader_cycle",
            fetched=len(events),
            processed=processed_total,
        )


email_inbound_reader = ProspeccionEmailInboundReader()


__all__: Sequence[str] = ("ProspeccionEmailInboundReader", "email_inbound_reader")
