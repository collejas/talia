"""Cliente de Twilio Lookup para normalizar teléfonos."""

import asyncio
from typing import Any

from twilio.base.exceptions import TwilioException

from app.services.twilio import get_twilio_client


class TwilioLookupError(RuntimeError):
    """Errores al consultar Twilio Lookup."""


async def lookup_phone_number(
    phone_number: str,
    *,
    country_code: str | None = None,
) -> dict[str, Any]:
    """Consulta Twilio Lookup y retorna metadatos del número.

    Parameters
    ----------
    phone_number:
        Número telefónico en formato libre.
    country_code:
        Código de país ISO2 opcional para ayudar a Twilio a resolver el número.

    Returns
    -------
    dict[str, Any]
        Datos normalizados incluyendo formatos E.164 y nacional, además de carrier.
    """

    client = get_twilio_client()
    try:
        response = await asyncio.to_thread(
            client.lookups.v2.phone_numbers(phone_number).fetch,
            country_code=country_code,
            type="carrier",
        )
    except TwilioException as exc:  # pragma: no cover - depende del SDK
        raise TwilioLookupError(str(exc) or "twilio_lookup_failed") from exc

    carrier_data = getattr(response, "carrier", None)
    carrier = carrier_data if isinstance(carrier_data, dict) else {}
    return {
        "phone_number": getattr(response, "phone_number", None),
        "country_code": getattr(response, "country_code", None),
        "national_format": getattr(response, "national_format", None),
        "carrier": carrier,
    }
