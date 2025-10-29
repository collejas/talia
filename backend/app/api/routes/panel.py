"""Rutas del panel: permisos, inbox y mensajes.

Nota: Para resultados sujetos a RLS, se reenvía el JWT del usuario en la
cabecera Authorization hacia Supabase REST. Para resolver permisos/roles, se
usa service_role en el backend y se extrae el `sub` del JWT (sin verificar).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.services import leads_geo, storage

router = APIRouter(prefix="", tags=["panel"])

logger = get_logger(__name__)


class ManualOverridePayload(BaseModel):
    """Payload para activar/desactivar modo manual."""

    manual: bool = Field(..., description="True para pausar al asistente")


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
