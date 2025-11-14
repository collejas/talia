"""Servicios compartidos disponibles para otros módulos."""

from .email import EmailSendError, send_email

__all__ = [
    "EmailSendError",
    "send_email",
]
