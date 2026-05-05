"""Servicios compartidos disponibles para otros módulos."""

from .denue import DenueClient, DenueError, normalize_denue_place
from .email import EmailSendError, send_email
from .google_places import (
    GooglePlacesClient,
    GooglePlacesError,
    normalize_place_for_result,
)
from .result_identity import build_result_dedupe_key
from .twilio_lookup import TwilioLookupError, lookup_phone_number, lookup_phone_number_free

__all__ = [
    "EmailSendError",
    "GooglePlacesClient",
    "GooglePlacesError",
    "DenueClient",
    "DenueError",
    "build_result_dedupe_key",
    "normalize_denue_place",
    "normalize_place_for_result",
    "send_email",
    "lookup_phone_number",
    "lookup_phone_number_free",
    "TwilioLookupError",
]
