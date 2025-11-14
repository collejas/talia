"""Endpoints del canal webchat."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, Response, UploadFile

from app.core.config import settings

from . import schemas, service

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
    "/calendar/availability",
    response_model=schemas.AvailabilityResponse,
    summary="Devuelve la disponibilidad del calendario de demos",
)
async def get_calendar_availability(
    conversation_id: str = Query(..., description="Conversación activa asociada al visitante."),
    timezone: str | None = Query(
        default=None, description="Zona horaria preferida (ej. America/Mexico_City)."
    ),
    start_date: date | None = Query(
        default=None, description="Fecha inicial (formato YYYY-MM-DD)."
    ),
    window_days: int | None = Query(
        default=None, ge=1, le=60, description="Número de días a mostrar (máx. 60)."
    ),
) -> schemas.AvailabilityResponse:
    try:
        return await service.get_calendar_availability_response(
            conversation_id=conversation_id,
            timezone_preference=timezone,
            start_date=start_date,
            window_days=window_days,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/calendar/bookings",
    response_model=schemas.CalendarBookingResponse,
    summary="Confirma una cita en el calendario de demos",
)
async def create_calendar_booking(
    payload: schemas.CalendarBookingRequest,
) -> schemas.CalendarBookingResponse:
    try:
        return await service.schedule_calendar_booking(
            conversation_id=payload.conversation_id,
            slot_id=payload.slot_id,
            start_at=payload.start_at,
            notes=payload.notes,
            session_id=payload.session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/calendar/bookings/{booking_id}/reschedule",
    response_model=schemas.CalendarBookingResponse,
    summary="Reprograma una cita existente",
)
async def reschedule_calendar_booking(
    booking_id: str,
    payload: schemas.CalendarRescheduleRequest,
) -> schemas.CalendarBookingResponse:
    try:
        return await service.reschedule_calendar_booking(
            conversation_id=payload.conversation_id,
            booking_id=booking_id,
            start_at=payload.start_at,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/calendar/bookings/{booking_id}/cancel",
    response_model=schemas.CalendarBookingResponse,
    summary="Cancela una cita existente",
)
async def cancel_calendar_booking(
    booking_id: str,
    payload: schemas.CalendarCancelRequest,
) -> schemas.CalendarBookingResponse:
    try:
        return await service.cancel_calendar_booking(
            conversation_id=payload.conversation_id,
            booking_id=booking_id,
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
