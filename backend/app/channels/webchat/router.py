"""Endpoints del canal Webchat."""

from fastapi import APIRouter, HTTPException, Query, Request

from . import service
from .schemas import (
    WebchatClosePayload,
    WebchatHistoryResponse,
    WebchatMessage,
    WebchatResponse,
)

router = APIRouter(prefix="/webchat", tags=["webchat"])


@router.get(
    "/messages",
    summary="Obtiene historial de mensajes para un session_id",
    response_model=WebchatHistoryResponse,
)
async def fetch_webchat_history(
    session_id: str = Query(..., min_length=4),
    limit: int = Query(default=50, ge=1, le=200),
    since: str | None = Query(default=None),
) -> WebchatHistoryResponse:
    """Devuelve mensajes ordenados cronológicamente para el widget webchat."""
    try:
        return await service.get_webchat_history(session_id=session_id, limit=limit, since=since)
    except service.AssistantServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/messages", summary="Envía un mensaje desde el widget web", response_model=WebchatResponse
)
async def receive_webchat_message(message: WebchatMessage, request: Request) -> WebchatResponse:
    """Recibe mensajes del widget y devuelve la respuesta generada por TalIA."""
    try:
        return await service.handle_webchat_message(message, request=request)
    except service.AssistantConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except service.AssistantServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/close",
    summary="Cierra la conversación asociada al session_id y resetea contexto",
)
async def close_webchat_conversation(payload: WebchatClosePayload, request: Request) -> dict:
    session_id = payload.session_id
    try:
        await service.close_session_conversation(session_id, request=request)
    except service.AssistantServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/close/check")
async def check_close_endpoint() -> dict:
    return {"ok": True, "endpoint": "webchat.close"}
