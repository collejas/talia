"""Dependencias comunes para el canal webchat."""

from fastapi import Header


async def get_client_ip(x_forwarded_for: str | None = Header(default=None)) -> str | None:
    """Devuelve la IP original si viene del header estándar."""
    return x_forwarded_for
