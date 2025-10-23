"""Endpoints del canal Webchat."""

from fastapi import APIRouter

from . import service
from .schemas import WebchatMessage

router = APIRouter(prefix="/webchat", tags=["webchat"])


@router.post("/messages", summary="Publica un mensaje desde el widget web")
async def receive_webchat_message(message: WebchatMessage) -> dict[str, str]:
    """Recibe mensajes del widget en el sitio web."""
    await service.handle_webchat_message(message)
    return {"status": "queued"}
