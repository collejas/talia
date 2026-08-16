"""Worker IMAP para capturar respuestas de correo de prospección."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import email
from email import policy
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
import imaplib
import re
from datetime import datetime, timezone
from typing import Any, Sequence
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.brevo import process_brevo_inbound_emails
from app.services.tenant_runtime import (
    MASTER_ORGANIZACION_ID,
    get_mail_runtime_settings,
    list_tenant_mail_runtime_settings,
)

logger = get_logger("prospeccion.email_inbound_reader")

DEFAULT_POLL_INTERVAL_SECONDS = 20.0
DEFAULT_BATCH_SIZE = 250
DEFAULT_IMAP_FOLDERS: tuple[str, ...] = ("INBOX", "Spam", "Junk", "Junk E-mail")
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def _normalize_message_id(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    return cleaned.strip("<> ").strip() or None


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


@dataclass(slots=True)
class ImapFolderFetchResult:
    folder_name: str
    selected_name: str
    events: list[dict[str, Any]]
    last_seen_uid: int


def _quote_imap_folder(folder_name: str) -> str:
    escaped = folder_name.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _parse_imap_list_mailbox(raw_line: bytes) -> str | None:
    try:
        decoded = raw_line.decode("utf-8", errors="replace").strip()
    except Exception:
        return None
    if not decoded:
        return None
    match = re.search(r' "(?P<mailbox>[^"]+)"\s*$', decoded)
    if match:
        return match.group("mailbox").strip()
    if " " in decoded:
        return decoded.rsplit(" ", 1)[-1].strip().strip('"')
    return decoded.strip('"')


def _canonical_folder_lookup(conn: imaplib.IMAP4, folder_candidates: Sequence[str]) -> list[tuple[str, str]]:
    status, raw_boxes = conn.list()
    selectable: list[str] = []
    if status == "OK" and raw_boxes:
        for raw_box in raw_boxes:
            if isinstance(raw_box, bytes):
                mailbox_name = _parse_imap_list_mailbox(raw_box)
                if mailbox_name:
                    selectable.append(mailbox_name)
    resolved: list[tuple[str, str]] = []
    seen: set[str] = set()
    for candidate in folder_candidates:
        normalized_candidate = candidate.strip().lower()
        if not normalized_candidate:
            continue
        selected_name = candidate
        for mailbox_name in selectable:
            mailbox_normalized = mailbox_name.strip().lower()
            if mailbox_normalized == normalized_candidate or mailbox_normalized.endswith(
                f".{normalized_candidate}"
            ) or mailbox_normalized.endswith(f"/{normalized_candidate}"):
                selected_name = mailbox_name
                break
        dedupe_key = selected_name.strip().lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        resolved.append((candidate, selected_name))
    return resolved


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


def _extract_html_value(msg: Message) -> str | None:
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
    return html_value or None


def _extract_html_text(msg: Message) -> str | None:
    html_value = _extract_html_value(msg)
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
    body_html = _extract_html_value(parsed)
    if not body_text:
        body_text = "(correo entrante sin texto)"

    event: dict[str, Any] = {
        "from": sender_email,
        "subject": subject,
        "text": body_text,
        "body_html": body_html,
        "Message-Id": message_id,
        "In-Reply-To": in_reply_to,
        "References": references,
        "Date": received_at,
    }
    return {key: value for key, value in event.items() if value not in (None, "")}


def _imap_fetch_mailbox_events(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool,
    batch_size: int,
    folder_names: Sequence[str],
    last_seen_uid_by_folder: dict[str, int] | None = None,
) -> list[ImapFolderFetchResult]:
    if use_ssl:
        conn: imaplib.IMAP4 | imaplib.IMAP4_SSL = imaplib.IMAP4_SSL(host=host, port=port)
    else:
        conn = imaplib.IMAP4(host=host, port=port)

    folder_results: list[ImapFolderFetchResult] = []
    try:
        conn.login(username, password)
        folder_lookup = _canonical_folder_lookup(conn, folder_names)
        cursor_map = {
            str(folder_name or "").strip().lower(): max(0, int(cursor or 0))
            for folder_name, cursor in (last_seen_uid_by_folder or {}).items()
            if str(folder_name or "").strip()
        }
        for requested_name, selected_name in folder_lookup:
            status_select, _ = conn.select(_quote_imap_folder(selected_name))
            if status_select != "OK":
                continue
            folder_key = requested_name.strip().lower()
            last_seen_uid = cursor_map.get(folder_key, 0)
            if last_seen_uid > 0:
                search_criteria = f"UID {last_seen_uid + 1}:*"
                status_search, data = conn.uid("search", None, search_criteria)
            else:
                status_search, data = conn.uid("search", None, "ALL")
            if status_search != "OK" or not data:
                folder_results.append(
                    ImapFolderFetchResult(
                        folder_name=requested_name,
                        selected_name=selected_name,
                        events=[],
                        last_seen_uid=last_seen_uid,
                    )
                )
                continue
            uid_values = [int(value) for value in data[0].split() if value]
            if not uid_values:
                folder_results.append(
                    ImapFolderFetchResult(
                        folder_name=requested_name,
                        selected_name=selected_name,
                        events=[],
                        last_seen_uid=last_seen_uid,
                    )
                )
                continue
            candidate_uids = uid_values[-batch_size:]
            events: list[dict[str, Any]] = []
            for uid_value in candidate_uids:
                status_fetch, msg_data = conn.uid("fetch", str(uid_value), "(RFC822)")
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
                    inbound_event["__folder_name"] = requested_name
                    inbound_event["__folder_selected_name"] = selected_name
                    inbound_event["__message_uid"] = uid_value
                    events.append(inbound_event)
            folder_results.append(
                ImapFolderFetchResult(
                    folder_name=requested_name,
                    selected_name=selected_name,
                    events=events,
                    last_seen_uid=max(candidate_uids),
                )
            )
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            conn.logout()
        except Exception:
            pass
    return folder_results


def _imap_move_message_to_inbox(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool,
    source_folder: str,
    message_uid: int,
) -> bool:
    if message_uid <= 0:
        return False
    if use_ssl:
        conn: imaplib.IMAP4 | imaplib.IMAP4_SSL = imaplib.IMAP4_SSL(host=host, port=port)
    else:
        conn = imaplib.IMAP4(host=host, port=port)
    try:
        conn.login(username, password)
        status_select, _ = conn.select(_quote_imap_folder(source_folder))
        if status_select != "OK":
            return False
        status_copy, _ = conn.uid("COPY", str(message_uid), _quote_imap_folder("INBOX"))
        if status_copy != "OK":
            return False
        status_store, _ = conn.uid("STORE", str(message_uid), "+FLAGS", "(\\Deleted)")
        if status_store != "OK":
            return False
        conn.expunge()
        return True
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            conn.logout()
        except Exception:
            pass


async def _event_already_recorded(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    event: dict[str, Any],
) -> bool:
    message_id = _normalize_message_id(str(event.get("Message-Id") or ""))
    if not message_id:
        return False
    existing = await repo.get_inbox_message_by_provider_message_id(
        provider_message_id=message_id,
        organizacion_id=organizacion_id,
    )
    return existing is not None


def _extract_reply_message_ids(event: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    in_reply_to = _normalize_message_id(_clean_text(str(event.get("In-Reply-To") or "")))
    if in_reply_to:
        candidates.append(in_reply_to)
    references_raw = _clean_text(str(event.get("References") or ""))
    if references_raw:
        for token in references_raw.split():
            normalized = _normalize_message_id(token)
            if normalized and normalized not in candidates:
                candidates.append(normalized)
    return candidates


async def _resolve_known_reply_envio(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    event: dict[str, Any],
) -> dict[str, Any] | None:
    for message_id in _extract_reply_message_ids(event):
        envio = await repo.worker_get_envio_by_mensaje(
            mensaje_id=message_id,
            organizacion_id=organizacion_id,
        )
        if envio:
            return envio
    return None


async def _ensure_general_email_inbox_context(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    sender_email: str,
    sender_name: str | None,
) -> tuple[UUID, UUID] | None:
    normalized_email = sender_email.strip().lower()
    conversation = await repo.get_latest_unlinked_email_conversation(
        organizacion_id=organizacion_id,
        correo_remitente=normalized_email,
        canal="correo",
    )
    if not conversation:
        conversation = await repo.create_conversation(
            organizacion_id=organizacion_id,
            correo_remitente=normalized_email,
            nombre_remitente=sender_name or sender_email.split("@")[0],
            canal="correo",
            estado="abierta",
            inbox_context={
                "source": "correo_general",
                "sender_email": normalized_email,
                "sender_name": sender_name or sender_email.split("@")[0],
                "unlinked_email_inbox": True,
            },
        )
    conversation_id = conversation.get("id")
    try:
        conversation_uuid = UUID(str(conversation_id))
    except (TypeError, ValueError):
        return None
    return organizacion_id, conversation_uuid


async def _record_unmatched_inbox_email(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    event: dict[str, Any],
) -> bool:
    sender_raw = _clean_text(str(event.get("from") or "")) if event.get("from") else None
    sender_email = sender_raw.lower() if sender_raw else None
    if not sender_email or "@" not in sender_email:
        return False
    sender_name, _ = parseaddr(str(event.get("from") or ""))
    sender_name = _clean_text(sender_name)
    context = await _ensure_general_email_inbox_context(
        repo=repo,
        organizacion_id=organizacion_id,
        sender_email=sender_email,
        sender_name=sender_name,
    )
    if not context:
        return False
    org_uuid, conversation_uuid = context
    subject = _clean_text(str(event.get("subject") or ""))
    body = _clean_text(str(event.get("text") or "")) or "(correo entrante sin texto)"
    message_id = _normalize_message_id(_clean_text(str(event.get("Message-Id") or "")))
    in_reply_to = _normalize_message_id(_clean_text(str(event.get("In-Reply-To") or "")))
    references = _clean_text(str(event.get("References") or ""))
    received_at = _clean_text(str(event.get("Date") or ""))
    message_data: dict[str, Any] = {
        "channel": "correo",
        "source": "correo_general",
        "action": "inbound_email",
        "sender_email": sender_email,
        "sender_name": sender_name,
        "subject": subject,
        "message_id": message_id,
        "in_reply_to": in_reply_to,
        "references": references,
        "received_at": received_at,
        "body_html": event.get("body_html"),
    }
    message_data = {key: value for key, value in message_data.items() if value not in (None, "")}
    await repo.insert_inbox_message(
        conversation_id=conversation_uuid,
        direction="entrante",
        text=body,
        datos=message_data,
        estado="entregada",
        provider_message_id=message_id,
        organizacion_id=org_uuid,
        occurred_at=received_at,
    )
    return True


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
        self._folder_names = DEFAULT_IMAP_FOLDERS

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
        repo = CRMRepository()

        mailboxes = await self._list_mailboxes()
        if not mailboxes:
            log_event(logger, "prospeccion.email_inbound_reader_mailboxes_missing")
            return

        for organizacion_id, mail_settings in mailboxes:
            host = _clean_text(mail_settings.incoming_server)
            username = _clean_text(mail_settings.username)
            password = _clean_text(mail_settings.password)
            port = int(mail_settings.incoming_port_imap or 993)
            mailbox_scope = {
                "organizacion_id": str(organizacion_id),
                "host": bool(host),
                "username": bool(username),
                "password": bool(password),
            }
            if not host or not username or not password:
                log_event(
                    logger,
                    "prospeccion.email_inbound_reader_mail_config_missing",
                    **mailbox_scope,
                )
                continue

            try:
                folder_cursor_map = await self._get_folder_cursor_map(
                    repo=repo,
                    organizacion_id=organizacion_id,
                    mailbox_email=username,
                )
                folder_results = await asyncio.to_thread(
                    _imap_fetch_mailbox_events,
                    host=host,
                    port=port,
                    username=username,
                    password=password,
                    use_ssl=bool(mail_settings.use_ssl),
                    batch_size=self._batch_size,
                    folder_names=self._folder_names,
                    last_seen_uid_by_folder=folder_cursor_map,
                )
            except Exception as exc:  # pragma: no cover - depende del servidor IMAP
                logger.exception(
                    "prospeccion.email_inbound_reader_mailbox_failed",
                    extra={**mailbox_scope, "error": str(exc)},
                )
                continue

            if not folder_results:
                continue

            processed_total = 0
            fetched_total = 0
            for folder_result in folder_results:
                fetched_total += len(folder_result.events)
                last_completed_uid = folder_cursor_map.get(folder_result.folder_name.strip().lower(), 0)
                for event in folder_result.events:
                    try:
                        if await _event_already_recorded(
                            repo=repo,
                            organizacion_id=organizacion_id,
                            event=event,
                        ):
                            last_completed_uid = max(last_completed_uid, int(event.get("__message_uid") or 0))
                            continue
                        known_reply_envio = await _resolve_known_reply_envio(
                            repo=repo,
                            organizacion_id=organizacion_id,
                            event=event,
                        )
                        processed = await process_brevo_inbound_emails(
                            repo=repo,
                            events=[event],
                            organizacion_id=organizacion_id,
                        )
                        processed_total += int(processed or 0)
                        if not processed:
                            unmatched_saved = await _record_unmatched_inbox_email(
                                repo=repo,
                                organizacion_id=organizacion_id,
                                event=event,
                            )
                            if unmatched_saved:
                                processed_total += 1
                        if (
                            known_reply_envio
                            and folder_result.folder_name.strip().lower() != "inbox"
                            and int(event.get("__message_uid") or 0) > 0
                        ):
                            moved = await asyncio.to_thread(
                                _imap_move_message_to_inbox,
                                host=host,
                                port=port,
                                username=username,
                                password=password,
                                use_ssl=bool(mail_settings.use_ssl),
                                source_folder=folder_result.selected_name,
                                message_uid=int(event.get("__message_uid") or 0),
                            )
                            if moved:
                                log_event(
                                    logger,
                                    "prospeccion.email_inbound_reader_message_moved_to_inbox",
                                    organizacion_id=str(organizacion_id),
                                    folder_name=folder_result.folder_name,
                                    source_folder=folder_result.selected_name,
                                    message_uid=int(event.get("__message_uid") or 0),
                                )
                        last_completed_uid = max(last_completed_uid, int(event.get("__message_uid") or 0))
                    except CRMRepositoryError as exc:
                        log_event(
                            logger,
                            "prospeccion.email_inbound_reader_repo_error",
                            error=str(exc),
                            folder_name=folder_result.folder_name,
                            **mailbox_scope,
                        )
                        break
                    except Exception as exc:  # pragma: no cover
                        logger.exception(
                            "prospeccion.email_inbound_reader_event_failed",
                            extra={
                                **mailbox_scope,
                                "error": str(exc),
                                "from": event.get("from"),
                                "folder_name": folder_result.folder_name,
                            },
                        )
                        break
                await repo.upsert_email_inbound_sync_state(
                    organizacion_id=organizacion_id,
                    mailbox_email=username,
                    folder_name=folder_result.folder_name,
                    last_seen_uid=last_completed_uid,
                    last_sync_at=datetime.now(timezone.utc).isoformat(),
                    last_error=None,
                )
            log_event(
                logger,
                "prospeccion.email_inbound_reader_cycle",
                fetched=fetched_total,
                processed=processed_total,
                **mailbox_scope,
            )

    async def _get_folder_cursor_map(
        self,
        *,
        repo: CRMRepository,
        organizacion_id: UUID,
        mailbox_email: str,
    ) -> dict[str, int]:
        cursor_map: dict[str, int] = {}
        for folder_name in self._folder_names:
            row = await repo.get_email_inbound_sync_state(
                organizacion_id=organizacion_id,
                mailbox_email=mailbox_email,
                folder_name=folder_name,
            )
            if not isinstance(row, dict):
                continue
            try:
                cursor_map[folder_name.strip().lower()] = max(0, int(row.get("last_seen_uid") or 0))
            except (TypeError, ValueError):
                continue
        return cursor_map

    async def _list_mailboxes(self) -> list[tuple[UUID, Any]]:
        mailboxes: list[tuple[UUID, Any]] = []
        seen: set[tuple[str, str, int, bool]] = set()

        def _append_mailbox(*, organizacion_id: UUID, settings_payload: Any) -> None:
            host = _clean_text(getattr(settings_payload, "incoming_server", None))
            username = _clean_text(getattr(settings_payload, "username", None))
            port = int(getattr(settings_payload, "incoming_port_imap", None) or 993)
            use_ssl = bool(getattr(settings_payload, "use_ssl", False))
            if not host or not username:
                mailboxes.append((organizacion_id, settings_payload))
                return
            dedupe_key = (host.lower(), username.lower(), port, use_ssl)
            if dedupe_key in seen:
                return
            seen.add(dedupe_key)
            mailboxes.append((organizacion_id, settings_payload))

        master_settings = await get_mail_runtime_settings(organizacion_id=MASTER_ORGANIZACION_ID)
        _append_mailbox(
            organizacion_id=MASTER_ORGANIZACION_ID,
            settings_payload=master_settings,
        )

        for mailbox in await list_tenant_mail_runtime_settings():
            _append_mailbox(
                organizacion_id=mailbox.organizacion_id,
                settings_payload=mailbox.settings,
            )

        return mailboxes


email_inbound_reader = ProspeccionEmailInboundReader()


__all__: Sequence[str] = ("ProspeccionEmailInboundReader", "email_inbound_reader")
