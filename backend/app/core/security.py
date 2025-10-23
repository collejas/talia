"""Helpers de validación común para webhooks y firmas."""

import hmac
from hashlib import sha256


class SignatureError(Exception):
    """Excepción genérica para firmas inválidas."""


def verify_signature(
    secret: str, payload: bytes, signature: str, *, header_prefix: str = "sha256="
) -> None:
    """Verifica firmas HMAC-SHA256.

    Args:
        secret: Clave secreta compartida.
        payload: Cuerpo bruto recibido.
        signature: Firma recibida desde el proveedor.
        header_prefix: Prefijo esperado (ej. "sha256=").
    """
    expected = _build_signature(secret, payload)
    expected_token = f"{header_prefix}{expected}"
    if not hmac.compare_digest(expected_token, signature):
        raise SignatureError("Invalid signature received")


def _build_signature(secret: str, payload: bytes) -> str:
    digest = hmac.new(secret.encode(), payload, sha256)
    return digest.hexdigest()


def mask_secret(value: str | None) -> str | None:
    """Enmascara secretos para logging seguro."""
    if not value:
        return value
    if len(value) <= 4:
        return "***"
    return f"{value[:2]}***{value[-2:]}"
