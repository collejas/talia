"""Endpoints relacionados a Twilio Voice."""

from fastapi import APIRouter

from . import service
from .schemas import VoiceStatusCallback

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/status", summary="Callback de estado de llamadas")
async def voice_status(callback: VoiceStatusCallback) -> dict[str, str]:
    """Recibe actualizaciones de Twilio Voice."""
    await service.handle_voice_status(callback)
    return {"status": "received"}
