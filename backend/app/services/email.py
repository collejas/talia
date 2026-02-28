"""Utilidades para enviar correos electrónicos mediante SMTP o Brevo API."""

from __future__ import annotations

import base64
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Iterable, Sequence

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.services.tenant_runtime import BrevoRuntimeSettings, MailRuntimeSettings

logger = get_logger("app.services.email")


class EmailSendError(RuntimeError):
    """Errores relacionados con el envío de correo."""


def _normalize_recipients(recipients: Iterable[str]) -> list[str]:
    result: list[str] = []
    for value in recipients:
        if not value:
            continue
        trimmed = value.strip()
        if not trimmed or trimmed.lower() == "none":
            continue
        result.append(trimmed)
    return list(dict.fromkeys(result))


def _resolve_mail_settings(mail_settings: MailRuntimeSettings | None) -> MailRuntimeSettings:
    return mail_settings or MailRuntimeSettings.from_settings()


def _resolve_brevo_settings(brevo_settings: BrevoRuntimeSettings | None) -> BrevoRuntimeSettings:
    if brevo_settings:
        normalized_base = brevo_settings.base_url.strip() if brevo_settings.base_url else ""
        if normalized_base:
            normalized_base = normalized_base.rstrip("/")
        return BrevoRuntimeSettings(
            api_key=brevo_settings.api_key,
            base_url=normalized_base or brevo_settings.base_url,
        )
    base_url_candidate = (settings.brevo_base_url or "https://api.brevo.com/v3").strip()
    if base_url_candidate:
        base_url_candidate = base_url_candidate.rstrip("/")
    return BrevoRuntimeSettings(
        api_key=settings.brevo_api_key,
        base_url=base_url_candidate or settings.brevo_base_url or "https://api.brevo.com/v3",
    )


def send_email(
    *,
    subject: str,
    body_text: str,
    recipients: Sequence[str],
    body_html: str | None = None,
    attachments: Sequence[dict[str, object]] | None = None,
    headers: dict[str, str] | None = None,
    mail_settings: MailRuntimeSettings | None = None,
    brevo_settings: BrevoRuntimeSettings | None = None,
) -> str:
    """Envía un correo y devuelve el Message-ID utilizado."""

    to_recipients = _normalize_recipients(recipients)
    if not to_recipients:
        raise EmailSendError("No se proporcionaron destinatarios válidos.")

    mail_config = _resolve_mail_settings(mail_settings)
    brevo_settings_resolved = _resolve_brevo_settings(brevo_settings)

    message_id = make_msgid()
    if brevo_settings_resolved.api_key:
        result = _send_email_brevo(
            message_id=message_id,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            recipients=to_recipients,
            attachments=attachments or (),
            headers=headers or {},
            mail_settings=mail_config,
            brevo_settings=brevo_settings_resolved,
        )
    else:
        result = _send_email_smtp(
            message_id=message_id,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            recipients=to_recipients,
            attachments=attachments or (),
            headers=headers or {},
            mail_settings=mail_config,
        )

    logger.info(
        "email.sent",
        extra={
            "subject": subject,
            "recipients": to_recipients,
        },
    )
    return result


def _prepare_attachment_content(attachment: dict[str, object]) -> bytes:
    content = attachment.get("content")
    if isinstance(content, (bytes, bytearray)):
        return bytes(content)
    raise EmailSendError("Los adjuntos deben proporcionarse como bytes.")


def _send_email_smtp(
    *,
    message_id: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    recipients: Sequence[str],
    attachments: Sequence[dict[str, object]],
    headers: dict[str, str],
    mail_settings: MailRuntimeSettings,
) -> str:
    smtp_host = (mail_settings.outgoing_server or "").strip()
    smtp_port = mail_settings.outgoing_port_smtp or 587
    username = (mail_settings.username or "").strip()
    password = mail_settings.password

    if not smtp_host or not username or not password:
        raise EmailSendError("Configuración SMTP incompleta (host/usuario/contraseña).")

    message = EmailMessage()
    message["Subject"] = subject
    display_name = (mail_settings.from_name or "").strip()
    if display_name:
        message["From"] = formataddr((display_name, username))
    else:
        message["From"] = username
    message["To"] = ", ".join(recipients)
    message["Message-ID"] = message_id
    for header_name, header_value in (headers or {}).items():
        header_key = str(header_name or "").strip()
        header_content = str(header_value or "").strip()
        if not header_key or not header_content:
            continue
        if header_key in message:
            del message[header_key]
        message[header_key] = header_content
    message.set_content(body_text)
    if body_html:
        message.add_alternative(body_html, subtype="html")

    for attachment in attachments or ():
        content = _prepare_attachment_content(attachment)
        maintype = str(attachment.get("maintype") or "application")
        subtype = str(attachment.get("subtype") or "octet-stream")
        filename = attachment.get("filename")

        message.add_attachment(
            content,
            maintype=maintype,
            subtype=subtype,
            filename=str(filename) if filename else None,
        )
        part = message.get_payload()[-1]
        headers = attachment.get("headers")
        if isinstance(headers, dict):
            for header, value in headers.items():
                header_name = str(header)
                if header_name in part:
                    del part[header_name]
                part[header_name] = str(value)

    context = ssl.create_default_context()
    use_ssl = mail_settings.use_ssl
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
                server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                if mail_settings.use_tls:
                    server.starttls(context=context)
                server.login(username, password)
                server.send_message(message)
    except Exception as exc:  # pragma: no cover - errores de red reales
        logger.error("email.send_failed", extra={"error": str(exc)})
        raise EmailSendError(str(exc)) from exc

    return message_id.strip("<>")


def _send_email_brevo(
    *,
    message_id: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    recipients: Sequence[str],
    attachments: Sequence[dict[str, object]],
    headers: dict[str, str],
    mail_settings: MailRuntimeSettings,
    brevo_settings: BrevoRuntimeSettings,
) -> str:
    api_key = (brevo_settings.api_key or "").strip()
    base_url = (brevo_settings.base_url or "https://api.brevo.com/v3").strip().rstrip("/")
    sender_email = (mail_settings.username or "").strip()
    if not api_key:
        raise EmailSendError("Configuración Brevo incompleta: falta API Key.")
    if not sender_email:
        raise EmailSendError("Configuración Brevo incompleta: falta MAIL_USERNAME como remitente.")

    sender_name = (mail_settings.from_name or "").strip() or sender_email
    endpoint = f"{base_url}/smtp/email"
    brevo_headers: dict[str, str] = {"Message-ID": message_id}
    for header_name, header_value in (headers or {}).items():
        header_key = str(header_name or "").strip()
        header_content = str(header_value or "").strip()
        if not header_key or not header_content:
            continue
        brevo_headers[header_key] = header_content
    payload: dict[str, object] = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": email} for email in recipients],
        "subject": subject,
        "textContent": body_text or "",
        "headers": brevo_headers,
    }
    if body_html:
        payload["htmlContent"] = body_html

    attachments_payload = []
    for attachment in attachments:
        content = _prepare_attachment_content(attachment)
        filename = str(attachment.get("filename") or "adjunto")
        encoded_content = base64.b64encode(content).decode("ascii")
        headers_map = attachment.get("headers")
        content_id: str | None = None
        if isinstance(headers_map, dict):
            raw_content_id = headers_map.get("Content-ID") or headers_map.get("Content-Id")
            if raw_content_id is not None:
                content_id = str(raw_content_id).strip().strip("<>")
        if content_id:
            attachments_payload.append(
                {
                    "name": filename,
                    "content": encoded_content,
                    "contentId": content_id,
                }
            )
        else:
            attachments_payload.append(
                {
                    "name": filename,
                    "content": encoded_content,
                }
            )
    if attachments_payload:
        payload["attachment"] = attachments_payload

    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(endpoint, json=payload, headers=headers)
    except httpx.RequestError as exc:  # pragma: no cover - depende de red
        logger.error("email.brevo_request_error", extra={"error": str(exc)})
        raise EmailSendError("No se pudo contactar Brevo.") from exc

    if response.status_code >= 400:
        detail = response.text[:200]
        logger.error(
            "email.brevo_response_error",
            extra={"status": response.status_code, "detail": detail},
        )
        raise EmailSendError(f"Brevo respondió {response.status_code}")

    message_id_value: str | None = None
    try:
        data = response.json()
    except ValueError:
        data = {}

    message_id_value = data.get("messageId") or data.get("messageIds")
    if isinstance(message_id_value, list) and message_id_value:
        message_id_value = message_id_value[0]
    if not message_id_value:
        message_id_value = response.headers.get("message-id") or message_id
    return str(message_id_value).strip("<>")


__all__ = ["EmailSendError", "send_email"]
