"""Utilidades para enviar correos electrónicos mediante SMTP."""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Iterable, Sequence

from app.core.config import settings
from app.core.logging import get_logger

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


def send_email(
    *,
    subject: str,
    body_text: str,
    recipients: Sequence[str],
    body_html: str | None = None,
    attachments: Sequence[dict[str, object]] | None = None,
) -> str:
    """Envía un correo usando la configuración SMTP declarada en settings.

    Devuelve el Message-ID generado. Lanza EmailSendError si el envío falla.
    """

    smtp_host = (settings.mail_outgoing_server or "").strip()
    smtp_port = settings.mail_outgoing_port_smtp or 587
    username = (settings.mail_username or "").strip()
    password = settings.mail_password

    if not smtp_host or not username or not password:
        raise EmailSendError("Configuración SMTP incompleta (host/usuario/contraseña).")

    to_recipients = _normalize_recipients(recipients)
    if not to_recipients:
        raise EmailSendError("No se proporcionaron destinatarios válidos.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = username
    message["To"] = ", ".join(to_recipients)
    msg_id = make_msgid()
    message["Message-ID"] = msg_id
    message.set_content(body_text)
    if body_html:
        message.add_alternative(body_html, subtype="html")

    for attachment in attachments or ():
        content = attachment.get("content")
        if not isinstance(content, (bytes, bytearray)):
            raise EmailSendError("Los adjuntos deben proporcionarse como bytes.")
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
    use_ssl = bool(getattr(settings, "mail_use_ssl", False))
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
                server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                if settings.mail_use_tls:
                    server.starttls(context=context)
                server.login(username, password)
                server.send_message(message)
    except Exception as exc:  # pragma: no cover - errores de red reales
        logger.error("email.send_failed", extra={"error": str(exc)})
        raise EmailSendError(str(exc)) from exc

    logger.info(
        "email.sent",
        extra={
            "subject": subject,
            "recipients": to_recipients,
        },
    )
    return msg_id.strip("<>")


__all__ = ["EmailSendError", "send_email"]
