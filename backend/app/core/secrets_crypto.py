"""Cifrado/descifrado de secretos para persistencia en BD (tenant-scoped).

Diseño:
- Se cifra en aplicación (backend) antes de guardar en `public.secretos`.
- Se usa AES-GCM (AEAD): `nonce` (12 bytes) + `ciphertext` (incluye tag).
- En BD se guarda como texto base64: `nonce` y `valor_cifrado`.
"""

from __future__ import annotations

import base64
import binascii
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SecretsCryptoError(RuntimeError):
    """Errores de cifrado/descifrado de secretos."""


def encrypt_secret(*, plaintext: str, master_key: str, aad: str | None = None) -> tuple[str, str]:
    key_bytes = _decode_master_key(master_key)
    nonce = os.urandom(12)
    aesgcm = AESGCM(key_bytes)
    aad_bytes = aad.encode("utf-8") if aad else None
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad_bytes)
    return _b64encode(nonce), _b64encode(ciphertext)


def decrypt_secret(*, nonce_b64: str, ciphertext_b64: str, master_key: str, aad: str | None = None) -> str:
    key_bytes = _decode_master_key(master_key)
    nonce = _b64decode(nonce_b64)
    ciphertext = _b64decode(ciphertext_b64)
    aesgcm = AESGCM(key_bytes)
    aad_bytes = aad.encode("utf-8") if aad else None
    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, aad_bytes)
    except Exception as exc:  # cryptography raises multiple types
        raise SecretsCryptoError("decrypt_failed") from exc
    return plaintext.decode("utf-8")


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except (binascii.Error, UnicodeEncodeError) as exc:
        raise SecretsCryptoError("invalid_base64") from exc


@lru_cache(maxsize=8)
def _decode_master_key(raw: str) -> bytes:
    """Acepta master key en base64-url o hex (32 bytes = 256 bits)."""
    if not raw:
        raise SecretsCryptoError("master_key_missing")

    value = raw.strip()
    # Hex (64 chars) soporte para admins que prefieren hex.
    if len(value) == 64:
        try:
            decoded = bytes.fromhex(value)
        except ValueError:
            decoded = b""
        else:
            if len(decoded) == 32:
                return decoded

    decoded = _b64decode(value)
    if len(decoded) != 32:
        raise SecretsCryptoError("master_key_invalid_length")
    return decoded

