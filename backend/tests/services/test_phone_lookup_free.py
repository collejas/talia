import phonenumbers
import pytest
from phonenumbers import PhoneNumberFormat, PhoneNumberType

from app.services.twilio_lookup import TwilioLookupError, lookup_phone_number_free


def _example_e164(region: str, number_type: int) -> str:
    sample = phonenumbers.example_number_for_type(region, number_type)
    assert sample is not None
    return phonenumbers.format_number(sample, PhoneNumberFormat.E164)


@pytest.mark.asyncio
async def test_lookup_phone_number_free_classifies_mobile() -> None:
    phone_e164 = _example_e164("MX", PhoneNumberType.MOBILE)
    result = await lookup_phone_number_free(phone_e164, country_code="MX")

    assert result["phone_number"] == phone_e164
    assert (result.get("carrier") or {}).get("type") == "mobile"


@pytest.mark.asyncio
async def test_lookup_phone_number_free_classifies_landline() -> None:
    phone_e164 = _example_e164("MX", PhoneNumberType.FIXED_LINE)
    result = await lookup_phone_number_free(phone_e164, country_code="MX")

    assert result["phone_number"] == phone_e164
    assert (result.get("carrier") or {}).get("type") == "landline"


@pytest.mark.asyncio
async def test_lookup_phone_number_free_rejects_invalid_number() -> None:
    with pytest.raises(TwilioLookupError):
        await lookup_phone_number_free("+521234", country_code="MX")


@pytest.mark.asyncio
async def test_lookup_phone_number_free_classifies_toll_free() -> None:
    phone_e164 = _example_e164("US", PhoneNumberType.TOLL_FREE)
    result = await lookup_phone_number_free(phone_e164, country_code="US")

    assert result["phone_number"] == phone_e164
    assert (result.get("carrier") or {}).get("type") == "toll_free"


@pytest.mark.asyncio
async def test_lookup_phone_number_free_classifies_short_code() -> None:
    result = await lookup_phone_number_free("911", country_code="US")

    assert (result.get("carrier") or {}).get("type") == "short_code"
