"""Endpoints del canal webchat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response

from . import schemas, service

router = APIRouter(prefix="/webchat", tags=["webchat"])


@router.post(
    "/messages",
    response_model=schemas.MessageResponse,
    summary="Procesa un mensaje entrante del widget webchat",
)
async def post_webchat_message(payload: schemas.MessageRequest) -> schemas.MessageResponse:
    """Recibe un mensaje del widget, invoca al asistente y responde."""
    return await service.handle_message(payload)


@router.get(
    "/messages",
    response_model=schemas.HistoryResponse,
    summary="Recupera historial de mensajes para un session_id",
)
async def get_webchat_messages(
    session_id: str = Query(..., min_length=4, description="Identificador de sesión webchat."),
    limit: int = Query(100, ge=1, le=200, description="Número máximo de mensajes a recuperar."),
) -> schemas.HistoryResponse:
    """Devuelve mensajes recientes asociados a la sesión solicitada."""
    return await service.fetch_history(session_id=session_id, limit=limit)


@router.post(
    "/close",
    status_code=204,
    summary="Registra el cierre explícito de una sesión webchat",
)
async def close_webchat_session(payload: schemas.CloseSessionRequest) -> Response:
    """Persiste el cierre para alimentar métricas de visitantes."""
    await service.close_session(payload.session_id)
    return Response(status_code=204)
