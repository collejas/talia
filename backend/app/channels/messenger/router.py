"""Rutas de webhook para Messenger."""

import json

from fastapi import APIRouter, Request, HTTPException, Response

from app.channels.messenger import service

router = APIRouter(prefix="/messenger", tags=["messenger"])


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
    if not service.verify_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    await service.handle_webhook(payload)
    return {"status": "accepted"}
