"""Dependencias reutilizables para rutas de WhatsApp."""

import hashlib
import hmac
import json
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


async def verify_meta_signature(
    request: Request,
    organizacion_id: UUID,
    x_hub_signature_256: str = Header(default=""),
) -> dict[str, Any]:
    """Valida la firma de WhatsApp Cloud API y retorna el payload JSON."""
    body = await request.body()
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_meta_payload")

    runtime_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=organizacion_id)
    app_secret = runtime_settings.meta_app_secret
    if not app_secret:
        raise HTTPException(status_code=500, detail="meta_app_secret_missing")

    if not _verify_hub_signature(body, x_hub_signature_256 or "", app_secret):
        raise HTTPException(status_code=403, detail="invalid_meta_signature")
    return payload


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


def _verify_hub_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    if not payload:
        return False
    if not signature_header:
        return False
    prefix, _, signature = signature_header.partition("=")
    if prefix.strip().lower() != "sha256" or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())
