"""Rutas de webhook para Messenger."""

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request, HTTPException, Response

from app.channels.messenger import service
from app.channels.messenger.routing import resolve_messenger_organizacion
from app.core.config import settings
from app.services import tenant_runtime

router = APIRouter(prefix="/messenger", tags=["messenger"])


def _extract_page_id(payload: dict[str, Any]) -> str | None:
    entries = payload.get("entry") or []
    for entry in entries:
        messaging = entry.get("messaging") or []
        for event in messaging:
            recipient = event.get("recipient") or {}
            page_id = recipient.get("id")
            if isinstance(page_id, str) and page_id.strip():
                return page_id.strip()
    return None


async def _resolve_messenger_app_secret(payload: dict[str, Any]) -> str | None:
    page_id = _extract_page_id(payload)
    if not page_id:
        return settings.messenger_app_secret
    organizacion_id = await resolve_messenger_organizacion(page_id=page_id)
    if not organizacion_id:
        return settings.messenger_app_secret
    try:
        organizacion_uuid = UUID(organizacion_id)
    except (TypeError, ValueError):
        return settings.messenger_app_secret
    messenger_settings = await tenant_runtime.get_messenger_runtime_settings(organizacion_id=organizacion_uuid)
    return messenger_settings.app_secret or settings.messenger_app_secret


@router.get("/webhook")
async def verify_webhook(request: Request, mode: str | None = None, token: str | None = None, challenge: str | None = None):
    mode = mode or request.query_params.get("hub.mode")
    token = token or request.query_params.get("hub.verify_token")
    challenge = challenge or request.query_params.get("hub.challenge")
    expected = service.MESSENGER_VERIFY_TOKEN
    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="Invalid verify token")
    if mode == "subscribe" and challenge:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=400, detail="Missing challenge")


@router.post("/webhook")
async def handle_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature") or request.headers.get("X-Hub-Signature-256")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    app_secret = await _resolve_messenger_app_secret(payload)
    if not service.verify_signature(body, signature, app_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")
    await service.handle_webhook(payload)
    return {"status": "accepted"}
