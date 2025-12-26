"""Rutas de webhook para Messenger."""

import json

from fastapi import APIRouter, Request, HTTPException
from app.channels.messenger import service

router = APIRouter(prefix="/messenger", tags=["messenger"])


@router.get("/webhook")
async def verify_webhook(mode: str | None = None, token: str | None = None, challenge: str | None = None):
    expected = service.MESSENGER_VERIFY_TOKEN
    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="Invalid verify token")
    if mode == "subscribe" and challenge:
        return {"challenge": challenge}
    raise HTTPException(status_code=400, detail="Missing challenge")


@router.post("/webhook")
async def handle_webhook(request: Request):
    body = await request.body()
    if not service.verify_signature(body, request.headers.get("X-Hub-Signature")):
        raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    await service.handle_webhook(payload)
    return {"status": "accepted"}
