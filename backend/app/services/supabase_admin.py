"""Helper para crear cuentas en Supabase Auth usando el service role."""

from __future__ import annotations

import secrets
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

DEFAULT_PHONE = "+00000000000"
DEFAULT_TIMEOUT = 10.0

logger = get_logger("app.services.supabase_admin")


class SupabaseAdminError(RuntimeError):
    """Error en las llamadas de administración de Supabase."""


def _require_service_role() -> tuple[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise SupabaseAdminError("Supabase no está configurado para crear usuarios.")
    base_url = settings.supabase_url.rstrip("/")
    return base_url, settings.supabase_service_role


def _format_phone(phone: str | None) -> tuple[str, bool]:
    if not phone:
        return DEFAULT_PHONE, False
    sanitized = phone.strip()
    if not sanitized.startswith("+"):
        sanitized = f"+{sanitized}"
    if not sanitized[1:].isdigit() or len(sanitized) < 8:
        return DEFAULT_PHONE, False
    return sanitized, True


async def create_supabase_user(
    *,
    email: str,
    nombre: str | None,
    telefono: str | None,
    organizacion_id: str,
) -> tuple[str, str]:
    base_url, service_role = _require_service_role()
    password = secrets.token_urlsafe(24)
    phone_value, phone_confirm = _format_phone(telefono)

    metadata: dict[str, Any] = {"organizacion_id": organizacion_id}
    if nombre:
        metadata["nombre"] = nombre
    if phone_confirm:
        metadata["telefono_e164"] = phone_value

    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "phone": phone_value,
        "phone_confirm": phone_confirm,
        "user_metadata": metadata,
        "app_metadata": {"organizacion_id": organizacion_id},
    }

    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        create_resp = await client.post(f"{base_url}/auth/v1/admin/users", json=payload, headers=headers)
        if create_resp.status_code >= 400:
            lowered_body = create_resp.text.lower()
            if "already registered" in lowered_body or "already been registered" in lowered_body:
                raise SupabaseAdminError("user_email_already_registered")
            raise SupabaseAdminError(
                f"Supabase create user failure: {create_resp.status_code} {create_resp.text}"
            )
        created = create_resp.json()
        user_id = created.get("id")
        if not user_id:
            raise SupabaseAdminError("Supabase no respondió con un id de usuario.")

        update_payload = {
            "phone": phone_value,
            "phone_confirm": phone_confirm,
            "user_metadata": metadata,
            "app_metadata": {"organizacion_id": organizacion_id},
        }
        update_resp = await client.put(
            f"{base_url}/auth/v1/admin/users/{user_id}",
            json=update_payload,
            headers=headers,
        )
        if update_resp.status_code >= 400:
            raise SupabaseAdminError(
                f"Supabase update user failure: {update_resp.status_code} {update_resp.text}"
            )

        await _send_recovery_email(client, base_url, service_role, email)

    return user_id, phone_value


async def _send_recovery_email(
    client: httpx.AsyncClient, base_url: str, service_role: str, email: str
) -> None:
    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"email": email}
    if settings.supabase_reset_redirect_url:
        payload["options"] = {"redirect_to": settings.supabase_reset_redirect_url}
    resp = await client.post(f"{base_url}/auth/v1/recover", json=payload, headers=headers)
    if resp.status_code >= 400:
        # El usuario ya fue creado; no bloqueamos onboarding por un fallo de correo.
        logger.warning(
            "supabase_admin.recovery_email_failed",
            extra={"email": email, "status_code": resp.status_code, "body": resp.text[:1024]},
        )


async def is_email_registered(*, email: str) -> bool:
    base_url, service_role = _require_service_role()
    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
    }
    params = {"email": email}
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.get(f"{base_url}/auth/v1/admin/users", params=params, headers=headers)
    if resp.status_code >= 400:
        raise SupabaseAdminError(
            f"Supabase list users failure: {resp.status_code} {resp.text}"
        )
    data = resp.json()
    users: list[dict[str, Any]] = []
    if isinstance(data, dict) and isinstance(data.get("users"), list):
        users = [row for row in data["users"] if isinstance(row, dict)]
    elif isinstance(data, list):
        users = [row for row in data if isinstance(row, dict)]
    target = email.strip().lower()
    for row in users:
        current = str(row.get("email") or "").strip().lower()
        if current and current == target:
            return True
    return False
