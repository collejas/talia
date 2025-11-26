"""Cliente de Twilio Lookup para normalizar teléfonos."""

import asyncio
import logging
from typing import Any

from twilio.base.exceptions import TwilioException

from app.services.twilio import get_twilio_client

logger = logging.getLogger(__name__)


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
    fetch_kwargs: dict[str, Any] = {"fields": "line_type_intelligence"}
    if country_code:
        fetch_kwargs["country_code"] = country_code
    logger.info("twilio.lookup_request phone=%s country=%s", phone_number, country_code or "auto")
    try:
        response = await asyncio.to_thread(
            client.lookups.v2.phone_numbers(phone_number).fetch,
            **fetch_kwargs,
        )
    except TwilioException as exc:  # pragma: no cover - depende del SDK
        logger.warning(
            "twilio.lookup_failed phone=%s country=%s error=%s",
            phone_number,
            country_code or "auto",
            str(exc),
        )
        raise TwilioLookupError(str(exc) or "twilio_lookup_failed") from exc

    carrier_data = getattr(response, "line_type_intelligence", None)
    carrier = carrier_data if isinstance(carrier_data, dict) else {}
    logger.info(
        "twilio.lookup_success phone=%s carrier=%s country=%s",
        getattr(response, "phone_number", None),
        carrier.get("type"),
        getattr(response, "country_code", None),
    )
    return {
        "phone_number": getattr(response, "phone_number", None),
        "country_code": getattr(response, "country_code", None),
        "national_format": getattr(response, "national_format", None),
        "carrier": carrier,
    }
