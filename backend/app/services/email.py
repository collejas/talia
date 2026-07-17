"""Utilidades para enviar correos electrónicos mediante SMTP o Brevo API."""

from __future__ import annotations

import base64
import smtplib
import ssl
from dataclasses import dataclass, replace
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from email import policy
from typing import Iterable, Literal, Sequence

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.services.tenant_runtime import BrevoRuntimeSettings, MailRuntimeSettings

logger = get_logger("app.services.email")
EmailProviderPreference = Literal["auto", "smtp", "brevo"]


class EmailSendError(RuntimeError):
    """Errores relacionados con el envío de correo."""


@dataclass(frozen=True, slots=True)
class EmailSendResult:
    """Resultado normalizado de envío de correo."""

    provider: str
    local_message_id: str
    provider_message_id: str


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
            sender_email=brevo_settings.sender_email,
            sender_name=brevo_settings.sender_name,
        )
    base_url_candidate = (settings.brevo_base_url or "https://api.brevo.com/v3").strip()
    if base_url_candidate:
        base_url_candidate = base_url_candidate.rstrip("/")
    return BrevoRuntimeSettings(
        api_key=settings.brevo_api_key,
        base_url=base_url_candidate or settings.brevo_base_url or "https://api.brevo.com/v3",
        sender_email=None,
        sender_name=None,
    )


def _resolve_message_id_domain(*, username: str | None, smtp_host: str | None) -> str | None:
    """Prefiere el dominio del remitente para el Message-ID.

    Roundcube y otros clientes del mismo buzón suelen usar un Message-ID
    alineado con el dominio del correo emisor. Mantenerlo así reduce
    diferencias entre el flujo de la app y el del webmail.
    """

    candidates = []
    if username and "@" in username:
        candidates.append(username.rsplit("@", 1)[-1].strip().lower())
    if smtp_host:
        candidates.append(smtp_host.strip().lower())

    for candidate in candidates:
        if candidate and "." in candidate and not candidate.startswith("["):
            return candidate
    return None


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
    provider_preference: EmailProviderPreference = "auto",
    flow: str | None = None,
) -> str:
    """Envía un correo y devuelve el Message-ID utilizado."""

    result = send_email_detailed(
        subject=subject,
        body_text=body_text,
        recipients=recipients,
        body_html=body_html,
        attachments=attachments,
        headers=headers,
        mail_settings=mail_settings,
        brevo_settings=brevo_settings,
        provider_preference=provider_preference,
        flow=flow,
    )
    return result.provider_message_id


def send_email_detailed(
    *,
    subject: str,
    body_text: str,
    recipients: Sequence[str],
    body_html: str | None = None,
    attachments: Sequence[dict[str, object]] | None = None,
    headers: dict[str, str] | None = None,
    mail_settings: MailRuntimeSettings | None = None,
    brevo_settings: BrevoRuntimeSettings | None = None,
    provider_preference: EmailProviderPreference = "auto",
    flow: str | None = None,
) -> EmailSendResult:
    """Envía un correo y devuelve ids local/proveedor normalizados."""

    to_recipients = _normalize_recipients(recipients)
    if not to_recipients:
        raise EmailSendError("No se proporcionaron destinatarios válidos.")

    mail_config = _resolve_mail_settings(mail_settings)
    brevo_settings_resolved = _resolve_brevo_settings(brevo_settings)
    provider = str(provider_preference or "auto").strip().lower()
    if provider not in {"auto", "smtp", "brevo"}:
        raise EmailSendError("provider_preference inválido. Usa: auto, smtp o brevo.")

    message_id_domain = _resolve_message_id_domain(
        username=mail_config.username,
        smtp_host=mail_config.outgoing_server,
    )
    message_id = make_msgid(domain=message_id_domain)
    selected_provider = "smtp"
    if provider == "brevo":
        if not (brevo_settings_resolved.api_key or "").strip():
            raise EmailSendError("Configuración Brevo incompleta: falta API Key.")
        selected_provider = "brevo"
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
    elif provider == "smtp":
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
    elif brevo_settings_resolved.api_key:
        selected_provider = "brevo"
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
            "provider": selected_provider,
            "provider_preference": provider,
            "flow": flow,
        },
    )
    return result


def _prepare_attachment_content(attachment: dict[str, object]) -> bytes:
    content = attachment.get("content")
    if isinstance(content, (bytes, bytearray)):
        return bytes(content)
    raise EmailSendError("Los adjuntos deben proporcionarse como bytes.")


def _is_ascii_text(value: str | None) -> bool:
    if value is None:
        return True
    try:
        value.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _build_smtp_email_message(
    *,
    message_id: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    recipients: Sequence[str],
    attachments: Sequence[dict[str, object]],
    headers: dict[str, str],
    mail_settings: MailRuntimeSettings,
) -> EmailMessage:
    message = EmailMessage(policy=policy.SMTP)
    message["Subject"] = subject
    display_name = (mail_settings.from_name or "").strip()
    username = (mail_settings.username or "").strip()
    if display_name:
        message["From"] = formataddr((display_name, username))
    else:
        message["From"] = username
    message["To"] = ", ".join(recipients)
    message["Message-ID"] = message_id
    message["Date"] = formatdate(localtime=True)
    # Roundcube añade estos encabezados en el flujo webmail; mantenerlos ayuda
    # a acercar el MIME generado por la app al que el servidor ya valida bien.
    message["X-Sender"] = username
    message["User-Agent"] = "Roundcube Webmail/1.6.15"
    for header_name, header_value in (headers or {}).items():
        header_key = str(header_name or "").strip()
        header_content = str(header_value or "").strip()
        if not header_key or not header_content:
            continue
        if header_key in message:
            del message[header_key]
        message[header_key] = header_content

    if _is_ascii_text(body_text):
        message.set_content(
            body_text,
            cte="7bit",
            charset="us-ascii",
        )
        message.set_param("format", "flowed", header="Content-Type")
    else:
        message.set_content(body_text, cte="quoted-printable")
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
        attachment_headers = attachment.get("headers")
        if isinstance(attachment_headers, dict):
            for header, value in attachment_headers.items():
                header_name = str(header)
                if header_name in part:
                    del part[header_name]
                part[header_name] = str(value)

    return message


def _smtp_delivery_variants(mail_settings: MailRuntimeSettings) -> list[MailRuntimeSettings]:
    variants = [mail_settings]
    port = mail_settings.outgoing_port_smtp

    if port == 465 and (not mail_settings.use_ssl or mail_settings.use_tls):
        normalized = replace(mail_settings, use_ssl=True, use_tls=False)
        if normalized != mail_settings:
            variants.append(normalized)
    elif port == 587 and mail_settings.use_ssl:
        normalized = replace(mail_settings, use_ssl=False, use_tls=True)
        if normalized != mail_settings:
            variants.append(normalized)

    return variants


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
) -> EmailSendResult:
    smtp_host = (mail_settings.outgoing_server or "").strip()
    username = (mail_settings.username or "").strip()
    password = mail_settings.password

    if not smtp_host or not username or not password:
        raise EmailSendError("Configuración SMTP incompleta (host/usuario/contraseña).")

    last_exc: Exception | None = None
    for variant in _smtp_delivery_variants(mail_settings):
        smtp_port = variant.outgoing_port_smtp or 587
        message = _build_smtp_email_message(
            message_id=message_id,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            recipients=recipients,
            attachments=attachments,
            headers=headers,
            mail_settings=variant,
        )

        context = ssl.create_default_context()
        try:
            if variant.use_ssl:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
                    server.login(username, password)
                    server.send_message(message)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                    if variant.use_tls:
                        server.starttls(context=context)
                    server.login(username, password)
                    server.send_message(message)
            if variant != mail_settings:
                logger.warning(
                    "email.smtp_transport_autocorrected",
                    extra={
                        "smtp_host": smtp_host,
                        "smtp_port": smtp_port,
                        "original_use_ssl": mail_settings.use_ssl,
                        "original_use_tls": mail_settings.use_tls,
                        "effective_use_ssl": variant.use_ssl,
                        "effective_use_tls": variant.use_tls,
                    },
                )
            trimmed_message_id = message_id.strip("<>")
            return EmailSendResult(
                provider="smtp",
                local_message_id=trimmed_message_id,
                provider_message_id=trimmed_message_id,
            )
        except Exception as exc:  # pragma: no cover - errores de red reales
            last_exc = exc

    logger.error("email.send_failed", extra={"error": str(last_exc) if last_exc else "unknown"})
    raise EmailSendError(str(last_exc) if last_exc else "SMTP send failed")


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
) -> EmailSendResult:
    api_key = (brevo_settings.api_key or "").strip()
    base_url = (brevo_settings.base_url or "https://api.brevo.com/v3").strip().rstrip("/")
    sender_email = (brevo_settings.sender_email or mail_settings.username or "").strip()
    if not api_key:
        raise EmailSendError("Configuración Brevo incompleta: falta API Key.")
    if not sender_email:
        raise EmailSendError("Configuración Brevo incompleta: falta sender_email o MAIL_USERNAME como remitente.")

    sender_name = (brevo_settings.sender_name or mail_settings.from_name or "").strip() or sender_email
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
        if response.status_code in {401, 403}:
            raise EmailSendError(
                "Brevo rechazó la autenticación del correo. Revisa la API key, el remitente configurado y que la cuenta tenga permiso para enviar SMTP."
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
    trimmed_local_id = message_id.strip("<>")
    trimmed_provider_id = str(message_id_value).strip("<>")
    return EmailSendResult(
        provider="brevo",
        local_message_id=trimmed_local_id,
        provider_message_id=trimmed_provider_id,
    )

__all__ = ["EmailSendError", "EmailSendResult", "send_email", "send_email_detailed"]
