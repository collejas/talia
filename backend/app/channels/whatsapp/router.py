"""Endpoints del canal WhatsApp (Twilio)."""

from fastapi import APIRouter, Depends, Request

from . import service
from .deps import verify_twilio_signature

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.post("/webhook", summary="Webhook de recepción WhatsApp")
async def whatsapp_webhook(
    request: Request,
    _: None = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Procesa mensajes entrantes desde Twilio.

    Por ahora devuelve un stub para confirmar recepción.
    """
    payload = await request.body()
    await service.handle_incoming_message(payload)
    return {"status": "accepted"}
