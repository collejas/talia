"""Dependencias relacionadas a voz."""
from fastapi import Header


async def get_call_sid(call_sid: str | None = Header(default=None)) -> str | None:
    """Obtiene el `CallSid` del encabezado cuando está presente."""
    return call_sid
