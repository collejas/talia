"""Helper para invitar cuentas en Supabase Auth usando el service role."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
DEFAULT_PHONE = "+00000000000"
DEFAULT_TIMEOUT = 10.0


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
    phone_value, phone_confirm = _format_phone(telefono)

    payload = {
        "email": email,
        "data": {
            "organizacion_id": organizacion_id,
            "nombre": nombre,
            "telefono_e164": phone_value if phone_confirm else None,
        },
    }
    payload["data"] = {key: value for key, value in payload["data"].items() if value is not None}

    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        invite_resp = await client.post(f"{base_url}/auth/v1/invite", json=payload, headers=headers)
        if invite_resp.status_code >= 400:
            lowered_body = invite_resp.text.lower()
            if "already registered" in lowered_body or "already been registered" in lowered_body:
                raise SupabaseAdminError("user_email_already_registered")
            raise SupabaseAdminError(
                f"Supabase invite user failure: {invite_resp.status_code} {invite_resp.text}"
            )
        created = invite_resp.json()
        user_id = created.get("id")
        if not user_id:
            raise SupabaseAdminError("Supabase no respondió con un id de usuario.")

    return user_id, phone_value


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
