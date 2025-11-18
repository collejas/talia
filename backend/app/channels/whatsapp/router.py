"""Endpoints del canal WhatsApp (Twilio)."""

from fastapi import APIRouter, Depends
from starlette.datastructures import FormData

from . import schemas, service
from .deps import verify_twilio_signature

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.post("/webhook", summary="Webhook de recepción WhatsApp")
async def whatsapp_webhook(
    form_data: FormData = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Procesa mensajes entrantes desde Twilio."""
    payload = schemas.WhatsAppIncomingMessage.from_form_data(form_data)
    await service.handle_incoming_message(payload)
    return {"status": "accepted"}


@router.post("/status", summary="Actualizaciones de estado de mensajes")
async def whatsapp_status_callback(
    form_data: FormData = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Recibe notificaciones de entrega/lectura desde Twilio."""
    callback = schemas.WhatsAppStatusCallback.from_form_data(form_data)
    await service.handle_status_callback(callback)
    return {"status": "ok"}


@router.post("/fallback", summary="Webhook de contingencia WhatsApp")
async def whatsapp_fallback_webhook(
    form_data: FormData = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Se invoca cuando Twilio marca error en el webhook principal; se vuelve a procesar el mensaje."""
    payload = schemas.WhatsAppIncomingMessage.from_form_data(form_data)
    await service.handle_incoming_message(payload)
    return {"status": "fallback-accepted"}
