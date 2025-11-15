"""Servicios compartidos disponibles para otros módulos."""

from .email import EmailSendError, send_email
from .google_places import (
    GooglePlacesClient,
    GooglePlacesError,
    normalize_place_for_result,
)

__all__ = [
    "EmailSendError",
    "GooglePlacesClient",
    "GooglePlacesError",
    "normalize_place_for_result",
    "send_email",
]
