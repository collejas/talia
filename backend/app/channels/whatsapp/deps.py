"""Dependencias reutilizables para rutas de WhatsApp."""

from uuid import UUID

from typing import Any

from fastapi import Header, HTTPException, Request
from starlette.datastructures import FormData
from twilio.request_validator import RequestValidator

from app.channels.whatsapp.routing import resolve_whatsapp_organizacion
from app.core.config import settings
from app.services import tenant_runtime


async def verify_twilio_signature(
    request: Request,
    x_twilio_signature: str = Header(default=""),
) -> FormData:
    """Valida la firma de Twilio (cuando está habilitado) y retorna el form parseado."""
    form = await request.form()
    if not settings.twilio_validate_signatures:
        return form

    to_number = _normalize_to_number(form.get("To"))
    tenant_id_value = await resolve_whatsapp_organizacion(to_number=to_number)
    tenant_id = _parse_org_uuid(tenant_id_value)
    runtime_settings = await tenant_runtime.get_twilio_runtime_settings(organizacion_id=tenant_id)
    token = runtime_settings.auth_token or settings.twilio_auth_token
    if not token:
        raise HTTPException(status_code=500, detail="twilio_token_missing")

    validator = RequestValidator(token)
    payload = {key: value for key, value in form.multi_items()}
    if not validator.validate(str(request.url), payload, x_twilio_signature or ""):
        raise HTTPException(status_code=403, detail="invalid_twilio_signature")
    return form


def _parse_org_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except (TypeError, ValueError):
        return None


def _normalize_to_number(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None
