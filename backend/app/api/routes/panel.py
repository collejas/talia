"""Rutas del panel: permisos, inbox y mensajes.

Nota: Para resultados sujetos a RLS, se reenvía el JWT del usuario en la
cabecera Authorization hacia Supabase REST. Para resolver permisos/roles, se
usa service_role en el backend y se extrae el `sub` del JWT (sin verificar).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.services import leads_geo, storage

router = APIRouter(prefix="", tags=["panel"])

logger = get_logger(__name__)


class ManualOverridePayload(BaseModel):
    """Payload para activar/desactivar modo manual."""

    manual: bool = Field(..., description="True para pausar al asistente")


class DemoAppointmentCreatePayload(BaseModel):
    """Payload para crear una cita de demostración."""

    tarjeta_id: UUID = Field(..., description="ID de la tarjeta de lead asociada.")
    contacto_id: UUID | None = Field(
        default=None,
        description="Contacto invitado; se toma de la tarjeta cuando se omite.",
    )
    conversacion_id: UUID | None = Field(
        default=None, description="Conversación relacionada con la cita."
    )
    start_at: datetime = Field(..., description="Inicio de la demo (timestamp con zona).")
    end_at: datetime | None = Field(default=None, description="Fin de la demo.")
    timezone: str | None = Field(
        default=None,
        description="Zona horaria IANA (ej. America/Mexico_City) para mostrar localmente.",
    )
    estado: Literal["pendiente", "confirmada", "reprogramada", "cancelada", "realizada"] | None = (
        Field(default=None, description="Estado inicial; por defecto se usa 'pendiente'.")
    )
    provider: Literal["hosting", "google"] | None = Field(
        default=None, description="Proveedor del calendario externo (hosting propio o Google)."
    )
    provider_calendar_id: str | None = Field(
        default=None, description="Identificador del calendario externo."
    )
    provider_event_id: str | None = Field(
        default=None, description="Identificador del evento externo."
    )
    meeting_url: str | None = Field(
        default=None, description="URL de videollamada o enlace de reunión."
    )
    location: str | None = Field(default=None, description="Ubicación física de la demo.")
    notes: str | None = Field(default=None, description="Notas internas adicionales.")
    metadata: dict[str, Any] | None = Field(
        default=None, description="Metadatos adicionales a persistir como JSON."
    )


class DemoAppointmentUpdatePayload(BaseModel):
    """Payload para actualizar una cita existente."""

    start_at: datetime | None = Field(default=None, description="Nuevo inicio de la demo.")
    end_at: datetime | None = Field(default=None, description="Nuevo fin de la demo.")
    timezone: str | None = Field(default=None, description="Zona horaria actualizada.")
    estado: Literal["pendiente", "confirmada", "reprogramada", "cancelada", "realizada"] | None = (
        Field(default=None, description="Estado actualizado de la cita.")
    )
    provider: Literal["hosting", "google"] | None = Field(
        default=None, description="Proveedor actualizado del calendario."
    )
    provider_calendar_id: str | None = Field(
        default=None, description="Identificador del calendario externo."
    )
    provider_event_id: str | None = Field(
        default=None, description="Identificador del evento externo."
    )
    meeting_url: str | None = Field(default=None, description="URL de reunión actualizada.")
    location: str | None = Field(default=None, description="Ubicación física actualizada.")
    notes: str | None = Field(default=None, description="Notas internas actualizadas.")
    metadata: dict[str, Any] | None = Field(
        default=None, description="Metadatos adicionales a actualizar."
    )
    contacto_id: UUID | None = Field(
        default=None, description="Actualizar el contacto asociado a la cita."
    )
    conversacion_id: UUID | None = Field(
        default=None, description="Actualizar la conversación asociada."
    )
    cancel_reason: str | None = Field(
        default=None, description="Motivo de cancelación (se usa junto con estado 'cancelada')."
    )


class DepartamentoCreatePayload(BaseModel):
    """Alta de departamento."""

    nombre: str = Field(..., min_length=1, max_length=120)
    departamento_padre_id: UUID | None = Field(default=None)


class DepartamentoUpdatePayload(BaseModel):
    """Actualización parcial de departamento."""

    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    departamento_padre_id: UUID | None = Field(default=None)


class PuestoCreatePayload(BaseModel):
    """Alta de puesto."""

    nombre: str = Field(..., min_length=1, max_length=120)
    descripcion: str | None = Field(default=None, max_length=400)
    departamento_id: UUID | None = Field(default=None)


class PuestoUpdatePayload(BaseModel):
    """Actualización parcial de puesto."""

    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    descripcion: str | None = Field(default=None, max_length=400)
    departamento_id: UUID | None = Field(default=None)


class EmpleadoCreatePayload(BaseModel):
    """Alta de empleado."""

    usuario_id: UUID = Field(..., description="Usuario Supabase asociado.")
    departamento_id: UUID | None = Field(default=None)
    puesto_id: UUID | None = Field(default=None)
    es_gestor: bool = Field(default=False)
    es_vendedor: bool = Field(default=False)


class EmpleadoUpdatePayload(BaseModel):
    """Actualización parcial de empleado."""

    departamento_id: UUID | None = Field(default=None)
    puesto_id: UUID | None = Field(default=None)
    es_gestor: bool | None = Field(default=None)
    es_vendedor: bool | None = Field(default=None)


class UsuarioCreatePayload(BaseModel):
    """Alta de usuario (metadatos)."""

    id: UUID = Field(..., description="UUID del usuario en auth.users.")
    correo: str = Field(..., min_length=3, max_length=320)
    nombre_completo: str | None = Field(default=None, max_length=200)
    telefono_e164: str | None = Field(
        default=None, pattern=r"^\+[0-9]{7,15}$", description="Número en formato E.164."
    )
    estado: Literal["activo", "inactivo"] = Field(default="activo")


class UsuarioUpdatePayload(BaseModel):
    """Actualización parcial de datos del usuario."""

    correo: str | None = Field(default=None, min_length=3, max_length=320)
    nombre_completo: str | None = Field(default=None, max_length=200)
    telefono_e164: str | None = Field(
        default=None, pattern=r"^\+[0-9]{7,15}$", description="Número en formato E.164."
    )
    estado: Literal["activo", "inactivo"] | None = Field(default=None)


class UsuarioRolesUpdatePayload(BaseModel):
    """Actualiza roles asignados a un usuario."""

    roles: list[UUID] = Field(default_factory=list, description="IDs de roles a mantener.")


class RolCreatePayload(BaseModel):
    """Alta de rol."""

    codigo: str = Field(..., min_length=2, max_length=50)
    nombre: str = Field(..., min_length=2, max_length=120)
    descripcion: str | None = Field(default=None, max_length=400)


class RolUpdatePayload(BaseModel):
    """Actualización parcial de rol."""

    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    descripcion: str | None = Field(default=None, max_length=400)


class LeadContactUpdate(BaseModel):
    """Actualización parcial del contacto asociado al lead."""

    nombre: str | None = Field(default=None, max_length=200)
    correo: str | None = Field(default=None, max_length=320)
    telefono: str | None = Field(default=None, max_length=32)


class LeadUpdatePayload(BaseModel):
    """Actualización parcial de una tarjeta de lead."""

    etapa_id: UUID | None = Field(default=None)
    asignado_a_usuario_id: UUID | None = Field(default=None)
    propietario_usuario_id: UUID | None = Field(default=None)
    lead_score: int | None = Field(default=None)
    probabilidad_override: float | None = Field(default=None)
    siguiente_accion: str | None = Field(default=None, max_length=400)
    tags: list[str] | None = Field(default=None)
    metadata: dict[str, Any] | None = Field(default=None)
    contacto: LeadContactUpdate | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


def _supabase_base_url() -> str:
    if not settings.supabase_url:
        raise HTTPException(status_code=500, detail="Supabase no está configurado")
    return settings.supabase_url.rstrip("/")


async def _sb_get(
    path: str,
    *,
    params: dict[str, str] | None = None,
    token: str | None = None,
    prefer: str | None = None,
) -> httpx.Response:
    base_url = _supabase_base_url()
    url = f"{base_url}{path}"
    headers: dict[str, str] = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        # Añade apikey pública si está disponible para pasar por el gateway de Supabase
        anon = getattr(settings, "supabase_anon", None)
        if anon:
            headers["apikey"] = anon  # type: ignore[assignment]
    elif settings.supabase_service_role:
        headers["apikey"] = settings.supabase_service_role
        headers["Authorization"] = f"Bearer {settings.supabase_service_role}"
    else:
        raise HTTPException(status_code=500, detail="Falta SUPABASE_SERVICE_ROLE")
    if prefer:
        headers["Prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.get(url, headers=headers, params=params)
    except httpx.RequestError:
        logger.exception("Error al conectar a Supabase")
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")


async def _sb_post(
    path: str,
    *,
    json: dict[str, Any] | None = None,
    token: str | None = None,
    prefer: str | None = None,
) -> httpx.Response:
    base_url = _supabase_base_url()
    url = f"{base_url}{path}"
    headers: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        anon = getattr(settings, "supabase_anon", None)
        if anon:
            headers["apikey"] = anon  # type: ignore[assignment]
    elif settings.supabase_service_role:
        headers["apikey"] = settings.supabase_service_role
        headers["Authorization"] = f"Bearer {settings.supabase_service_role}"
    else:
        raise HTTPException(status_code=500, detail="Falta SUPABASE_SERVICE_ROLE")
    if prefer:
        headers["Prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.post(url, headers=headers, json=json or {})
    except httpx.RequestError:
        logger.exception("Error al conectar a Supabase (POST)")
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")


async def _sb_patch(
    path: str,
    *,
    params: dict[str, str] | None = None,
    json: dict[str, Any] | None = None,
    token: str | None = None,
    prefer: str | None = None,
) -> httpx.Response:
    base_url = _supabase_base_url()
    url = f"{base_url}{path}"
    headers: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        anon = getattr(settings, "supabase_anon", None)
        if anon:
            headers["apikey"] = anon  # type: ignore[assignment]
    elif settings.supabase_service_role:
        headers["apikey"] = settings.supabase_service_role
        headers["Authorization"] = f"Bearer {settings.supabase_service_role}"
    else:
        raise HTTPException(status_code=500, detail="Falta SUPABASE_SERVICE_ROLE")
    if prefer:
        headers["Prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.patch(url, headers=headers, params=params, json=json or {})
    except httpx.RequestError:
        logger.exception("Error al conectar a Supabase (PATCH)")
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")


async def _sb_delete(
    path: str,
    *,
    params: dict[str, str] | None = None,
    token: str | None = None,
    prefer: str | None = None,
) -> httpx.Response:
    base_url = _supabase_base_url()
    url = f"{base_url}{path}"
    headers: dict[str, str] = {
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        anon = getattr(settings, "supabase_anon", None)
        if anon:
            headers["apikey"] = anon  # type: ignore[assignment]
    elif settings.supabase_service_role:
        headers["apikey"] = settings.supabase_service_role
        headers["Authorization"] = f"Bearer {settings.supabase_service_role}"
    else:
        raise HTTPException(status_code=500, detail="Falta SUPABASE_SERVICE_ROLE")
    if prefer:
        headers["Prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await client.delete(url, headers=headers, params=params)
    except httpx.RequestError:
        logger.exception("Error al conectar a Supabase (DELETE)")
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")


def _supabase_error(resp: httpx.Response, fallback: str) -> HTTPException:
    detail: str | None = None
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        detail = (
            payload.get("message")
            or payload.get("error_description")
            or payload.get("error")
            or payload.get("hint")
        )
    elif isinstance(payload, str):
        detail = payload
    if not detail:
        detail = resp.text.strip() or fallback
    status = resp.status_code if resp.status_code >= 400 else 502
    return HTTPException(status_code=status, detail=detail)


def _first_row(data: Any) -> Any:
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _content_range_total(header: str | None) -> int | None:
    if not header:
        return None
    try:
        _range, total = header.split("/")
    except ValueError:
        return None
    total = total.strip()
    if not total or total == "*":
        return None
    try:
        return int(total)
    except ValueError:
        return None


def _single_related(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _parse_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None
    return None


def _jwt_sub(jwt_token: str | None) -> str | None:
    """Extrae el `sub` del JWT (sin verificar firma; TODO: verificar HS256)."""
    if not jwt_token:
        return None
    try:
        import base64
        import json

        parts = jwt_token.split(".")
        if len(parts) != 3:
            return None

        def b64url_decode(segment: str) -> bytes:
            rem = len(segment) % 4
            if rem:
                segment += "=" * (4 - rem)
            return base64.urlsafe_b64decode(segment.encode())

        payload = json.loads(b64url_decode(parts[1]).decode("utf-8"))
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:  # pragma: no cover - best effort
        return None


def _jwt_verify_and_sub(jwt_token: str | None) -> str | None:
    """Verifica HS256 con el secret de Supabase (si está configurado) y retorna `sub`.

    Si no hay secret disponible, cae en la extracción sin verificación.
    """
    secret: str | None = (
        getattr(settings, "supabase_jwt_secret", None)  # type: ignore[attr-defined]
        or getattr(settings, "supabase_legacy_jwt_secret", None)  # type: ignore[attr-defined]
    )
    if not jwt_token:
        return None
    if not secret:
        return _jwt_sub(jwt_token)
    try:
        import base64
        import hashlib
        import hmac
        import json

        header_b64, payload_b64, signature_b64 = jwt_token.split(".")

        def b64url_decode(s: str) -> bytes:
            rem = len(s) % 4
            if rem:
                s += "=" * (4 - rem)
            return base64.urlsafe_b64decode(s.encode())

        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        provided = b64url_decode(signature_b64)
        if not hmac.compare_digest(expected, provided):
            return None

        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:  # pragma: no cover - best effort
        return None


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
        return True
    except Exception:
        return False


DATE_RANGE_PRESETS: dict[str, timedelta] = {
    "hoy": timedelta(days=1),
    "ayer": timedelta(days=1),
    "semana": timedelta(days=7),
    "quincena": timedelta(days=15),
    "mes": timedelta(days=30),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "ano": timedelta(days=365),
}


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_date_value(value: str | None, *, field: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:  # pragma: no cover - validaciones
            raise HTTPException(status_code=400, detail=f"{field}_invalid") from exc
    return _ensure_utc(parsed)


def _resolve_date_range(
    rango: str | None,
    desde: str | None,
    hasta: str | None,
) -> tuple[datetime | None, datetime | None]:
    now = datetime.now(timezone.utc)
    start: datetime | None = None
    end: datetime | None = None

    rango_norm = (rango or "").strip().lower()
    if rango_norm:
        if rango_norm in DATE_RANGE_PRESETS:
            if rango_norm == "hoy":
                start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
            elif rango_norm == "ayer":
                target = now - timedelta(days=1)
                start = target.replace(hour=0, minute=0, second=0, microsecond=0)
                end = target.replace(hour=23, minute=59, second=59, microsecond=999999)
            else:
                end = now
                start = now - DATE_RANGE_PRESETS[rango_norm]
        elif rango_norm == "fechas":
            start = _parse_date_value(desde, field="fecha_desde")
            end = _parse_date_value(hasta, field="fecha_hasta")
        else:
            raise HTTPException(status_code=400, detail="rango_invalid")
    else:
        start = _parse_date_value(desde, field="fecha_desde")
        end = _parse_date_value(hasta, field="fecha_hasta")

    if start and not end:
        end = now
    if start:
        start = _ensure_utc(start)
    if end:
        end = _ensure_utc(end)
        # Si el usuario proporcionó solo una fecha (sin hora), extiende al final del día
        if end.hour == 0 and end.minute == 0 and end.second == 0 and end.microsecond == 0:
            end = end + timedelta(days=1) - timedelta(microseconds=1)

    if start and end and start > end:
        raise HTTPException(status_code=400, detail="rango_fecha_invalido")

    return start, end


def _format_utc(dt: datetime) -> str:
    return _ensure_utc(dt).isoformat()


@router.get("/auth/permisos")
async def get_permissions(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    user_id = _jwt_verify_and_sub(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="auth_required")

    # Consulta roles del usuario via service_role
    params = {
        "select": "rol:roles(codigo,nombre)",
        "usuario_id": f"eq.{user_id}",
    }
    resp = await _sb_get("/rest/v1/usuarios_roles", params=params, token=None)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando permisos")
    data = resp.json() or []
    roles = [row.get("rol", {}).get("codigo") for row in data if isinstance(row, dict)]
    return {"ok": True, "roles": [r for r in roles if r]}


async def _require_admin(authorization: str | None) -> str:
    token = _parse_bearer(authorization)
    user_id = _jwt_verify_and_sub(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="auth_required")
    # Consulta roles del usuario via service_role
    params = {
        "select": "rol:roles(codigo)",
        "usuario_id": f"eq.{user_id}",
    }
    resp = await _sb_get("/rest/v1/usuarios_roles", params=params)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error validando roles")
    data = resp.json() or []
    is_admin = any((row.get("rol") or {}).get("codigo") == "admin" for row in data)
    if not is_admin:
        raise HTTPException(status_code=403, detail="forbidden")
    return user_id


@router.get("/config/personal")
async def cfg_personal(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    await _require_admin(authorization)

    resp_personal = await _sb_get(
        "/rest/v1/v_configuracion_personal",
        params={"select": "*", "order": "correo.asc"},
    )
    if resp_personal.status_code >= 400:
        raise _supabase_error(resp_personal, "Error consultando personal")

    resp_roles = await _sb_get(
        "/rest/v1/roles",
        params={"select": "id,codigo,nombre,descripcion,creado_en", "order": "codigo.asc"},
    )
    if resp_roles.status_code >= 400:
        raise _supabase_error(resp_roles, "Error consultando roles")

    resp_departamentos = await _sb_get(
        "/rest/v1/departamentos",
        params={"select": "id,nombre,departamento_padre_id,creado_en", "order": "nombre.asc"},
    )
    if resp_departamentos.status_code >= 400:
        raise _supabase_error(resp_departamentos, "Error consultando departamentos")

    resp_puestos = await _sb_get(
        "/rest/v1/puestos",
        params={"select": "id,nombre,descripcion,departamento_id,creado_en", "order": "nombre.asc"},
    )
    if resp_puestos.status_code >= 400:
        raise _supabase_error(resp_puestos, "Error consultando puestos")

    return {
        "ok": True,
        "personal": resp_personal.json() or [],
        "roles": resp_roles.json() or [],
        "departamentos": resp_departamentos.json() or [],
        "puestos": resp_puestos.json() or [],
    }


@router.post("/config/departamentos")
async def cfg_crear_departamento(
    payload: DepartamentoCreatePayload, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    resp = await _sb_post("/rest/v1/departamentos", json=body, prefer="return=representation")
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando departamento")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.patch("/config/departamentos/{departamento_id}")
async def cfg_actualizar_departamento(
    departamento_id: UUID,
    payload: DepartamentoUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return {"ok": True, "item": None}
    resp = await _sb_patch(
        "/rest/v1/departamentos",
        params={"id": f"eq.{departamento_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando departamento")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.delete("/config/departamentos/{departamento_id}")
async def cfg_eliminar_departamento(
    departamento_id: UUID, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/departamentos",
        params={"id": f"eq.{departamento_id}"},
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando departamento")
    deleted: Any | None = None
    if resp.content:
        try:
            deleted = resp.json()
        except ValueError:
            deleted = None
    return {"ok": True, "deleted": deleted}


@router.post("/config/puestos")
async def cfg_crear_puesto(
    payload: PuestoCreatePayload, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    resp = await _sb_post("/rest/v1/puestos", json=body, prefer="return=representation")
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando puesto")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.patch("/config/puestos/{puesto_id}")
async def cfg_actualizar_puesto(
    puesto_id: UUID,
    payload: PuestoUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return {"ok": True, "item": None}
    resp = await _sb_patch(
        "/rest/v1/puestos",
        params={"id": f"eq.{puesto_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando puesto")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.delete("/config/puestos/{puesto_id}")
async def cfg_eliminar_puesto(
    puesto_id: UUID, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/puestos", params={"id": f"eq.{puesto_id}"}, prefer="return=representation"
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando puesto")
    deleted: Any | None = None
    if resp.content:
        try:
            deleted = resp.json()
        except ValueError:
            deleted = None
    return {"ok": True, "deleted": deleted}


@router.post("/config/usuarios")
async def cfg_crear_usuario(
    payload: UsuarioCreatePayload, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if "telefono_e164" not in body or body["telefono_e164"] is None:
        body.pop("telefono_e164", None)
    resp = await _sb_post("/rest/v1/usuarios", json=body, prefer="return=representation")
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando usuario")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.patch("/config/usuarios/{usuario_id}")
async def cfg_actualizar_usuario(
    usuario_id: UUID,
    payload: UsuarioUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return {"ok": True, "item": None}
    resp = await _sb_patch(
        "/rest/v1/usuarios",
        params={"id": f"eq.{usuario_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando usuario")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.delete("/config/usuarios/{usuario_id}")
async def cfg_eliminar_usuario(
    usuario_id: UUID, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/usuarios",
        params={"id": f"eq.{usuario_id}"},
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando usuario")
    deleted: Any | None = None
    if resp.content:
        try:
            deleted = resp.json()
        except ValueError:
            deleted = None
    return {"ok": True, "deleted": deleted}


@router.put("/config/usuarios/{usuario_id}/roles")
async def cfg_actualizar_roles_usuario(
    usuario_id: UUID,
    payload: UsuarioRolesUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    desired_ids = {str(rol_id) for rol_id in payload.roles}

    resp_current = await _sb_get(
        "/rest/v1/usuarios_roles",
        params={"usuario_id": f"eq.{usuario_id}", "select": "rol_id"},
    )
    if resp_current.status_code >= 400:
        raise _supabase_error(resp_current, "Error consultando roles actuales")
    current_rows = resp_current.json() or []
    current_ids = {row.get("rol_id") for row in current_rows if row.get("rol_id")}

    to_add = sorted(desired_ids - current_ids)
    to_remove = sorted(current_ids - desired_ids)

    if to_add:
        payload_rows = [{"usuario_id": str(usuario_id), "rol_id": rol_id} for rol_id in to_add]
        resp_insert = await _sb_post(
            "/rest/v1/usuarios_roles",
            json=payload_rows,  # type: ignore[arg-type]
            prefer="return=representation",
        )
        if resp_insert.status_code >= 400:
            raise _supabase_error(resp_insert, "Error asignando roles")

    for rol_id in to_remove:
        resp_del = await _sb_delete(
            "/rest/v1/usuarios_roles",
            params={"usuario_id": f"eq.{usuario_id}", "rol_id": f"eq.{rol_id}"},
        )
        if resp_del.status_code >= 400:
            raise _supabase_error(resp_del, "Error removiendo roles")

    resp_updated = await _sb_get(
        "/rest/v1/usuarios_roles",
        params={
            "usuario_id": f"eq.{usuario_id}",
            "select": "rol:roles(id,codigo,nombre)",
            "order": "rol(codigo).asc",
        },
    )
    if resp_updated.status_code >= 400:
        raise _supabase_error(resp_updated, "Error consultando roles actualizados")
    return {"ok": True, "items": resp_updated.json() or []}


@router.post("/config/empleados")
async def cfg_crear_empleado(
    payload: EmpleadoCreatePayload, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    resp = await _sb_post("/rest/v1/empleados", json=body, prefer="return=representation")
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando empleado")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.patch("/config/empleados/{usuario_id}")
async def cfg_actualizar_empleado(
    usuario_id: UUID,
    payload: EmpleadoUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if body.get("es_vendedor") is False:
        body["ultimo_lead_asignado_en"] = None
    if not body:
        return {"ok": True, "item": None}
    resp = await _sb_patch(
        "/rest/v1/empleados",
        params={"usuario_id": f"eq.{usuario_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando empleado")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.delete("/config/empleados/{usuario_id}")
async def cfg_eliminar_empleado(
    usuario_id: UUID, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/empleados",
        params={"usuario_id": f"eq.{usuario_id}"},
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando empleado")
    deleted: Any | None = None
    if resp.content:
        try:
            deleted = resp.json()
        except ValueError:
            deleted = None
    return {"ok": True, "deleted": deleted}


@router.post("/config/roles")
async def cfg_crear_rol(
    payload: RolCreatePayload, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    resp = await _sb_post("/rest/v1/roles", json=body, prefer="return=representation")
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando rol")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.patch("/config/roles/{rol_id}")
async def cfg_actualizar_rol(
    rol_id: UUID,
    payload: RolUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        return {"ok": True, "item": None}
    resp = await _sb_patch(
        "/rest/v1/roles",
        params={"id": f"eq.{rol_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando rol")
    data = resp.json() or []
    return {"ok": True, "item": _first_row(data)}


@router.delete("/config/roles/{rol_id}")
async def cfg_eliminar_rol(
    rol_id: UUID, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/roles", params={"id": f"eq.{rol_id}"}, prefer="return=representation"
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando rol")
    deleted: Any | None = None
    if resp.content:
        try:
            deleted = resp.json()
        except ValueError:
            deleted = None
    return {"ok": True, "deleted": deleted}


@router.get("/config/agentes")
async def cfg_agentes(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    await _require_admin(authorization)
    params = {
        "select": "id,nombre,canal,modelo,temperatura,max_output_tokens,activo,creado_en",
        "order": "creado_en.desc",
        "limit": "200",
    }
    resp = await _sb_get("/rest/v1/agentes", params=params)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando agentes")
    return {"ok": True, "items": resp.json() or []}


@router.get("/config/canales")
async def cfg_canales(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    await _require_admin(authorization)
    # Recuento por canal a partir de conversaciones recientes (últimos 30 días)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    params = {"select": "canal", "ultimo_mensaje_en": f"gte.{since}", "limit": "10000"}
    resp = await _sb_get("/rest/v1/conversaciones", params=params)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando canales")
    counts: dict[str, int] = {}
    for row in resp.json() or []:
        c = row.get("canal")
        if c:
            counts[c] = counts.get(c, 0) + 1
    activos = sorted(counts.keys())
    return {"ok": True, "activos": activos, "conteo": counts}


@router.get("/leads")
async def listar_leads(
    q: str | None = Query(default=None),
    canal: str | None = Query(default=None),
    etapa: str | None = Query(default=None),
    tablero: str | None = Query(default=None),
    asignado: str | None = Query(default=None),
    propietario: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    direction: Literal["asc", "desc"] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    limit = max(1, min(limit, 500))
    offset = max(offset, 0)

    select_clause = (
        "id,tablero_id,etapa_id,contacto_id,canal,creado_en,actualizado_en,lead_score,"
        "probabilidad_override,tags,metadata,"
        "etapa:lead_etapas!lead_tarjetas_etapa_id_fkey(id,nombre,categoria,orden),"
        "tablero:lead_tableros!lead_tarjetas_tablero_id_fkey(id,nombre,slug),"
        "contacto:contactos!lead_tarjetas_contacto_id_fkey("
        "id,nombre_completo,correo,telefono_e164,estado,company_name,notes,necesidad_proposito,creado_en"
        "),"
        "asignado:usuarios!lead_tarjetas_asignado_a_usuario_id_fkey(id,nombre_completo,correo),"
        "propietario:usuarios!lead_tarjetas_propietario_usuario_id_fkey(id,nombre_completo,correo)"
    )

    params: dict[str, str] = {
        "select": select_clause,
        "limit": str(limit),
        "offset": str(offset),
    }

    sort_columns = {"creado_en", "actualizado_en", "lead_score"}
    direction_value = direction if direction in {"asc", "desc"} else "desc"
    sort_column = sort if sort in sort_columns else "creado_en"
    params["order"] = f"{sort_column}.{direction_value}"

    if canal:
        params["canal"] = f"eq.{canal.lower()}"
    if etapa:
        params["etapa_id"] = f"eq.{etapa}"
    if tablero:
        params["tablero_id"] = f"eq.{tablero}"
    if asignado:
        params["asignado_a_usuario_id"] = f"eq.{asignado}"
    if propietario:
        params["propietario_usuario_id"] = f"eq.{propietario}"

    if q:
        cleaned = " ".join(q.strip().split())
        sanitized = "".join(ch for ch in cleaned if ch.isalnum() or ch in "@._+- ")
        if sanitized:
            like = sanitized
            params["or"] = (
                f"(contacto_nombre.ilike.*{like}*,contacto_correo.ilike.*{like}*,"
                f"contacto_telefono.ilike.*{like}*)"
            )

    resp = await _sb_get(
        "/rest/v1/lead_tarjetas",
        params=params,
        token=token,
        prefer="count=exact",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando leads")

    raw = resp.json() or []
    if not isinstance(raw, list):
        raw = []

    items: list[dict[str, Any]] = []
    for row in raw:
        etapa_raw = _single_related(row.get("etapa"))
        etapa: dict[str, Any] | None = None
        if isinstance(etapa_raw, dict):
            etapa = {
                "id": etapa_raw.get("id"),
                "nombre": etapa_raw.get("nombre"),
                "categoria": etapa_raw.get("categoria"),
                "orden": etapa_raw.get("orden"),
            }

        tablero_raw = _single_related(row.get("tablero"))
        tablero_payload: dict[str, Any] | None = None
        if isinstance(tablero_raw, dict):
            tablero_payload = {
                "id": tablero_raw.get("id"),
                "nombre": tablero_raw.get("nombre"),
                "slug": tablero_raw.get("slug"),
            }

        contacto_raw = _single_related(row.get("contacto"))
        contacto_payload: dict[str, Any] = {}
        if isinstance(contacto_raw, dict):
            contacto_payload = {
                "id": contacto_raw.get("id") or row.get("contacto_id"),
                "nombre": contacto_raw.get("nombre_completo")
                or row.get("contacto_nombre")
                or "Sin nombre",
                "correo": contacto_raw.get("correo") or row.get("contacto_correo"),
                "telefono": contacto_raw.get("telefono_e164") or row.get("contacto_telefono"),
                "estado": contacto_raw.get("estado"),
                "company_name": contacto_raw.get("company_name"),
                "notes": contacto_raw.get("notes"),
                "necesidad": contacto_raw.get("necesidad_proposito"),
                "creado_en": contacto_raw.get("creado_en"),
            }
        else:
            contacto_payload = {
                "id": row.get("contacto_id"),
                "nombre": row.get("contacto_nombre") or "Sin nombre",
                "correo": row.get("contacto_correo"),
                "telefono": row.get("contacto_telefono"),
                "estado": None,
                "company_name": None,
                "notes": None,
                "necesidad": None,
                "creado_en": None,
            }

        asignado_raw = _single_related(row.get("asignado"))
        asignado_payload: dict[str, Any] | None = None
        if isinstance(asignado_raw, dict):
            asignado_payload = {
                "id": asignado_raw.get("id"),
                "nombre_completo": asignado_raw.get("nombre_completo"),
                "correo": asignado_raw.get("correo"),
            }

        propietario_raw = _single_related(row.get("propietario"))
        propietario_payload: dict[str, Any] | None = None
        if isinstance(propietario_raw, dict):
            propietario_payload = {
                "id": propietario_raw.get("id"),
                "nombre_completo": propietario_raw.get("nombre_completo"),
                "correo": propietario_raw.get("correo"),
            }

        metadata = row.get("metadata")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = None

        siguiente_accion: str | None = None
        if isinstance(metadata, dict):
            raw_value = metadata.get("siguiente_accion")
            if isinstance(raw_value, str):
                siguiente_accion = raw_value
        elif isinstance(metadata, list):
            siguiente_accion = None

        items.append(
            {
                "id": row.get("id"),
                "canal": row.get("canal"),
                "creado_en": row.get("creado_en"),
                "actualizado_en": row.get("actualizado_en"),
                "lead_score": row.get("lead_score"),
                "probabilidad": row.get("probabilidad_override"),
                "siguiente_accion": siguiente_accion,
                "metadata": metadata if isinstance(metadata, (dict, list)) else None,
                "tablero": tablero_payload,
                "etapa": etapa,
                "contacto": contacto_payload,
                "asignado": asignado_payload,
                "propietario": propietario_payload,
            }
        )

    total = _content_range_total(resp.headers.get("content-range"))
    computed_total = total if total is not None else offset + len(items)

    return {
        "ok": True,
        "items": items,
        "total": computed_total,
        "limit": limit,
        "offset": offset,
        "has_more": computed_total > offset + len(items),
    }


@router.patch("/leads/{lead_id}")
async def actualizar_lead(
    lead_id: UUID,
    payload: LeadUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    raw_data = payload.model_dump(exclude_unset=True)
    if not raw_data:
        return {"ok": True, "item": None}

    contact_payload = raw_data.pop("contacto", None)
    metadata_payload = raw_data.pop("metadata", None)
    siguiente_accion = raw_data.pop("siguiente_accion", None)

    if metadata_payload is not None and not isinstance(metadata_payload, dict):
        raise HTTPException(status_code=400, detail="metadata_invalid")
    if contact_payload is not None and not isinstance(contact_payload, dict):
        raise HTTPException(status_code=400, detail="contacto_invalid")

    need_existing = bool(contact_payload) or (
        metadata_payload is None and siguiente_accion is not None
    )
    existing_row: dict[str, Any] | None = None
    contacto_id: str | None = None

    current_metadata: dict[str, Any] | None = None
    if metadata_payload is not None:
        current_metadata = dict(metadata_payload)

    if need_existing:
        resp_existing = await _sb_get(
            "/rest/v1/lead_tarjetas",
            params={"id": f"eq.{lead_id}", "select": "id,contacto_id,metadata"},
        )
        if resp_existing.status_code >= 400:
            raise _supabase_error(resp_existing, "Error consultando lead")
        existing_rows = resp_existing.json() or []
        existing_row = _first_row(existing_rows)
        if not existing_row:
            raise HTTPException(status_code=404, detail="lead_not_found")
        contacto_id = existing_row.get("contacto_id")
        if current_metadata is None:
            meta_raw = existing_row.get("metadata")
            current_metadata = meta_raw if isinstance(meta_raw, dict) else {}

    if current_metadata is None and siguiente_accion is not None:
        current_metadata = {}

    if current_metadata is not None and siguiente_accion is not None:
        if siguiente_accion:
            current_metadata["siguiente_accion"] = siguiente_accion
        else:
            current_metadata.pop("siguiente_accion", None)

    updates: dict[str, Any] = {}

    etapa_id = raw_data.get("etapa_id")
    if etapa_id is not None:
        updates["etapa_id"] = str(etapa_id)

    if "asignado_a_usuario_id" in raw_data:
        asignado = raw_data.get("asignado_a_usuario_id")
        updates["asignado_a_usuario_id"] = str(asignado) if asignado else None

    if "propietario_usuario_id" in raw_data:
        propietario = raw_data.get("propietario_usuario_id")
        updates["propietario_usuario_id"] = str(propietario) if propietario else None

    if "lead_score" in raw_data:
        updates["lead_score"] = raw_data.get("lead_score")

    if "probabilidad_override" in raw_data:
        updates["probabilidad_override"] = raw_data.get("probabilidad_override")

    if "tags" in raw_data:
        tags_value = raw_data.get("tags")
        if tags_value is None:
            updates["tags"] = []
        elif isinstance(tags_value, list):
            updates["tags"] = tags_value
        else:
            raise HTTPException(status_code=400, detail="tags_invalid")

    if current_metadata is not None:
        updates["metadata"] = current_metadata

    contact_updates: dict[str, Any] = {}
    if isinstance(contact_payload, dict):
        if "nombre" in contact_payload:
            raw_nombre = contact_payload.get("nombre")
            if raw_nombre is None:
                contact_updates["nombre_completo"] = None
            else:
                nombre_value = str(raw_nombre).strip()
                contact_updates["nombre_completo"] = nombre_value or None
        if "correo" in contact_payload:
            raw_correo = contact_payload.get("correo")
            if raw_correo is None:
                contact_updates["correo"] = None
            else:
                correo_value = str(raw_correo).strip()
                contact_updates["correo"] = correo_value or None
        if "telefono" in contact_payload:
            raw_tel = contact_payload.get("telefono")
            if raw_tel is None:
                contact_updates["telefono_e164"] = None
            else:
                tel_value = str(raw_tel).strip()
                contact_updates["telefono_e164"] = tel_value or None

    if contact_updates:
        if not contacto_id:
            if not existing_row:
                resp_existing = await _sb_get(
                    "/rest/v1/lead_tarjetas",
                    params={"id": f"eq.{lead_id}", "select": "contacto_id"},
                )
                if resp_existing.status_code >= 400:
                    raise _supabase_error(resp_existing, "Error consultando lead")
                existing_rows = resp_existing.json() or []
                existing_row = _first_row(existing_rows)
                if not existing_row:
                    raise HTTPException(status_code=404, detail="lead_not_found")
                contacto_id = existing_row.get("contacto_id")
        if not contacto_id:
            raise HTTPException(status_code=400, detail="lead_without_contact")
        resp_contact = await _sb_patch(
            "/rest/v1/contactos",
            params={"id": f"eq.{contacto_id}"},
            json=contact_updates,
            prefer="return=representation",
        )
        if resp_contact.status_code >= 400:
            raise _supabase_error(resp_contact, "Error actualizando contacto")

    if not updates:
        return {"ok": True, "item": None}

    resp = await _sb_patch(
        "/rest/v1/lead_tarjetas",
        params={"id": f"eq.{lead_id}"},
        json=updates,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando lead")
    rows = resp.json() or []
    if not rows:
        raise HTTPException(status_code=404, detail="lead_not_found")
    item = _first_row(rows)
    return {"ok": True, "item": item}


@router.delete("/leads/{lead_id}")
async def eliminar_lead(
    lead_id: UUID,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    resp = await _sb_delete(
        "/rest/v1/lead_tarjetas",
        params={"id": f"eq.{lead_id}"},
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error eliminando lead")
    return {"ok": True}


@router.get("/inbox")
async def get_inbox(
    limit: int = Query(default=25, ge=1, le=200),
    canal: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    # Consultamos desde conversaciones para poder incluir el último mensaje y datos del contacto.
    select = (
        "id,canal,estado,prioridad,iniciada_en,ultimo_mensaje_en,no_leidos,"
        "contacto:contactos(nombre_completo,telefono_e164,correo,company_name,notes,necesidad_proposito),"
        "ultimo_mensaje:mensajes!conversaciones_ultimo_mensaje_fk(texto,direccion,creado_en)"
    )
    params: dict[str, str] = {
        "select": select,
        "order": "ultimo_mensaje_en.desc",
        "limit": str(limit),
    }
    if canal:
        params["canal"] = f"eq.{canal}"
    # Si no se especifica estado, mostramos abiertas o pendientes (como la vista en_curso)
    if estado:
        params["estado"] = f"eq.{estado}"
    else:
        params["estado"] = "in.(abierta,pendiente)"

    resp = await _sb_get("/rest/v1/conversaciones", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando inbox")
    raw = resp.json() or []
    ids = [row.get("id") for row in raw if row.get("id")]
    manual_lookup: dict[str, bool] = {}
    if ids:
        try:
            manual_lookup = await storage.fetch_manual_overrides(ids)
        except storage.StorageError:
            logger.exception("No se pudo recuperar estado manual de conversaciones")
    items: list[dict[str, Any]] = []
    for row in raw:
        contacto = row.get("contacto") or {}
        ultimo = row.get("ultimo_mensaje") or {}
        conv_id = row.get("id")
        items.append(
            {
                "id": conv_id,
                "canal": row.get("canal"),
                "estado": row.get("estado"),
                "prioridad": row.get("prioridad"),
                "iniciada_en": row.get("iniciada_en"),
                "ultimo_mensaje_en": row.get("ultimo_mensaje_en"),
                "no_leidos": row.get("no_leidos"),
                "contacto_nombre": contacto.get("nombre_completo"),
                "contacto_correo": contacto.get("correo"),
                "contacto_telefono": contacto.get("telefono_e164"),
                "contacto_empresa": contacto.get("company_name"),
                "contacto_notas": contacto.get("notes"),
                "contacto_necesidad_proposito": contacto.get("necesidad_proposito"),
                "preview": (ultimo.get("texto") or "")[:160],
                "preview_direccion": ultimo.get("direccion"),
                "preview_ts": ultimo.get("creado_en"),
                "manual_override": bool(manual_lookup.get(conv_id or "")),
            }
        )
    return {"ok": True, "items": items}


@router.post("/conversaciones/{conversacion_id}/marcar_leida")
async def mark_conversation_read(
    conversacion_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    # Intenta poner no_leidos = 0 (RLS aplica)
    base = _supabase_base_url()
    url = f"{base}/rest/v1/conversaciones?id=eq.{conversacion_id}"
    headers: dict[str, str] = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    anon = getattr(settings, "supabase_anon", None)
    if anon:
        headers["apikey"] = anon
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(url, headers=headers, json={"no_leidos": 0})
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="No fue posible marcar como leída")
    return {"ok": True}


def _auth_headers_for_user(token: str) -> dict[str, str]:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    anon = getattr(settings, "supabase_anon", None)
    if anon:
        headers["apikey"] = anon
    return headers


@router.post("/conversaciones/{conversacion_id}/cerrar")
async def close_conversation(
    conversacion_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    base = _supabase_base_url()
    url = f"{base}/rest/v1/conversaciones?id=eq.{conversacion_id}"
    headers = _auth_headers_for_user(token)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(url, headers=headers, json={"estado": "cerrada"})
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code, detail="No fue posible cerrar la conversación"
        )
    return {"ok": True}


@router.post("/conversaciones/{conversacion_id}/estado")
async def set_conversation_state(
    conversacion_id: str,
    new_estado: str = Query(..., pattern="^(abierta|pendiente|cerrada)$"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    base = _supabase_base_url()
    url = f"{base}/rest/v1/conversaciones?id=eq.{conversacion_id}"
    headers = _auth_headers_for_user(token)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(url, headers=headers, json={"estado": new_estado})
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="No fue posible cambiar el estado")
    return {"ok": True, "estado": new_estado}


@router.post("/conversaciones/{conversacion_id}/manual")
async def set_manual_mode(
    conversacion_id: str,
    payload: ManualOverridePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    try:
        await storage.set_manual_override(conversacion_id, payload.manual)
    except storage.StorageError as exc:
        detail = str(exc) or "No se pudo actualizar el modo manual"
        lowered = detail.lower()
        status = 502 if ("error de red" in lowered or "respondió error" in lowered) else 400
        raise HTTPException(status_code=status, detail=detail) from exc
    return {"ok": True, "manual": payload.manual}


@router.get("/conversaciones/{conversacion_id}/mensajes")
async def get_messages(
    conversacion_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    params = {
        "select": "id,direccion,tipo_contenido,texto,creado_en,datos",
        "conversacion_id": f"eq.{conversacion_id}",
        "order": "creado_en.asc",
        "limit": str(limit),
    }
    resp = await _sb_get("/rest/v1/mensajes", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando mensajes")
    raw = resp.json() or []
    items: list[dict[str, Any]] = []
    for row in raw:
        datos = row.get("datos") or {}
        sender_type = datos.get("sender_type")
        metadata = datos if isinstance(datos, dict) else {}
        items.append(
            {
                "id": row.get("id"),
                "direccion": row.get("direccion"),
                "tipo_contenido": row.get("tipo_contenido"),
                "texto": row.get("texto"),
                "creado_en": row.get("creado_en"),
                "sender_type": sender_type,
                "metadata": metadata or None,
            }
        )
    return {"ok": True, "items": items}


async def _fetch_tablero(token: str, tablero_hint: str | None) -> dict[str, Any]:
    params = {
        "select": "id,nombre,slug,descripcion,es_default,activo",
        "limit": "1",
    }
    if tablero_hint:
        params["slug"] = f"eq.{tablero_hint}"
        resp = await _sb_get("/rest/v1/lead_tableros", params=params, token=token)
        rows = resp.json() or []
        if not rows and _looks_like_uuid(tablero_hint):
            params.pop("slug", None)
            params["id"] = f"eq.{tablero_hint}"
            resp = await _sb_get("/rest/v1/lead_tableros", params=params, token=token)
            rows = resp.json() or []
        if not rows:
            raise HTTPException(status_code=404, detail="tablero_not_found")
        return rows[0]

    params.pop("slug", None)
    params["order"] = "es_default.desc,creado_en.asc"
    resp = await _sb_get("/rest/v1/lead_tableros", params=params, token=token)
    rows = resp.json() or []
    if not rows:
        raise HTTPException(status_code=404, detail="tablero_not_found")
    return rows[0]


async def _fetch_etapas(token: str, tablero_id: str) -> list[dict[str, Any]]:
    params = {
        "select": "id,tablero_id,codigo,nombre,orden,categoria,probabilidad,metadatos",
        "tablero_id": f"eq.{tablero_id}",
        "order": "orden.asc",
        "limit": "200",
    }
    resp = await _sb_get("/rest/v1/lead_etapas", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando etapas")
    raw = resp.json() or []
    if not isinstance(raw, list):
        return []
    return raw


async def _fetch_embudo_cards(
    token: str,
    tablero_id: str,
    canales: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, str] = {
        "select": (
            "id,tablero_id,etapa_id,contacto_id,contacto_nombre,contacto_estado,"
            "contacto_telefono,contacto_correo,conversacion_id,canal,conversacion_estado,"
            "ultimo_mensaje_en,lead_score,tags,metadata,probabilidad_override,resumen,intencion,"
            "sentimiento,siguiente_accion"
        ),
        "tablero_id": f"eq.{tablero_id}",
        "order": "ultimo_mensaje_en.desc",
    }
    and_filters: list[str] = []
    if canales:
        if len(canales) == 1:
            params["canal"] = f"eq.{canales[0]}"
        else:
            valores = ",".join(sorted({c for c in canales if c}))
            if valores:
                params["canal"] = f"in.({valores})"
    if date_from:
        and_filters.append(f"creado_en.gte.{_format_utc(date_from)}")
    if date_to:
        and_filters.append(f"creado_en.lte.{_format_utc(date_to)}")
    if and_filters:
        params["and"] = f"({','.join(and_filters)})"
    resp = await _sb_get("/rest/v1/embudo", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando embudo")
    raw = resp.json() or []
    if not isinstance(raw, list):
        return []
    return raw


async def _fetch_visitantes_total(
    token: str | None,
    canales: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> int:
    channels = {c for c in (canales or []) if c}
    if channels and "webchat" not in channels:
        return 0

    payload: dict[str, Any] = {}
    if date_from:
        payload["p_closed_after"] = _format_utc(date_from)
    if date_to:
        payload["p_closed_before"] = _format_utc(date_to)

    resp = await _sb_post(
        "/rest/v1/rpc/embudo_visitantes_contador",
        json=payload or None,
        token=token,
    )
    if resp.status_code >= 400:
        logger.error(
            "embudo.visitantes_total_failed",
            extra={"status": resp.status_code, "body": resp.text},
        )
        raise HTTPException(status_code=502, detail="Error consultando visitantes sin chat")

    data = resp.json()
    if isinstance(data, list):
        row = data[0] if data else {}
    elif isinstance(data, dict):
        row = data
    else:
        logger.warning("embudo.visitantes_total_unexpected_payload", extra={"data": data})
        return 0

    total_value = row.get("total")
    try:
        return int(total_value)
    except (TypeError, ValueError):
        logger.warning("embudo.visitantes_total_invalid_value", extra={"total": total_value})
        return 0


async def _fetch_dashboard_kpis(
    token: str,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if date_from:
        payload["p_from"] = _format_utc(date_from)
    if date_to:
        payload["p_to"] = _format_utc(date_to)
    resp = await _sb_post(
        "/rest/v1/rpc/dashboard_kpis",
        json=payload or None,
        token=token,
    )
    if resp.status_code >= 400:
        logger.error(
            "dashboard.kpis_failed",
            extra={"status": resp.status_code, "body": resp.text},
        )
        raise HTTPException(status_code=502, detail="Error consultando KPIs del dashboard")
    data = resp.json()
    if isinstance(data, dict):
        return data
    logger.warning("dashboard.kpis_unexpected_payload", extra={"data": data})
    return {}


def _stage_is_counter(meta: dict[str, Any] | None) -> bool:
    if not isinstance(meta, dict):
        return False
    value = str(meta.get("is_counter_only", "")).lower()
    return value in {"true", "1", "yes"}


def _stage_summary_key(stage: dict[str, Any]) -> str:
    meta = stage.get("metadatos") if isinstance(stage, dict) else None
    if isinstance(meta, dict):
        value = meta.get("categoria_resumen")
        if isinstance(value, str) and value:
            return value
    categoria = stage.get("categoria")
    return str(categoria) if categoria else "abierta"


def _map_card_payload(row: dict[str, Any]) -> dict[str, Any]:
    contacto = {
        "id": row.get("contacto_id"),
        "nombre": row.get("contacto_nombre"),
        "estado": row.get("contacto_estado"),
        "telefono": row.get("contacto_telefono"),
        "correo": row.get("contacto_correo"),
    }
    conversacion = {
        "id": row.get("conversacion_id"),
        "canal": row.get("canal"),
        "estado": row.get("conversacion_estado"),
        "ultimo_mensaje_en": row.get("ultimo_mensaje_en"),
    }
    insights = {
        "resumen": row.get("resumen"),
        "intencion": row.get("intencion"),
        "sentimiento": row.get("sentimiento"),
        "siguiente_accion": row.get("siguiente_accion"),
    }
    tags = row.get("tags")
    if tags is None:
        tags = []
    metadata = row.get("metadata") or {}
    return {
        "id": row.get("id"),
        "tablero_id": row.get("tablero_id"),
        "etapa_id": row.get("etapa_id"),
        "contacto": contacto,
        "conversacion": conversacion,
        "lead_score": row.get("lead_score"),
        "probabilidad": row.get("probabilidad_override"),
        "tags": tags,
        "metadata": metadata,
        "insights": insights,
    }


@router.get("/embudo/tableros")
async def listar_embudo_tableros(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    params = {
        "select": "id,nombre,slug,descripcion,es_default,activo",
        "order": "es_default.desc,creado_en.asc",
        "limit": "25",
    }
    resp = await _sb_get("/rest/v1/lead_tableros", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando tableros")
    raw = resp.json() or []
    items: list[dict[str, Any]] = []
    for row in raw:
        items.append(
            {
                "id": row.get("id"),
                "nombre": row.get("nombre"),
                "slug": row.get("slug"),
                "descripcion": row.get("descripcion"),
                "es_default": row.get("es_default"),
                "activo": row.get("activo"),
            }
        )
    return {"ok": True, "items": items}


@router.get("/embudo")
async def obtener_embudo(
    tablero: str | None = Query(default=None),
    canales: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    board = await _fetch_tablero(token, tablero)
    board_id = str(board.get("id"))

    channel_values: list[str] = []
    if canales:
        channel_values = [c.strip().lower() for c in canales.split(",") if c.strip()]

    date_from, date_to = _resolve_date_range(rango, desde, hasta)

    etapas = await _fetch_etapas(token, board_id)
    cards = await _fetch_embudo_cards(token, board_id, channel_values, date_from, date_to)
    visitantes_total = await _fetch_visitantes_total(token, channel_values, date_from, date_to)

    cards_by_stage: dict[str, list[dict[str, Any]]] = {}
    for row in cards:
        etapa_id = str(row.get("etapa_id"))
        if not etapa_id:
            continue
        cards_by_stage.setdefault(etapa_id, []).append(_map_card_payload(row))

    stages_payload: list[dict[str, Any]] = []
    category_totals: dict[str, int] = {}
    total_leads = 0

    for etapa in sorted(etapas, key=lambda e: (e.get("orden") is None, e.get("orden", 0))):
        etapa_id = str(etapa.get("id"))
        meta_raw = etapa.get("metadatos")
        meta_dict = meta_raw if isinstance(meta_raw, dict) else None
        counter_only = _stage_is_counter(meta_dict)
        etapa_cards = cards_by_stage.get(etapa_id, [])
        total_stage = visitantes_total if counter_only else len(etapa_cards)
        if not counter_only:
            total_leads += total_stage
        summary_key = _stage_summary_key(etapa)
        category_totals[summary_key] = category_totals.get(summary_key, 0) + total_stage

        stage_payload = {
            "id": etapa_id,
            "codigo": etapa.get("codigo"),
            "nombre": etapa.get("nombre"),
            "orden": etapa.get("orden"),
            "categoria": etapa.get("categoria"),
            "metadatos": meta_dict if meta_dict is not None else meta_raw,
            "total": total_stage,
            "cards": [] if counter_only else etapa_cards,
            "counter_only": counter_only,
        }
        if counter_only or summary_key != etapa.get("categoria"):
            stage_payload["categoria_resumen"] = summary_key
        stages_payload.append(stage_payload)

    totals = {
        "cards": total_leads,
        "por_categoria": category_totals,
        "visitors": visitantes_total,
    }

    return {
        "ok": True,
        "board": {
            "id": board.get("id"),
            "nombre": board.get("nombre"),
            "slug": board.get("slug"),
            "descripcion": board.get("descripcion"),
        },
        "stages": stages_payload,
        "totals": totals,
        "range": {
            "preset": (rango or "").strip().lower() or None,
            "from": _format_utc(date_from) if date_from else None,
            "to": _format_utc(date_to) if date_to else None,
        },
    }


@router.get("/embudo/visitantes")
async def embudo_visitantes(
    canales: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    channel_values: list[str] = []
    if canales:
        channel_values = [c.strip().lower() for c in canales.split(",") if c.strip()]

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    total = await _fetch_visitantes_total(token, channel_values, date_from, date_to)

    return {
        "ok": True,
        "total": total,
        "range": {
            "preset": (rango or "").strip().lower() or None,
            "from": _format_utc(date_from) if date_from else None,
            "to": _format_utc(date_to) if date_to else None,
        },
    }


@router.get("/dashboard/kpis")
async def dashboard_kpis_endpoint(
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    payload = await _fetch_dashboard_kpis(token, date_from, date_to)

    return {
        "ok": True,
        "kpis": payload,
        "range": {
            "preset": (rango or "").strip().lower() or None,
            "from": _format_utc(date_from) if date_from else None,
            "to": _format_utc(date_to) if date_to else None,
        },
    }


def _parse_bool_flag(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


@router.get("/visitas/webchat")
async def visitas_webchat_detalle(
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    con_chat: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    has_chat = _parse_bool_flag(con_chat)
    state = estado.strip() if estado else None
    search = q.strip() if q else None

    try:
        payload = await storage.fetch_webchat_visitas_detalle(
            date_from=date_from,
            date_to=date_to,
            has_chat=has_chat,
            state=state,
            search=search,
            limit=limit,
            offset=offset,
        )
    except storage.StorageError as exc:
        logger.exception("visitas.webchat_fetch_failed")
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando visitas"
        ) from exc

    items = payload.get("items") if isinstance(payload, dict) else []
    total = int(payload.get("total") or 0) if isinstance(payload, dict) else 0
    total_chat = int(payload.get("total_chat") or 0) if isinstance(payload, dict) else 0
    total_no_chat = int(payload.get("total_no_chat") or 0) if isinstance(payload, dict) else 0

    return {
        "ok": True,
        "items": items,
        "total": total,
        "totals": {
            "con_chat": total_chat,
            "sin_chat": total_no_chat,
        },
        "pagination": {
            "limit": limit,
            "offset": offset,
            "returned": len(items) if isinstance(items, list) else 0,
        },
        "filters": {
            "con_chat": has_chat,
            "estado": state,
            "search": search,
        },
        "range": _build_range_payload(rango, date_from, date_to),
    }


def _build_range_payload(
    rango: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, str | None]:
    return {
        "preset": (rango or "").strip().lower() or None,
        "from": _format_utc(date_from) if date_from else None,
        "to": _format_utc(date_to) if date_to else None,
    }


@router.get("/agenda/demos")
async def agenda_demos(
    limit: int = Query(default=100, ge=1, le=500),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    params: dict[str, str] = {
        "select": "*",
        "order": "start_at.asc",
        "limit": str(limit),
    }
    and_filters: list[str] = []
    if date_from:
        and_filters.append(f"start_at.gte.{_format_utc(date_from)}")
    if date_to:
        and_filters.append(f"start_at.lte.{_format_utc(date_to)}")
    if and_filters:
        params["and"] = f"({','.join(and_filters)})"

    estado_values = [
        val.strip().lower() for val in (estado or "").split(",") if val.strip()
    ] or None
    if estado_values:
        if len(estado_values) == 1:
            params["estado"] = f"eq.{estado_values[0]}"
        else:
            params["estado"] = f"in.({','.join(sorted(set(estado_values)))})"

    provider_values = [
        val.strip().lower() for val in (provider or "").split(",") if val.strip()
    ] or None
    if provider_values:
        if len(provider_values) == 1:
            params["provider"] = f"eq.{provider_values[0]}"
        else:
            params["provider"] = f"in.({','.join(sorted(set(provider_values)))})"

    resp = await _sb_get("/rest/v1/panel_agenda_demos", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando agenda de demos")

    raw = resp.json() or []
    return {
        "ok": True,
        "items": raw,
        "range": _build_range_payload(rango, date_from, date_to),
        "filters": {
            "estado": estado_values,
            "provider": provider_values,
        },
    }


_DEMO_ESTADOS = {"pendiente", "confirmada", "reprogramada", "cancelada", "realizada"}
_DEMO_PROVIDERS = {"hosting", "google"}


def _normalize_demo_estado(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in _DEMO_ESTADOS:
        raise HTTPException(status_code=400, detail="estado_invalid")
    return normalized


def _normalize_demo_provider(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in _DEMO_PROVIDERS:
        raise HTTPException(status_code=400, detail="provider_invalid")
    return normalized


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return _format_utc(_ensure_utc(value))


def _validate_metadata(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="metadata_invalid")
    return value


def _clean_payload(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


def _uuid_to_str(value: UUID | str | None) -> str | None:
    if value is None:
        return None
    return str(value)


async def _resolve_lead_card_context(tarjeta_id: str, token: str) -> dict[str, Any]:
    params = {
        "select": "id,contacto_id,conversacion_id",
        "id": f"eq.{tarjeta_id}",
        "limit": "1",
    }
    resp = await _sb_get("/rest/v1/lead_tarjetas", params=params, token=token)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Error consultando lead asociado")
    rows = resp.json() or []
    if not rows:
        raise HTTPException(status_code=404, detail="lead_not_found")
    return rows[0]


async def _prepare_create_demo_payload(
    payload: DemoAppointmentCreatePayload,
    token: str,
    user_id: str | None,
) -> dict[str, Any]:
    tarjeta_id = _uuid_to_str(payload.tarjeta_id)
    contacto_id = payload.contacto_id
    conversacion_id = payload.conversacion_id

    if contacto_id is None or conversacion_id is None:
        context = await _resolve_lead_card_context(tarjeta_id, token)
        if contacto_id is None:
            contacto_id = context.get("contacto_id")
        if conversacion_id is None:
            conversacion_id = context.get("conversacion_id")

    if contacto_id is None:
        raise HTTPException(status_code=400, detail="contacto_requerido")

    estado = _normalize_demo_estado(payload.estado)
    provider = _normalize_demo_provider(payload.provider)
    metadata_value = _validate_metadata(payload.metadata)

    data = {
        "tarjeta_id": tarjeta_id,
        "contacto_id": _uuid_to_str(contacto_id),
        "conversacion_id": _uuid_to_str(conversacion_id),
        "start_at": _serialize_datetime(payload.start_at),
        "end_at": _serialize_datetime(payload.end_at),
        "timezone": payload.timezone,
        "provider": provider,
        "provider_calendar_id": payload.provider_calendar_id,
        "provider_event_id": payload.provider_event_id,
        "meeting_url": payload.meeting_url,
        "location": payload.location,
        "notes": payload.notes,
        "metadata": metadata_value,
        "estado": estado,
        "created_by": user_id,
        "updated_by": user_id,
    }
    return _clean_payload(data)


def _prepare_update_demo_payload(
    payload: DemoAppointmentUpdatePayload,
    user_id: str | None,
) -> dict[str, Any]:
    metadata_value = _validate_metadata(payload.metadata)
    estado = _normalize_demo_estado(payload.estado)
    provider = _normalize_demo_provider(payload.provider)

    data = {
        "start_at": _serialize_datetime(payload.start_at),
        "end_at": _serialize_datetime(payload.end_at),
        "timezone": payload.timezone,
        "estado": estado,
        "provider": provider,
        "provider_calendar_id": payload.provider_calendar_id,
        "provider_event_id": payload.provider_event_id,
        "meeting_url": payload.meeting_url,
        "location": payload.location,
        "notes": payload.notes,
        "metadata": metadata_value,
        "contacto_id": _uuid_to_str(payload.contacto_id),
        "conversacion_id": _uuid_to_str(payload.conversacion_id),
        "cancel_reason": payload.cancel_reason,
        "updated_by": user_id,
    }
    return _clean_payload(data)


@router.post("/agenda/demos", status_code=201)
async def create_demo_appointment(
    payload: DemoAppointmentCreatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    user_id = _jwt_verify_and_sub(token)

    body = await _prepare_create_demo_payload(payload, token, user_id)
    if "start_at" not in body:
        raise HTTPException(status_code=400, detail="start_at_requerido")

    resp = await _sb_post(
        "/rest/v1/lead_citas_demo",
        json=body,
        token=token,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        logger.error(
            "agenda.demo_create_failed",
            extra={"status": resp.status_code, "body": resp.text},
        )
        raise HTTPException(status_code=502, detail="Error creando cita demo")

    rows = resp.json() or []
    if not rows:
        raise HTTPException(status_code=502, detail="Respuesta inesperada creando cita demo")

    return {"ok": True, "item": rows[0]}


@router.patch("/agenda/demos/{cita_id}")
async def update_demo_appointment(
    cita_id: UUID,
    payload: DemoAppointmentUpdatePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    user_id = _jwt_verify_and_sub(token)

    body = _prepare_update_demo_payload(payload, user_id)
    non_meta_keys = {k for k in body.keys() if k not in {"updated_by"}}
    if not non_meta_keys:
        raise HTTPException(status_code=400, detail="no_changes")

    params = {"id": f"eq.{cita_id}", "limit": "1"}
    resp = await _sb_patch(
        "/rest/v1/lead_citas_demo",
        params=params,
        json=body,
        token=token,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        logger.error(
            "agenda.demo_update_failed",
            extra={"status": resp.status_code, "body": resp.text, "cita_id": str(cita_id)},
        )
        raise HTTPException(status_code=502, detail="Error actualizando cita demo")

    rows = resp.json() or []
    if not rows:
        raise HTTPException(status_code=404, detail="cita_not_found")

    return {"ok": True, "item": rows[0]}


@router.delete("/agenda/demos/{cita_id}")
async def delete_demo_appointment(
    cita_id: UUID,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    params = {"id": f"eq.{cita_id}"}
    resp = await _sb_delete(
        "/rest/v1/lead_citas_demo",
        params=params,
        token=token,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        logger.error(
            "agenda.demo_delete_failed",
            extra={"status": resp.status_code, "body": resp.text, "cita_id": str(cita_id)},
        )
        raise HTTPException(status_code=502, detail="Error eliminando cita demo")

    if resp.status_code == 200:
        deleted = resp.json() or []
        if not deleted:
            raise HTTPException(status_code=404, detail="cita_not_found")

    return {"ok": True}


def _ensure_state_code(value: str) -> str:
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not digits:
        raise HTTPException(status_code=400, detail="estado_invalid")
    return digits.zfill(2)


def _parse_channels_param(canales: str | None) -> list[str]:
    if not canales:
        return []
    values: list[str] = []
    for chunk in canales.split(","):
        val = chunk.strip().lower()
        if val:
            values.append(val)
    return values


@router.get("/kpis/leads/geo/estados")
async def leads_geo_estados() -> dict[str, Any]:
    try:
        geojson = leads_geo.load_states_geojson()
    except FileNotFoundError as exc:  # pragma: no cover - depende de despliegue
        logger.exception("geo.states_missing")
        raise HTTPException(status_code=500, detail="geojson_missing") from exc
    return {"ok": True, "geojson": geojson}


@router.get("/kpis/leads/geo/municipios/{estado}")
async def leads_geo_municipios(estado: str) -> dict[str, Any]:
    code = _ensure_state_code(estado)
    try:
        geojson = leads_geo.load_state_municipalities_geojson(code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="estado_not_found") from exc
    return {"ok": True, "geojson": geojson}


@router.get("/kpis/leads/geo/paises")
async def leads_geo_paises() -> dict[str, Any]:
    try:
        geojson = leads_geo.load_world_countries_geojson()
    except FileNotFoundError as exc:  # pragma: no cover - depende del despliegue
        logger.exception("geo.world_missing")
        raise HTTPException(status_code=500, detail="geojson_missing") from exc
    return {"ok": True, "geojson": geojson}


@router.get("/kpis/visitantes/estados")
async def visitantes_estado_metrics(
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    try:
        payload = await storage.fetch_visitantes_estados(date_from=date_from, date_to=date_to)
    except storage.StorageError as exc:
        logger.exception("visitantes.estados_fetch_failed")
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando visitantes"
        ) from exc

    raw_items = payload.get("items") if isinstance(payload, dict) else []
    raw_totals = payload.get("totals") if isinstance(payload, dict) else {}

    items: list[dict[str, Any]] = []
    if isinstance(raw_items, list):
        for row in raw_items:
            if not isinstance(row, dict):
                continue
            code = row.get("cve_ent")
            if not code:
                continue
            total = int(row.get("total") or 0)
            por_canal = row.get("por_canal")
            if not isinstance(por_canal, dict):
                por_canal = {"visitantes": total}
            items.append(
                {
                    "cve_ent": str(code).zfill(2),
                    "nombre": row.get("nombre"),
                    "total": total,
                    "por_canal": por_canal,
                }
            )

    total = int((raw_totals or {}).get("total") or 0)
    ubicados = int((raw_totals or {}).get("ubicados") or 0)
    sin_ubicacion = int((raw_totals or {}).get("sin_ubicacion") or (total - ubicados))

    return {
        "ok": True,
        "items": items,
        "total_contactos": total,
        "total_ubicados": ubicados,
        "sin_ubicacion": sin_ubicacion,
        "range": _build_range_payload(rango, date_from, date_to),
    }


@router.get("/kpis/visitantes/paises")
async def visitantes_paises_metrics(
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)

    try:
        payload = await storage.fetch_visitantes_paises(date_from=date_from, date_to=date_to)
    except storage.StorageError as exc:
        logger.exception("visitantes.paises_fetch_failed")
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando visitantes por país"
        ) from exc

    raw_items = payload.get("items") if isinstance(payload, dict) else []
    totals = payload.get("totals") if isinstance(payload, dict) else {}

    items: list[dict[str, Any]] = []
    if isinstance(raw_items, list):
        for row in raw_items:
            if not isinstance(row, dict):
                continue
            country_code = str(row.get("country_code") or "").upper()
            total = int(row.get("total") or 0)
            if total <= 0:
                continue
            item: dict[str, Any] = {
                "country_code": country_code or "UNK",
                "nombre": row.get("nombre") or country_code or "Desconocido",
                "total": total,
            }
            if row.get("avg_lat") is not None and row.get("avg_lng") is not None:
                try:
                    item["avg_lat"] = float(row["avg_lat"])
                    item["avg_lng"] = float(row["avg_lng"])
                except (TypeError, ValueError):
                    pass
            with_coords = row.get("with_coordinates")
            if with_coords is not None:
                try:
                    item["with_coordinates"] = int(with_coords)
                except (TypeError, ValueError):
                    item["with_coordinates"] = None
            items.append(item)

    return {
        "ok": True,
        "items": items,
        "totals": {
            "total": int((totals or {}).get("total") or 0),
            "ubicados": int((totals or {}).get("ubicados") or 0),
            "sin_pais": int((totals or {}).get("sin_pais") or 0),
        },
        "range": _build_range_payload(rango, date_from, date_to),
    }


@router.get("/kpis/visitantes/estados/{estado}/municipios")
async def visitantes_municipios_metrics(
    estado: str,
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    state_code = _ensure_state_code(estado)
    date_from, date_to = _resolve_date_range(rango, desde, hasta)

    try:
        payload = await storage.fetch_visitantes_municipios(
            state_code, date_from=date_from, date_to=date_to
        )
    except storage.StorageError as exc:
        logger.exception("visitantes.municipios_fetch_failed", extra={"estado": state_code})
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando visitantes"
        ) from exc

    raw_items = payload.get("items") if isinstance(payload, dict) else []
    raw_totals = payload.get("totals") if isinstance(payload, dict) else {}
    estado_info = payload.get("estado") if isinstance(payload, dict) else {}

    items: list[dict[str, Any]] = []
    if isinstance(raw_items, list):
        for row in raw_items:
            if not isinstance(row, dict):
                continue
            cvegeo = row.get("cvegeo")
            if not cvegeo:
                continue
            total = int(row.get("total") or 0)
            por_canal = row.get("por_canal")
            if not isinstance(por_canal, dict):
                por_canal = {"visitantes": total}
            items.append(
                {
                    "cvegeo": str(cvegeo).zfill(5),
                    "nombre": row.get("nombre"),
                    "total": total,
                    "por_canal": por_canal,
                }
            )

    total = int((raw_totals or {}).get("total") or 0)
    ubicados = int((raw_totals or {}).get("ubicados") or 0)
    sin_ubicacion = int((raw_totals or {}).get("sin_ubicacion") or (total - ubicados))

    estado_payload: dict[str, Any] | None = None
    if isinstance(estado_info, dict) and estado_info:
        nombre = estado_info.get("nombre") or estado_info.get("nom_ent")
        estado_payload = {
            "cve_ent": str(estado_info.get("cve_ent") or state_code).zfill(2),
            "nombre": nombre or leads_geo.state_display_name(state_code),
        }
    else:
        estado_payload = {
            "cve_ent": state_code,
            "nombre": leads_geo.state_display_name(state_code),
        }

    return {
        "ok": True,
        "estado": estado_payload,
        "items": items,
        "total_contactos": total,
        "total_ubicados": ubicados,
        "sin_ubicacion": sin_ubicacion,
        "range": _build_range_payload(rango, date_from, date_to),
    }


@router.get("/kpis/leads/estados")
async def leads_estado_metrics(
    canales: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    channel_values = _parse_channels_param(canales)
    include_visitantes = "visitantes" in channel_values
    lead_channels = [value for value in channel_values if value != "visitantes"]

    date_from, date_to = _resolve_date_range(rango, desde, hasta)

    leads_payload: dict[str, Any] = {"items": [], "totals": {}}
    should_fetch_leads = not channel_values or bool(lead_channels)
    if should_fetch_leads:
        lead_filter = lead_channels if lead_channels else None
        try:
            leads_payload = await storage.fetch_leads_states(
                channels=lead_filter,
                date_from=date_from,
                date_to=date_to,
            )
        except storage.StorageError as exc:
            logger.exception("leads.estados_fetch_failed")
            raise HTTPException(
                status_code=502, detail=str(exc) or "Error consultando leads"
            ) from exc

    visitantes_payload: dict[str, Any] = {"items": [], "totals": {}}
    if include_visitantes:
        try:
            visitantes_payload = await storage.fetch_visitantes_estados(
                date_from=date_from,
                date_to=date_to,
            )
        except storage.StorageError as exc:
            logger.exception("visitantes.estados_merge_failed")
            raise HTTPException(
                status_code=502, detail=str(exc) or "Error consultando visitantes"
            ) from exc

    def _to_int(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def _extract_totals(payload: dict[str, Any]) -> tuple[int, int, int]:
        totals = payload.get("totals") if isinstance(payload, dict) else {}
        if not isinstance(totals, dict):
            return 0, 0, 0
        total_val = _to_int(totals.get("total"))
        ubicados_val = _to_int(totals.get("ubicados"))
        sin_raw = totals.get("sin_ubicacion")
        sin_val = _to_int(sin_raw)
        if sin_raw is None and total_val and ubicados_val:
            sin_val = max(0, total_val - ubicados_val)
        return total_val, ubicados_val, sin_val

    items_map: dict[str, dict[str, Any]] = {}

    def _merge_state_rows(rows: Any) -> None:
        if not isinstance(rows, list):
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            code = row.get("cve_ent")
            if code is None:
                continue
            key = str(code).zfill(2)
            total = _to_int(row.get("total"))
            entry = items_map.setdefault(
                key,
                {"cve_ent": key, "nombre": row.get("nombre"), "total": 0, "por_canal": {}},
            )
            if not entry.get("nombre") and row.get("nombre"):
                entry["nombre"] = row.get("nombre")
            entry["total"] += total
            breakdown = row.get("por_canal")
            if isinstance(breakdown, dict):
                for channel, value in breakdown.items():
                    ch_key = str(channel)
                    entry["por_canal"][ch_key] = entry["por_canal"].get(ch_key, 0) + _to_int(value)

    _merge_state_rows(leads_payload.get("items"))
    _merge_state_rows(visitantes_payload.get("items"))

    items = [
        {
            "cve_ent": data["cve_ent"],
            "nombre": data.get("nombre"),
            "total": data["total"],
            "por_canal": data["por_canal"],
        }
        for data in sorted(items_map.values(), key=lambda item: item["cve_ent"])
    ]

    lead_totals = _extract_totals(leads_payload)
    visitante_totals = _extract_totals(visitantes_payload)

    total_contactos = lead_totals[0] + visitante_totals[0]
    total_ubicados = lead_totals[1] + visitante_totals[1]
    sin_ubicacion = lead_totals[2] + visitante_totals[2]

    return {
        "ok": True,
        "items": items,
        "total_contactos": total_contactos,
        "total_ubicados": total_ubicados,
        "sin_ubicacion": sin_ubicacion,
        "range": _build_range_payload(rango, date_from, date_to),
    }


@router.get("/kpis/leads/estados/{estado}/municipios")
async def leads_municipios_metrics(
    estado: str,
    canales: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    state_code = _ensure_state_code(estado)
    channel_values = _parse_channels_param(canales)
    include_visitantes = "visitantes" in channel_values
    lead_channels = [value for value in channel_values if value != "visitantes"]

    date_from, date_to = _resolve_date_range(rango, desde, hasta)

    leads_payload: dict[str, Any] = {"items": [], "totals": {}, "estado": None}
    should_fetch_leads = not channel_values or bool(lead_channels)
    if should_fetch_leads:
        lead_filter = lead_channels if lead_channels else None
        try:
            leads_payload = await storage.fetch_leads_municipios(
                state_code,
                channels=lead_filter,
                date_from=date_from,
                date_to=date_to,
            )
        except storage.StorageError as exc:
            logger.exception("leads.municipios_fetch_failed", extra={"estado": state_code})
            raise HTTPException(
                status_code=502, detail=str(exc) or "Error consultando leads"
            ) from exc

    visitantes_payload: dict[str, Any] = {"items": [], "totals": {}, "estado": None}
    if include_visitantes:
        try:
            visitantes_payload = await storage.fetch_visitantes_municipios(
                state_code,
                date_from=date_from,
                date_to=date_to,
            )
        except storage.StorageError as exc:
            logger.exception("visitantes.municipios_merge_failed", extra={"estado": state_code})
            raise HTTPException(
                status_code=502, detail=str(exc) or "Error consultando visitantes"
            ) from exc

    def _to_int(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def _extract_totals(payload: dict[str, Any]) -> tuple[int, int, int]:
        totals = payload.get("totals") if isinstance(payload, dict) else {}
        if not isinstance(totals, dict):
            return 0, 0, 0
        total_val = _to_int(totals.get("total"))
        ubicados_val = _to_int(totals.get("ubicados"))
        sin_raw = totals.get("sin_ubicacion")
        sin_val = _to_int(sin_raw)
        if sin_raw is None and total_val and ubicados_val:
            sin_val = max(0, total_val - ubicados_val)
        return total_val, ubicados_val, sin_val

    items_map: dict[str, dict[str, Any]] = {}

    def _merge_municipio_rows(rows: Any) -> None:
        if not isinstance(rows, list):
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            cvegeo = row.get("cvegeo")
            if not cvegeo:
                continue
            key = str(cvegeo).zfill(5)
            total = _to_int(row.get("total"))
            entry = items_map.setdefault(
                key,
                {"cvegeo": key, "nombre": row.get("nombre"), "total": 0, "por_canal": {}},
            )
            if not entry.get("nombre") and row.get("nombre"):
                entry["nombre"] = row.get("nombre")
            entry["total"] += total
            breakdown = row.get("por_canal")
            if isinstance(breakdown, dict):
                for channel, value in breakdown.items():
                    ch_key = str(channel)
                    entry["por_canal"][ch_key] = entry["por_canal"].get(ch_key, 0) + _to_int(value)

    _merge_municipio_rows(leads_payload.get("items"))
    _merge_municipio_rows(visitantes_payload.get("items"))

    items = [
        {
            "cvegeo": data["cvegeo"],
            "nombre": data.get("nombre"),
            "total": data["total"],
            "por_canal": data["por_canal"],
        }
        for data in sorted(items_map.values(), key=lambda item: item["cvegeo"])
    ]

    lead_totals = _extract_totals(leads_payload)
    visitante_totals = _extract_totals(visitantes_payload)

    total_contactos = lead_totals[0] + visitante_totals[0]
    total_ubicados = lead_totals[1] + visitante_totals[1]
    sin_ubicacion = lead_totals[2] + visitante_totals[2]

    estado_info = leads_payload.get("estado")
    if include_visitantes and (not isinstance(estado_info, dict) or not estado_info):
        estado_info = visitantes_payload.get("estado")

    if isinstance(estado_info, dict) and estado_info:
        estado_payload = {
            "cve_ent": str(estado_info.get("cve_ent") or state_code).zfill(2),
            "nombre": estado_info.get("nombre")
            or estado_info.get("nom_ent")
            or leads_geo.state_display_name(state_code),
        }
    else:
        estado_payload = {
            "cve_ent": state_code,
            "nombre": leads_geo.state_display_name(state_code),
        }

    return {
        "ok": True,
        "estado": estado_payload,
        "items": items,
        "total_contactos": total_contactos,
        "total_ubicados": total_ubicados,
        "sin_ubicacion": sin_ubicacion,
        "range": _build_range_payload(rango, date_from, date_to),
    }


@router.get("/panel/env.js")
async def panel_env_js() -> Response:
    """Expone configuración pública mínima para el panel.

    Usa variables del backend para evitar editar archivos estáticos en producción.
    """
    url = (settings.supabase_url or "").rstrip("/")
    anon = getattr(settings, "supabase_anon", None) or ""
    body = "window.SUPABASE_URL = '" + url + "';\n" "window.SUPABASE_ANON_KEY = '" + anon + "';\n"
    return Response(content=body, media_type="application/javascript")
