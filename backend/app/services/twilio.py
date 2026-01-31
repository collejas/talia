"""Cliente centralizado para Twilio."""

from functools import lru_cache

from twilio.rest import Client

from app.core.config import settings


@lru_cache(maxsize=1)
def _build_twilio_client(account_sid: str, auth_token: str) -> Client:
    return Client(account_sid, auth_token)


def get_twilio_client_for_credentials(account_sid: str, auth_token: str) -> Client:
    """Retorna un cliente de Twilio para las credenciales especificadas."""
    if not account_sid or not auth_token:
        raise RuntimeError("Twilio credentials are not configured")
    return _build_twilio_client(account_sid, auth_token)


def get_twilio_client() -> Client:
    """Retorna el cliente reutilizable de Twilio (legacy)."""
    return get_twilio_client_for_credentials(settings.twilio_account_sid or "", settings.twilio_auth_token or "")
