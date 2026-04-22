"""Endpoints del canal WhatsApp."""
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from starlette.datastructures import FormData

from . import schemas, service
from .deps import verify_meta_signature, verify_twilio_signature
from app.core.config import settings
from app.services import tenant_runtime

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.post("/webhook", summary="Webhook de recepción WhatsApp")
async def whatsapp_webhook(
    background_tasks: BackgroundTasks,
    form_data: FormData = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Procesa mensajes entrantes desde Twilio."""
    payload = schemas.WhatsAppIncomingMessage.from_form_data(form_data)
    background_tasks.add_task(service.handle_incoming_message, payload, "webhook")
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
    background_tasks: BackgroundTasks,
    form_data: FormData = Depends(verify_twilio_signature),
) -> dict[str, str]:
    """Se invoca cuando Twilio marca error en el webhook principal; se vuelve a procesar el mensaje."""
    payload = schemas.WhatsAppIncomingMessage.from_form_data(form_data)
    background_tasks.add_task(service.handle_incoming_message, payload, "fallback")
    return {"status": "fallback-accepted"}


@router.get("/meta/{organizacion_id}/webhook", summary="Verificación del webhook WhatsApp Cloud API")
async def whatsapp_meta_verify_webhook(
    organizacion_id: UUID,
    request: Request,
    mode: str | None = None,
    token: str | None = None,
    challenge: str | None = None,
) -> Response:
    mode = mode or request.query_params.get("hub.mode")
    token = token or request.query_params.get("hub.verify_token")
    challenge = challenge or request.query_params.get("hub.challenge")
    if not challenge:
        raise HTTPException(status_code=400, detail="Missing challenge")

    runtime = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=organizacion_id)
    expected_token = runtime.meta_verify_token or settings.whatsapp_meta_verify_token
    if not expected_token or token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid verify token")
    if mode == "subscribe":
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=400, detail="Missing challenge")


@router.post("/meta/{organizacion_id}/webhook", summary="Webhook de recepción WhatsApp Cloud API")
async def whatsapp_meta_webhook(
    organizacion_id: UUID,
    payload: dict = Depends(verify_meta_signature),
) -> dict[str, str]:
    """Procesa mensajes entrantes y estados desde WhatsApp Cloud API."""
    background_payloads = schemas.MetaWhatsAppIncomingMessage.from_webhook_payload(payload)
    for message in background_payloads:
        await service.handle_incoming_message(message, "meta_webhook", organizacion_id=organizacion_id)

    status_callbacks = schemas.MetaWhatsAppStatusCallback.from_webhook_payload(payload)
    for callback in status_callbacks:
        await service.handle_status_callback(callback, provider="meta")

    return {"status": "accepted"}
