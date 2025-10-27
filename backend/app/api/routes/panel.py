"""Rutas del panel: permisos, inbox y mensajes.

Nota: Para resultados sujetos a RLS, se reenvía el JWT del usuario en la
cabecera Authorization hacia Supabase REST. Para resolver permisos/roles, se
usa service_role en el backend y se extrae el `sub` del JWT (sin verificar).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.services import storage

router = APIRouter(prefix="", tags=["panel"])

logger = get_logger(__name__)


class PanelSendMessagePayload(BaseModel):
    """Payload para que un operador envíe un mensaje a un cliente."""

    content: str = Field(..., min_length=1, max_length=2000, description="Contenido del mensaje")
    metadata: dict[str, Any] | None = Field(default=None, description="Metadatos opcionales")


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


@router.post("/conversaciones/{conversacion_id}/mensajes")
async def send_panel_message(
    conversacion_id: str,
    payload: PanelSendMessagePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="content_required")

    try:
        info = await storage.fetch_webchat_conversation_info(conversacion_id)
    except storage.StorageError as exc:
        detail = str(exc) or "No se pudo recuperar la conversación"
        lowered = detail.lower()
        if "error de red" in lowered or "respondió error" in lowered:
            raise HTTPException(status_code=502, detail=detail) from exc
        if "no se encontró" in lowered or "no encontrada" in lowered:
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc

    metadata = {"sender_type": "human_agent", "source": "panel"}
    if payload.metadata:
        metadata.update(payload.metadata)

    try:
        record = await storage.record_webchat_message(
            session_id=info.session_id,
            author="human_agent",
            content=payload.content.strip(),
            metadata=metadata,
        )
    except storage.StorageError as exc:
        detail = str(exc) or "No se pudo enviar el mensaje"
        lowered = detail.lower()
        status = 502 if ("error de red" in lowered or "respondió error" in lowered) else 400
        raise HTTPException(status_code=status, detail=detail) from exc

    return {
        "ok": True,
        "conversation_id": record.conversation_id,
        "message_id": record.message_id,
    }


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


@router.get("/panel/env.js")
async def panel_env_js() -> Response:
    """Expone configuración pública mínima para el panel.

    Usa variables del backend para evitar editar archivos estáticos en producción.
    """
    url = (settings.supabase_url or "").rstrip("/")
    anon = getattr(settings, "supabase_anon", None) or ""
    body = "window.SUPABASE_URL = '" + url + "';\n" "window.SUPABASE_ANON_KEY = '" + anon + "';\n"
    return Response(content=body, media_type="application/javascript")
