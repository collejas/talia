"""Endpoints del canal webchat."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, Response, UploadFile

from app.core.config import settings
from app.services import compute_demo_availability, storage
from app.services.storage import StorageError

from . import schemas, service
from .service import _parse_start_datetime

router = APIRouter(prefix="/webchat", tags=["webchat"])


@router.post(
    "/messages",
    response_model=schemas.MessageResponse,
    summary="Procesa un mensaje entrante del widget webchat",
)
async def post_webchat_message(
    payload: schemas.MessageRequest,
    request: Request,
) -> schemas.MessageResponse:
    """Recibe un mensaje del widget, invoca al asistente y responde."""
    return await service.handle_message(payload, request=request)


@router.post(
    "/uploads",
    response_model=schemas.UploadResponse,
    summary="Sube un archivo y devuelve metadatos listos para adjuntar al mensaje",
)
async def upload_webchat_file(
    request: Request,
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None, description="Identificador de sesión del widget."),
    conversation_id: str | None = Form(
        default=None, description="Conversación asociada cuando existe."
    ),
) -> schemas.UploadResponse:
    if not session_id and not conversation_id:
        raise HTTPException(status_code=400, detail="session_id_or_conversation_required")

    if conversation_id and not session_id:
        authorization = request.headers.get("authorization")
        if not authorization:
            raise HTTPException(status_code=401, detail="auth_required")

    return await service.upload_attachment(
        file,
        session_id=session_id,
        conversation_id=conversation_id,
    )


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
async def close_webchat_session(
    payload: schemas.CloseSessionRequest,
    request: Request,
) -> Response:
    """Persiste el cierre para alimentar métricas de visitantes."""
    await service.close_session(
        payload.session_id,
        metadata=payload.metadata,
        request=request,
    )
    return Response(status_code=204)


@router.post(
    "/visit",
    status_code=204,
    summary="Registra o actualiza la visita de un session_id",
)
async def register_webchat_visit(
    payload: schemas.VisitRegistrationRequest,
    request: Request,
) -> Response:
    await service.register_visit(
        payload.session_id,
        metadata=payload.metadata,
        request=request,
    )
    return Response(status_code=204)


@router.get(
    "/config",
    response_model=schemas.ClientConfig,
    summary="Obtiene configuración del widget webchat",
)
async def get_webchat_config() -> schemas.ClientConfig:
    """Expone parámetros de comportamiento para el frontend."""
    return schemas.ClientConfig(
        persist_session=settings.webchat_persist_session,
        inactivity_timeout_hours=settings.webchat_inactivity_hours,
    )


@router.get(
    "/availability",
    response_model=schemas.AvailabilityResponse,
    summary="Obtiene horarios disponibles para agendar una demo",
)
async def get_demo_availability(
    session_id: str | None = Query(
        default=None,
        min_length=4,
        description="Identificador de sesión del widget webchat.",
    ),
    conversation_id: str | None = Query(
        default=None,
        min_length=8,
        description="ID de conversación webchat ya existente.",
    ),
    timezone: str | None = Query(
        default=None,
        description="Zona horaria IANA preferida (ej. America/Mexico_City).",
    ),
    earliest_start_at: str | None = Query(
        default=None,
        description="Fecha mínima desde la cual sugerir horarios (ISO 8601).",
    ),
    preferred_start_at: str | None = Query(
        default=None,
        description="Fecha sugerida por el prospecto (ISO 8601) para priorizar disponibilidad.",
    ),
    days: int | None = Query(
        default=None,
        ge=1,
        le=60,
        description="Rango de días hacia adelante para buscar horarios.",
    ),
    max_slots: int | None = Query(
        default=None,
        ge=1,
        le=20,
        description="Número máximo de opciones a devolver.",
    ),
    slot_minutes: int | None = Query(
        default=None,
        ge=1,
        le=240,
        description="Duración (en minutos) de cada bloque sugerido.",
    ),
) -> schemas.AvailabilityResponse:
    """Devuelve una lista acotada de horarios disponibles para demos."""

    tz_default = (settings.demo_availability_timezone or "America/Mexico_City").strip()
    tz_name = (timezone or "").strip() or tz_default or "America/Mexico_City"

    conv_id = (conversation_id or "").strip()
    if not conv_id:
        if not session_id:
            raise HTTPException(status_code=400, detail="conversation_or_session_required")
        try:
            conversation = await storage.resolve_webchat_conversation_from_session(session_id)
        except StorageError as exc:
            raise HTTPException(status_code=502, detail="conversation_lookup_failed") from exc
        if not conversation or not conversation.get("id"):
            raise HTTPException(status_code=404, detail="conversation_not_found")
        conv_id = str(conversation["id"])

    earliest_dt = None
    if earliest_start_at:
        try:
            earliest_dt = _parse_start_datetime(earliest_start_at, tz_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="earliest_start_at_invalid") from exc

    preferred_dt = None
    if preferred_start_at:
        try:
            preferred_dt = _parse_start_datetime(preferred_start_at, tz_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="preferred_start_at_invalid") from exc

    availability = await compute_demo_availability(
        conversation_id=conv_id,
        timezone_name=tz_name,
        earliest_start=earliest_dt,
        preferred_start=preferred_dt,
        days=days,
        max_slots=max_slots,
        slot_minutes=slot_minutes,
    )

    return schemas.AvailabilityResponse(**availability)
