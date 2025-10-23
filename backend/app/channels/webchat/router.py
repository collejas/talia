"""Endpoints del canal Webchat."""

from fastapi import APIRouter, HTTPException, Request

from . import service
from .schemas import WebchatMessage, WebchatResponse

router = APIRouter(prefix="/webchat", tags=["webchat"])


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
