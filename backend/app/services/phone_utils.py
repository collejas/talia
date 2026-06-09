"""Utilidades para normalizar teléfonos antes de guardarlos o compararlos."""

from __future__ import annotations

import re
from typing import Optional

DEFAULT_MEXICAN_COUNTRY_CODE = "52"
MOBILE_PREFIX = "1"
_NON_DIGITS = re.compile(r"[^0-9]+")


def _clean_digits(value: str | None) -> str:
    if not value:
        return ""
    return _NON_DIGITS.sub("", value)


def _collapse_mx_prefix_duplicates(digits: str) -> str:
    """Colapsa prefijos mexicanos duplicados como 52521... o 521521..."""
    if not digits:
        return digits

    # Caso más común: el prefijo móvil quedó duplicado completo.
    while digits.startswith("521521"):
        digits = "521" + digits[6:]

    # Variantes donde se repite el 52 antes del 521.
    while len(digits) > 13 and digits.startswith("52") and digits[2:].startswith("52"):
        digits = digits[2:]

    return digits


def _ensure_mexico_mobile_prefix(digits: str, country_code: str = DEFAULT_MEXICAN_COUNTRY_CODE) -> str:
    digits = _collapse_mx_prefix_duplicates(digits)
    if digits.startswith(country_code):
        rest = digits[len(country_code) :]
        if rest.startswith(MOBILE_PREFIX):
            return digits
        return country_code + MOBILE_PREFIX + rest
    if len(digits) == 10:
        return country_code + MOBILE_PREFIX + digits
    return digits


def normalize_phone(value: str | None, country_code: str = DEFAULT_MEXICAN_COUNTRY_CODE) -> Optional[str]:
    """Convierte el valor dado en un +{prefijo}{numero} limpio."""
    digits = _clean_digits(value)
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    digits = _collapse_mx_prefix_duplicates(digits)
    normalized = _ensure_mexico_mobile_prefix(digits, country_code)
    return f"+{normalized}"


def normalize_phone_digits(value: str | None) -> Optional[str]:
    """Devuelve solo los dígitos significativos (sin prefijos) para comparar."""
    digits = _clean_digits(value)
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    digits = _collapse_mx_prefix_duplicates(digits)
    return _ensure_mexico_mobile_prefix(digits)
