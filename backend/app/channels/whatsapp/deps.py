"""Dependencias reutilizables para rutas de WhatsApp."""

from fastapi import Header, HTTPException, Request
from starlette.datastructures import FormData
from twilio.request_validator import RequestValidator

from app.core.config import settings


async def verify_twilio_signature(
    request: Request,
    x_twilio_signature: str = Header(default=""),
) -> FormData:
    """Valida la firma de Twilio (cuando está habilitado) y retorna el form parseado."""
    form = await request.form()
    if not settings.twilio_validate_signatures:
        return form

    token = settings.twilio_auth_token
    if not token:
        raise HTTPException(status_code=500, detail="twilio_token_missing")

    validator = RequestValidator(token)
    payload = {key: value for key, value in form.multi_items()}
    if not validator.validate(str(request.url), payload, x_twilio_signature or ""):
        raise HTTPException(status_code=403, detail="invalid_twilio_signature")
    return form
