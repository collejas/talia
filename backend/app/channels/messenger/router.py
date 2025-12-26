"""Rutas de webhook para Messenger."""

from fastapi import APIRouter, Request, HTTPException
from app.channels.messenger import service

router = APIRouter(prefix="/messenger", tags=["messenger"])


@router.get("/webhook")
async def verify_webhook(mode: str | None = None, token: str | None = None, challenge: str | None = None):
    if token != service.MESSENGER_VERIFY_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid verify token")
    if mode == "subscribe" and challenge:
        return {"challenge": challenge}
    raise HTTPException(status_code=400, detail="Missing challenge")


@router.post("/webhook")
async def handle_webhook(request: Request):
    payload = await request.json()
    await service.handle_webhook(payload)
    return {"status": "accepted"}
