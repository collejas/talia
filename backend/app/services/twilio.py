"""Cliente centralizado para Twilio."""

from functools import lru_cache

from twilio.rest import Client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_twilio_client() -> Client:
    """Retorna el cliente reutilizable de Twilio."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        msg = "Twilio credentials are not configured"
        raise RuntimeError(msg)
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)
