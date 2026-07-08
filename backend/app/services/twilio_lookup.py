"""Cliente de Twilio Lookup para normalizar teléfonos."""

import asyncio
import logging
from typing import Any

import phonenumbers
from phonenumbers import shortnumberinfo
from phonenumbers import PhoneNumberType
from phonenumbers.phonenumberutil import NumberParseException
from twilio.base.exceptions import TwilioException

from app.services.twilio import get_twilio_client, get_twilio_client_for_credentials

logger = logging.getLogger(__name__)


class TwilioLookupError(RuntimeError):
    """Errores al consultar Twilio Lookup."""


_PHONE_NUMBER_TYPE_LABELS: dict[int, str] = {
    PhoneNumberType.FIXED_LINE: "fixed_line",
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "fixed_line_or_mobile",
    PhoneNumberType.TOLL_FREE: "toll_free",
    PhoneNumberType.PREMIUM_RATE: "premium_rate",
    PhoneNumberType.SHARED_COST: "shared_cost",
    PhoneNumberType.VOIP: "voip",
    PhoneNumberType.PERSONAL_NUMBER: "personal_number",
    PhoneNumberType.PAGER: "pager",
    PhoneNumberType.UAN: "uan",
    PhoneNumberType.VOICEMAIL: "voicemail",
    PhoneNumberType.UNKNOWN: "unknown",
}


def _carrier_type_from_phone_number_type(number_type: int) -> str | None:
    if number_type == PhoneNumberType.MOBILE:
        return "mobile"
    if number_type == PhoneNumberType.FIXED_LINE_OR_MOBILE:
        # Para clasificación binaria móvil/no móvil en modo gratis, tratamos este caso ambiguo como móvil.
        return "mobile"
    if number_type == PhoneNumberType.FIXED_LINE:
        return "landline"
    if number_type == PhoneNumberType.VOIP:
        return "voip"
    if number_type == PhoneNumberType.TOLL_FREE:
        return "toll_free"
    if number_type == PhoneNumberType.PREMIUM_RATE:
        return "premium_rate"
    if number_type == PhoneNumberType.SHARED_COST:
        return "shared_cost"
    if number_type == PhoneNumberType.PAGER:
        return "pager"
    if number_type == PhoneNumberType.UAN:
        return "uan"
    if number_type == PhoneNumberType.VOICEMAIL:
        return "voicemail"
    if number_type == PhoneNumberType.PERSONAL_NUMBER:
        return "personal_number"
    return None


def _normalize_country_code(country_code: str | None) -> str | None:
    code = (country_code or "").strip().upper()
    if len(code) == 2 and code.isalpha():
        return code
    return None


def _mx_phone_lookup_candidates(phone_number: str) -> list[str]:
    """Genera variantes mexicanas del mismo número para cubrir formatos antiguos y nuevos."""

    cleaned = phone_number.strip()
    candidates = [cleaned]
    if not cleaned.startswith("+52"):
        return candidates

    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if len(digits) == 13 and digits.startswith("521"):
        alt = f"+52{digits[3:]}"
        if alt not in candidates:
            candidates.append(alt)
    elif len(digits) == 12 and digits.startswith("52"):
        alt = f"+521{digits[2:]}"
        if alt not in candidates:
            candidates.append(alt)
    return candidates


async def lookup_phone_number_free(
    phone_number: str,
    *,
    country_code: str | None = None,
) -> dict[str, Any]:
    """Clasifica un teléfono con metadata local de phonenumbers (sin API externa)."""

    region = _normalize_country_code(country_code)
    candidates = _mx_phone_lookup_candidates(phone_number) if region == "MX" else [phone_number]
    parse_errors: list[str] = []
    for candidate in candidates:
        try:
            parsed = phonenumbers.parse(candidate, region)
        except NumberParseException as exc:
            parse_errors.append(str(exc) or "phone_parse_failed")
            continue
        if region and shortnumberinfo.is_valid_short_number_for_region(parsed, region):
            return {
                "phone_number": candidate,
                "country_code": region,
                "national_format": candidate,
                "carrier": {
                    "type": "short_code",
                    "number_type": "short_code",
                    "source": "phonenumbers",
                },
            }
        if not phonenumbers.is_possible_number(parsed):
            parse_errors.append("phone_not_possible")
            continue
        if not phonenumbers.is_valid_number(parsed):
            parse_errors.append("phone_not_valid")
            continue

        number_type = phonenumbers.number_type(parsed)
        number_type_label = _PHONE_NUMBER_TYPE_LABELS.get(number_type, "unknown")
        carrier_type = _carrier_type_from_phone_number_type(number_type)
        return {
            "phone_number": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
            "country_code": phonenumbers.region_code_for_number(parsed),
            "national_format": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL),
            "carrier": {
                "type": carrier_type,
                "number_type": number_type_label,
                "source": "phonenumbers",
            },
        }
    if parse_errors:
        raise TwilioLookupError(parse_errors[-1])
    raise TwilioLookupError("phone_not_valid")


async def lookup_phone_number(
    phone_number: str,
    *,
    country_code: str | None = None,
    account_sid: str | None = None,
    auth_token: str | None = None,
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

    try:
        if account_sid or auth_token:
            client = get_twilio_client_for_credentials(account_sid or "", auth_token or "")
        else:
            client = get_twilio_client()
    except RuntimeError as exc:
        raise TwilioLookupError(str(exc) or "twilio_not_configured") from exc
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
