"""Rutas del panel: permisos, inbox y mensajes.

Nota: Para resultados sujetos a RLS, se reenvía el JWT del usuario en la
cabecera Authorization hacia Supabase REST. Para resolver permisos/roles, se
usa service_role en el backend y se extrae el `sub` del JWT (sin verificar).
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID, uuid4

import httpx
from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.channels.webchat import schemas as webchat_schemas
from app.channels.webchat import service as webchat_service
from app.core.config import settings
from app.core.logging import get_logger
from app.services import (
    DenueClient,
    DenueError,
    EmailSendError,
    GooglePlacesClient,
    GooglePlacesError,
    demografia_service,
    leads_geo,
    normalize_denue_place,
    normalize_place_for_result,
    send_email,
    storage,
)
from app.services import calendar as calendar_service
from app.services import quotes as quotes_service
from app.services.calendar import CalendarError
from app.services.storage import StorageError

router = APIRouter(prefix="", tags=["panel"])

logger = get_logger(__name__)

QUOTE_WITH_ITEMS_SELECT = "*,items:lead_cotizacion_items(*,catalog_item:catalog_items(id,slug,nombre,tipo,unidad,precio_base,moneda,impuestos,activo,descripcion_corta))"
QUOTE_DEFAULT_TAX_RATE = Decimal("0.16")
CURRENCY_QUANTUM = Decimal("0.01")


class ManualOverridePayload(BaseModel):
    """Payload para activar/desactivar modo manual."""

    manual: bool = Field(..., description="True para pausar al asistente")


class ConversationReplyPayload(BaseModel):
    """Payload para enviar mensajes desde el panel y recibir respuesta del asistente."""

    content: str | None = Field(default=None, max_length=4000)
    locale: str | None = Field(
        default=None,
        description="Locale del panel (ej. es-MX) para informar al asistente.",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos opcionales que se adjuntarán al mensaje entrante.",
    )
    client_message_id: str | None = Field(
        default=None,
        max_length=120,
        description="Identificador generado en el cliente para evitar duplicados.",
    )
    attachments: list[webchat_schemas.AttachmentPayload] | None = Field(
        default=None,
        description="Archivos adjuntos previamente cargados.",
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


class LogoAsset(BaseModel):
    id: UUID
    nombre: str
    descripcion: str | None = None
    file_url: str
    file_path: str
    metadata: dict[str, Any]
    created_at: datetime


class LogoAssetListResponse(BaseModel):
    logos: list[LogoAsset]


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


class DeleteResultadosPayload(BaseModel):
    """IDs de resultados a eliminar."""

    model_config = ConfigDict(extra="forbid")

    ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="IDs de resultados (uuid) a eliminar.",
    )

    @model_validator(mode="after")
    def _dedupe_ids(self) -> DeleteResultadosPayload:
        if not self.ids:
            return self
        # Mantén orden pero elimina duplicados
        seen: set[UUID] = set()
        deduped: list[UUID] = []
        for value in self.ids:
            if value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        self.ids = deduped
        return self


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


class LeadConversionPayload(BaseModel):
    """Solicitud para convertir o forzar la conversión de un lead en cliente."""

    forzar: bool = Field(
        default=False,
        description="Permite crear el cliente aunque la etapa no sea de categoría ganada.",
    )


class CatalogItem(BaseModel):
    id: UUID
    slug: str | None = None
    nombre: str
    tipo: Literal["producto", "servicio", "paquete"] = "servicio"
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    unidad: str | None = None
    precio_base: float | None = None
    moneda: str | None = None
    impuestos: list[dict[str, Any]] | None = None
    activo: bool = True
    requiere_factura: bool | None = None
    clave_sat: str | None = None
    unidad_sat: str | None = None
    metadatos: dict[str, Any] | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(extra="allow")


class CatalogItemResponse(BaseModel):
    item: CatalogItem


class CatalogItemListResponse(BaseModel):
    items: list[CatalogItem] = Field(default_factory=list)


class CatalogItemBasePayload(BaseModel):
    slug: str | None = Field(default=None, max_length=120)
    tipo: Literal["producto", "servicio", "paquete"] = Field(default="servicio")
    descripcion_corta: str | None = Field(default=None, max_length=400)
    descripcion_larga: str | None = Field(default=None, max_length=4000)
    unidad: str | None = Field(default=None, max_length=60)
    precio_base: float | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    impuestos: list[dict[str, Any]] | list[Any] | None = Field(default=None)
    activo: bool | None = Field(default=None)
    requiere_factura: bool | None = Field(default=None)
    clave_sat: str | None = Field(default=None, max_length=40)
    unidad_sat: str | None = Field(default=None, max_length=40)
    metadatos: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


class CatalogItemCreatePayload(CatalogItemBasePayload):
    nombre: str = Field(..., min_length=1, max_length=200)


class CatalogItemUpdatePayload(CatalogItemBasePayload):
    nombre: str | None = Field(default=None, min_length=1, max_length=200)


class LeadQuoteItemPayload(BaseModel):
    catalog_item_id: UUID | None = Field(default=None)
    titulo: str | None = Field(default=None, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    unidad: str | None = Field(default=None, max_length=60)
    cantidad: float | None = Field(default=None, gt=0)
    precio_unitario: float | None = Field(default=None, ge=0)
    descuento: float | None = Field(default=None, ge=0)
    subtotal: float | None = Field(default=None, ge=0)
    impuestos: float | None = Field(default=None, ge=0)
    total: float | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    orden: int | None = Field(default=None, ge=1)
    metadatos: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


class LeadQuoteItem(BaseModel):
    id: UUID
    cotizacion_id: UUID
    catalog_item_id: UUID | None = None
    catalog_item: CatalogItem | None = None
    titulo: str | None = None
    descripcion: str | None = None
    unidad: str | None = None
    cantidad: float | None = None
    precio_unitario: float | None = None
    descuento: float | None = None
    subtotal: float | None = None
    impuestos: float | None = None
    total: float | None = None
    moneda: str | None = None
    orden: int | None = None
    metadatos: dict[str, Any] | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(extra="allow")


class LeadQuoteCreatePayload(BaseModel):
    """Datos para crear una cotización ligada a un lead."""

    titulo: str | None = Field(default=None, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    conceptos: list[dict[str, Any]] | None = Field(
        default=None,
        description="Lista libre de conceptos/partidas que se incluirán en el PDF.",
    )
    subtotal: float | None = Field(default=None, description="Importe antes de impuestos.")
    impuestos: float | None = Field(
        default=None, description="Impuestos aplicados a la cotización."
    )
    total: float | None = Field(default=None, description="Importe total.")
    moneda: str | None = Field(default=None, min_length=3, max_length=3, description="ISO-4217.")
    valido_hasta: date | None = Field(
        default=None, description="Fecha de vigencia de la propuesta."
    )
    pdf_url: str | None = Field(default=None, max_length=2048)
    pdf_path: str | None = Field(default=None, max_length=512)
    metadatos: dict[str, Any] | None = Field(default=None, description="Datos adicionales del PDF.")
    items: list[LeadQuoteItemPayload] | None = Field(
        default=None,
        description="Detalle estructurado de productos/servicios que componen la cotización.",
    )

    model_config = ConfigDict(extra="ignore")


class LeadQuoteMarkPayload(BaseModel):
    """Payload para actualizar el estado de una cotización."""

    estado: Literal["enviada", "aceptada", "rechazada", "cancelada"]
    canal: Literal["email", "whatsapp", "manual", "otro"] | None = Field(default=None)
    proposal_sent_at: datetime | date | None = Field(
        default=None,
        description="Permite fijar manualmente la fecha de envío que se guardará en stage_prep.",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos opcionales que se adjuntarán en la bitácora.",
    )

    model_config = ConfigDict(extra="ignore")


class LeadQuoteSendPayload(LeadQuoteCreatePayload):
    """Payload completo para generar y enviar una cotización."""

    channel: Literal["email", "whatsapp"]
    email_to: list[str] | None = Field(
        default=None, description="Destinatarios adicionales del correo."
    )
    whatsapp_to: str | None = Field(
        default=None,
        description="Número E.164; por defecto se usa el teléfono del contacto.",
    )
    subject: str | None = Field(default=None, max_length=200)
    message: str | None = Field(
        default=None,
        max_length=2000,
        description="Mensaje introductorio para correo o WhatsApp.",
    )

    model_config = ConfigDict(extra="ignore")


class LeadQuote(BaseModel):
    """Representación estándar de una cotización."""

    id: UUID
    tarjeta_id: UUID
    version: int
    titulo: str | None = None
    descripcion: str | None = None
    conceptos: list[dict[str, Any]] = Field(default_factory=list)
    subtotal: float | None = None
    impuestos: float | None = None
    total: float | None = None
    moneda: str | None = None
    valido_hasta: date | None = None
    estado: Literal["borrador", "enviada", "aceptada", "rechazada", "cancelada"]
    canal_envio: Literal["email", "whatsapp", "manual", "otro"] | None = None
    enviada_por: UUID | None = None
    enviada_en: datetime | None = None
    aprobada_en: datetime | None = None
    rechazada_en: datetime | None = None
    pdf_path: str | None = None
    pdf_url: str | None = None
    metadatos: dict[str, Any] | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None
    items: list[LeadQuoteItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="allow")


class LeadQuoteResponse(BaseModel):
    """Respuesta con una sola cotización."""

    quote: LeadQuote


class LeadQuoteListResponse(BaseModel):
    """Listado de cotizaciones."""

    quotes: list[LeadQuote] = Field(default_factory=list)


class AgendaReschedulePayload(BaseModel):
    """Payload para reprogramar una cita desde el panel."""

    start_at: str = Field(..., description="Fecha/hora en ISO 8601, incluye zona horaria.")
    notes: str | None = Field(default=None, description="Notas opcionales para la cita.")


class AgendaCancelPayload(BaseModel):
    """Payload para cancelar una cita desde el panel."""

    reason: str | None = Field(default=None, description="Motivo compartido por el cliente.")


class GoogleProspeccionBusquedaPayload(BaseModel):
    """Parámetros para lanzar una captura desde Google Places."""

    query: str | None = Field(
        default=None,
        max_length=200,
        description="Texto de búsqueda libre (obligatorio en estrategia text).",
    )
    lat: float = Field(..., description="Latitud del centro de búsqueda.")
    lng: float = Field(..., description="Longitud del centro de búsqueda.")
    radio_m: int = Field(
        default=1000,
        ge=50,
        le=50000,
        description="Radio en metros para limitar la búsqueda.",
    )
    included_types: list[str] | None = Field(
        default=None,
        description="Clasificaciones soportadas por Google Places (obligatorias en estrategia nearby).",
    )
    strategy: Literal["nearby", "text"] = Field(
        default="nearby",
        description="Define si se usa searchNearby (por tipo) o searchText (por texto).",
    )
    language_code: str | None = Field(
        default=None,
        min_length=2,
        max_length=10,
        description="Sobrescribe el código de idioma enviado a Google Places.",
    )
    region_code: str | None = Field(
        default=None,
        min_length=2,
        max_length=10,
        description="Sobrescribe el código de región enviado a Google Places.",
    )
    meta: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos adicionales para guardar en public.busquedas.meta.",
    )

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def validate_strategy(self) -> GoogleProspeccionBusquedaPayload:
        if self.strategy == "nearby" and not self.included_types:
            raise ValueError("included_types_required")
        if self.strategy == "text":
            query = (self.query or "").strip()
            if not query:
                raise ValueError("query_required")
            self.query = query
        return self


class DenueBusquedaPayload(BaseModel):
    """Parámetros para lanzar una captura desde DENUE."""

    query: str = Field(..., min_length=2, max_length=200)
    lat: float = Field(..., description="Latitud del centro de búsqueda.")
    lng: float = Field(..., description="Longitud del centro de búsqueda.")
    radio_m: int = Field(
        default=1000,
        ge=100,
        le=20000,
        description="Radio en metros; se ajustará a los valores aceptados por DENUE (250-5000).",
    )
    meta: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos adicionales para guardar en public.busquedas.meta.",
    )

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def validate_query(self) -> DenueBusquedaPayload:
        query = (self.query or "").strip()
        if not query:
            raise ValueError("query_required")
        self.query = query
        return self


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


async def _sb_rpc(
    function: str,
    *,
    json: dict[str, Any] | None = None,
    token: str | None = None,
) -> httpx.Response:
    """Invoca una función RPC de Supabase."""
    path = f"/rest/v1/rpc/{function}"
    return await _sb_post(path, json=json, token=token)


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


def _rpc_field(data: Any, *keys: str) -> Any:
    """Extrae el primer valor útil de la respuesta RPC."""
    row = _first_row(data)
    if isinstance(row, dict):
        for key in keys:
            if key in row:
                return row[key]
        if row:
            return next(iter(row.values()))
    if isinstance(row, (str, int, float)):
        return row
    if isinstance(data, dict):
        for key in keys:
            if key in data:
                return data[key]
        if data:
            return next(iter(data.values()))
    return None


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


def _clean_str(value: Any) -> str | None:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            return candidate
    return None


def _parse_timestamp(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(cleaned)
        except ValueError:
            return None
    return None


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return date.fromisoformat(cleaned[:10])
        except ValueError:
            return None
    return None


def _clean_currency(value: Any) -> str | None:
    if isinstance(value, str):
        cleaned = value.strip().upper()
        if len(cleaned) == 3:
            return cleaned
    return None


def _ensure_concept_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []


def _ensure_metadata_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_quote_items(items: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(items, list):
        return normalized
    for idx, raw in enumerate(items, start=1):
        if isinstance(raw, BaseModel):
            raw_item = raw.model_dump(exclude_none=True)
        elif isinstance(raw, dict):
            raw_item = raw
        else:
            continue
        entry: dict[str, Any] = {}
        catalog_id = raw_item.get("catalog_item_id")
        if catalog_id:
            entry["catalog_item_id"] = str(catalog_id)
        for key in ("titulo", "descripcion", "unidad"):
            value = raw_item.get(key)
            if isinstance(value, str):
                trimmed = value.strip()
                if trimmed:
                    entry[key] = trimmed
        if isinstance(raw_item.get("metadatos"), dict):
            entry["metadatos"] = raw_item["metadatos"]
        for key in ("cantidad", "precio_unitario", "descuento", "subtotal", "impuestos", "total"):
            number = _to_float(raw_item.get(key))
            if number is not None:
                entry[key] = number
        currency = _clean_currency(raw_item.get("moneda"))
        if currency:
            entry["moneda"] = currency
        order_value = raw_item.get("orden")
        if isinstance(order_value, int) and order_value > 0:
            entry["orden"] = order_value
        else:
            entry["orden"] = idx
        normalized.append(entry)
    return normalized


def _decimal_from_value(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None
    return None


def _round_currency_decimal(value: Decimal) -> Decimal:
    return value.quantize(CURRENCY_QUANTUM, rounding=ROUND_HALF_UP)


def _quote_totals_from_items(items: list[dict[str, Any]]) -> dict[str, float] | None:
    subtotals: list[Decimal] = []
    for item in items:
        total_value = _decimal_from_value(item.get("total"))
        if total_value is None:
            qty = _decimal_from_value(item.get("cantidad"))
            price = _decimal_from_value(item.get("precio_unitario"))
            discount = _decimal_from_value(item.get("descuento")) or Decimal("0")
            if qty is not None and price is not None:
                total_value = qty * price - discount
        if total_value is None:
            continue
        if total_value <= 0:
            continue
        subtotals.append(total_value)
    if not subtotals:
        return None

    subtotal_sum = sum(subtotals)
    subtotal_amount = _round_currency_decimal(subtotal_sum)
    impuestos_amount = _round_currency_decimal(subtotal_sum * QUOTE_DEFAULT_TAX_RATE)
    total_amount = _round_currency_decimal(subtotal_amount + impuestos_amount)

    return {
        "subtotal": float(subtotal_amount),
        "impuestos": float(impuestos_amount),
        "total": float(total_amount),
    }


def _concepts_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    concepts: list[dict[str, Any]] = []
    for item in items:
        title = item.get("titulo")
        desc = item.get("descripcion")
        total = item.get("total") or item.get("subtotal")
        if total is None:
            qty = item.get("cantidad")
            price = item.get("precio_unitario")
            descuento = item.get("descuento") or 0
            if qty is not None and price is not None:
                total = max(qty * price - descuento, 0)
        concept = {
            "titulo": title,
            "descripcion": desc,
        }
        if total is not None:
            concept["total"] = total
        if any(value for value in concept.values()):
            concepts.append(concept)
    return concepts


def _catalog_item_from_row(row: Any) -> CatalogItem | None:
    if not isinstance(row, dict):
        return None
    data = dict(row)
    impuestos = data.get("impuestos")
    if isinstance(impuestos, str):
        try:
            impuestos = json.loads(impuestos)
        except json.JSONDecodeError:
            impuestos = None
    if impuestos is not None and not isinstance(impuestos, list):
        impuestos = None
    if impuestos is not None:
        data["impuestos"] = impuestos
    metadatos = _ensure_metadata_dict(data.get("metadatos"))
    data["metadatos"] = metadatos or None
    try:
        return CatalogItem.model_validate(data)
    except ValidationError:
        return None


def _parse_quote_items(value: Any) -> list[LeadQuoteItem]:
    if not isinstance(value, list):
        return []
    parsed: list[LeadQuoteItem] = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        data = dict(raw)
        catalog_obj = _catalog_item_from_row(data.get("catalog_item"))
        data["catalog_item"] = catalog_obj
        try:
            parsed.append(LeadQuoteItem.model_validate(data))
        except ValidationError:
            continue
    return parsed


def _normalize_catalog_body(payload: CatalogItemBasePayload) -> dict[str, Any]:
    body = payload.model_dump(exclude_none=True)
    for key in (
        "slug",
        "descripcion_corta",
        "descripcion_larga",
        "unidad",
        "clave_sat",
        "unidad_sat",
    ):
        value = body.get(key)
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed:
                body[key] = trimmed
            else:
                body.pop(key, None)
    if "moneda" in body:
        moneda = _clean_currency(body.get("moneda"))
        if moneda:
            body["moneda"] = moneda
        else:
            body.pop("moneda", None)
    impuestos = body.get("impuestos")
    if impuestos is not None and not isinstance(impuestos, list):
        body["impuestos"] = []
    metadatos = body.get("metadatos")
    if metadatos is not None:
        if not isinstance(metadatos, dict):
            body["metadatos"] = {}
    return body


def _require_token(authorization: str | None) -> str:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    return token


def _render_sales_csv(rows: list[Any]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["mes", "producto", "moneda", "total_vendido", "unidades_vendidas", "leads_ganados"]
    )
    for row in rows:
        if not isinstance(row, dict):
            continue
        writer.writerow(
            [
                row.get("mes") or "",
                row.get("item_nombre") or "",
                row.get("moneda") or "",
                row.get("total_vendido") or 0,
                row.get("unidades_vendidas") or 0,
                row.get("leads_ganados") or 0,
            ]
        )
    return output.getvalue()


def _sales_csv_filename(mes_desde: str | None, mes_hasta: str | None, moneda: str | None) -> str:
    parts = ["ventas-productos"]
    if mes_desde and mes_hasta:
        parts.append(f"{mes_desde}_a_{mes_hasta}")
    elif mes_desde:
        parts.append(f"desde_{mes_desde}")
    elif mes_hasta:
        parts.append(f"hasta_{mes_hasta}")
    if moneda:
        parts.append(moneda.lower())
    return "-".join(parts) + ".csv"


def _quote_from_row(row: dict[str, Any]) -> LeadQuote:
    return LeadQuote(
        id=row.get("id"),
        tarjeta_id=row.get("tarjeta_id"),
        version=row.get("version") or 1,
        titulo=row.get("titulo"),
        descripcion=row.get("descripcion"),
        conceptos=_ensure_concept_list(row.get("conceptos")),
        subtotal=row.get("subtotal"),
        impuestos=row.get("impuestos"),
        total=row.get("total"),
        moneda=_clean_currency(row.get("moneda")),
        valido_hasta=_parse_date(row.get("valido_hasta")),
        estado=row.get("estado") or "borrador",
        canal_envio=row.get("canal_envio"),
        enviada_por=row.get("enviada_por"),
        enviada_en=_parse_timestamp(row.get("enviada_en")),
        aprobada_en=_parse_timestamp(row.get("aprobada_en")),
        rechazada_en=_parse_timestamp(row.get("rechazada_en")),
        pdf_path=row.get("pdf_path"),
        pdf_url=row.get("pdf_url"),
        metadatos=(row.get("metadatos") if isinstance(row.get("metadatos"), dict) else None),
        creado_en=_parse_timestamp(row.get("creado_en")),
        actualizado_en=_parse_timestamp(row.get("actualizado_en")),
        items=_parse_quote_items(row.get("items")),
    )


def _logo_from_row(row: dict[str, Any]) -> LogoAsset:
    try:
        logo_id = UUID(str(row.get("id")))
    except Exception as exc:  # pragma: no cover - datos inesperados
        raise ValueError("invalid_logo_id") from exc

    metadata = row.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}

    created = _parse_timestamp(row.get("created_at")) or datetime.now(timezone.utc)

    return LogoAsset(
        id=logo_id,
        nombre=row.get("nombre") or "",
        descripcion=row.get("descripcion"),
        file_url=row.get("file_url") or "",
        file_path=row.get("file_path") or "",
        metadata=metadata,
        created_at=created,
    )


def _quote_payload_from_body(payload: LeadQuoteCreatePayload) -> dict[str, Any]:
    body = payload.model_dump(exclude_none=True)
    if "items" in body:
        items = _normalize_quote_items(body.get("items"))
        if items:
            body["items"] = items
            totals = _quote_totals_from_items(items)
            if totals:
                body.update(totals)
        else:
            body.pop("items", None)
    if "conceptos" in body:
        body["conceptos"] = _ensure_concept_list(body.get("conceptos"))
    if not body.get("conceptos") and body.get("items"):
        body["conceptos"] = _concepts_from_items(body.get("items") or [])
    if "moneda" in body:
        body["moneda"] = _clean_currency(body["moneda"]) or "MXN"
    if "valido_hasta" in body and isinstance(body["valido_hasta"], date):
        body["valido_hasta"] = body["valido_hasta"].isoformat()
    return body


def _quote_extra_payload(payload: LeadQuoteMarkPayload) -> dict[str, Any]:
    extra = dict(payload.metadata or {})
    value = payload.proposal_sent_at
    if value:
        if isinstance(value, datetime):
            extra["proposal_sent_at"] = value.astimezone(timezone.utc).isoformat()
        elif isinstance(value, date):
            extra["proposal_sent_at"] = value.isoformat()
    return extra


async def _fetch_lead_for_quote(lead_id: UUID, token: str) -> dict[str, Any]:
    params = {
        "id": f"eq.{lead_id}",
        "select": (
            "id,tablero_id,etapa_id,monto_estimado,moneda,proyecto_nombre,proyecto_necesidades,metadata,"
            "etapa:lead_etapas!lead_tarjetas_etapa_id_fkey(codigo,categoria),"
            "contacto:contactos!lead_tarjetas_contacto_id_fkey("
            "id,nombre_completo,correo,telefono_e164,company_name,notes,necesidad_proposito)"
        ),
        "limit": "1",
    }
    resp = await _sb_get("/rest/v1/lead_tarjetas", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando lead")
    rows = resp.json() or []
    row = _first_row(rows)
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="lead_not_found")
    return row


async def _fetch_quote_with_items(quote_id: UUID, token: str) -> dict[str, Any]:
    params = {
        "id": f"eq.{quote_id}",
        "select": QUOTE_WITH_ITEMS_SELECT,
        "limit": "1",
        "items.order": "orden.asc",
    }
    resp = await _sb_get("/rest/v1/lead_cotizaciones", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando cotización")
    rows = resp.json() or []
    row = _first_row(rows)
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="quote_not_found")
    return row


async def _fetch_won_stage_id(tablero_id: Any, token: str) -> str | None:
    tablero = str(tablero_id or "").strip()
    if not tablero:
        return None
    params = {
        "tablero_id": f"eq.{tablero}",
        "codigo": "eq.cerrado_ganado",
        "select": "id",
        "limit": "1",
    }
    resp = await _sb_get("/rest/v1/lead_etapas", params=params, token=token)
    if resp.status_code >= 400:
        return None
    rows = resp.json() or []
    row = _first_row(rows)
    if isinstance(row, dict) and row.get("id"):
        return str(row["id"])
    return None


async def _ensure_won_stage_metadata(
    lead_id: UUID,
    lead_row: dict[str, Any],
    *,
    token: str,
    quote: LeadQuote | None = None,
) -> None:
    metadata = lead_row.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    stage_prep = metadata.get("stage_prep")
    if not isinstance(stage_prep, dict):
        stage_prep = {}
    closed_prep = stage_prep.get("cerrado_ganado")
    if not isinstance(closed_prep, dict):
        closed_prep = {}
    changed = False
    today = datetime.now(timezone.utc).date().isoformat()
    existing_close = closed_prep.get("close_date")
    if not _clean_str(existing_close):
        closed_prep["close_date"] = today
        changed = True
    if quote and quote.total is not None and "contract_value" not in closed_prep:
        closed_prep["contract_value"] = float(quote.total)
        changed = True
    elif "contract_value" not in closed_prep:
        monto = lead_row.get("monto_estimado")
        if isinstance(monto, (int, float)):
            closed_prep["contract_value"] = float(monto)
            changed = True
    if not changed:
        return
    stage_prep["cerrado_ganado"] = closed_prep
    metadata["stage_prep"] = stage_prep
    try:
        await _sb_patch(
            "/rest/v1/lead_tarjetas",
            params={"id": f"eq.{lead_id}"},
            json={"metadata": metadata},
            token=token,
            prefer="return=minimal",
        )
    except HTTPException:
        logger.warning(
            "quotes.auto_fill_won_failed",
            extra={"lead_id": str(lead_id)},
        )


async def _auto_move_lead_to_won(lead_id: UUID, token: str, quote: LeadQuote | None = None) -> None:
    try:
        lead_row = await _fetch_lead_for_quote(lead_id, token)
    except HTTPException:
        return
    stage_info = _single_related(lead_row.get("etapa")) or {}
    stage_code = (_clean_str(stage_info.get("codigo")) or "").lower()
    stage_category = (_clean_str(stage_info.get("categoria")) or "").lower()
    await _ensure_won_stage_metadata(lead_id, lead_row, token=token, quote=quote)
    if stage_category == "ganada" or stage_code == "cerrado_ganado":
        return
    tablero_id = lead_row.get("tablero_id")
    won_stage_id = await _fetch_won_stage_id(tablero_id, token)
    if not won_stage_id:
        return
    payload = {
        "p_tarjeta_id": str(lead_id),
        "p_etapa_destino": won_stage_id,
        "p_fuente": "asistente",
        "p_motivo": "quote_auto_accept",
        "p_metadata": {"source": "quote_auto_accept"},
        "p_expected_etapa": (str(lead_row.get("etapa_id")) if lead_row.get("etapa_id") else None),
    }
    resp = await _sb_rpc("panel_lead_move", json=payload, token=token)
    if resp.status_code >= 400:
        logger.warning(
            "quotes.auto_move_failed",
            extra={
                "lead_id": str(lead_id),
                "status": resp.status_code,
                "body": resp.text,
            },
        )


def _resolve_lead_label(lead_row: dict[str, Any]) -> str:
    contact = _single_related(lead_row.get("contacto")) or {}
    candidates = [
        lead_row.get("proyecto_nombre"),
        contact.get("company_name"),
        contact.get("nombre_completo"),
    ]
    for value in candidates:
        cleaned = _clean_str(value)
        if cleaned:
            return cleaned
    return "Lead sin nombre"


def _resolve_email_recipients(
    contact: dict[str, Any] | None, overrides: list[str] | None
) -> list[str]:
    recipients: list[str] = []
    seen: set[str] = set()
    for value in overrides or []:
        if not isinstance(value, str):
            continue
        email = value.strip().lower()
        if email and email not in seen:
            recipients.append(email)
            seen.add(email)
    contact_email = _clean_str((contact or {}).get("correo"))
    if contact_email:
        lowered = contact_email.lower()
        if lowered not in seen:
            recipients.append(contact_email)
            seen.add(lowered)
    return recipients


def _resolve_whatsapp_number(contact: dict[str, Any] | None, override: str | None) -> str | None:
    candidate = _clean_str(override)
    if candidate:
        return candidate
    contact_phone = _clean_str((contact or {}).get("telefono_e164"))
    return contact_phone


def _quote_mark_extra(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = dict(extra or {})
    payload.setdefault("proposal_sent_at", datetime.now(timezone.utc).isoformat())
    return payload


def _ilike_param(value: str) -> str:
    sanitized = value.replace("*", "").replace("%", "")
    return f"ilike.*{sanitized}*"


def _result_preview(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "external_id": item.get("external_id"),
        "name": item.get("name"),
        "actividad": item.get("actividad"),
        "phone": item.get("phone"),
        "website": item.get("website"),
        "address": item.get("address"),
        "rating": item.get("rating"),
        "reviews": item.get("reviews"),
        "maps_url": item.get("maps_url"),
    }


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
    secret: str | None = getattr(settings, "supabase_jwt_secret", None) or getattr(  # type: ignore[attr-defined]
        settings, "supabase_legacy_jwt_secret", None
    )  # type: ignore[attr-defined]
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

AGENDA_ACTIVE_ESTADOS = {"confirmada"}
AGENDA_UPCOMING_WINDOW = timedelta(hours=24)


def _normalize_agenda_estado(value: Any) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
    else:
        lowered = str(value).strip().lower() if value is not None else ""
    if not lowered:
        return "pendiente"
    if lowered in {"confirmed", "confirmada"}:
        return "confirmada"
    if lowered in {"cancelled", "cancelada"}:
        return "cancelada"
    if lowered in {"rescheduled", "reprogramada"}:
        return "reprogramada"
    if lowered in {"completed", "realizada"}:
        return "realizada"
    if lowered in {"pending", "pendiente"}:
        return "pendiente"
    return lowered


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        raw = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _parse_datetime_input(value: str | None, *, field: str) -> datetime:
    if not value:
        raise HTTPException(status_code=400, detail=f"{field}_required")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field}_invalid") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_iso_date(value: str | None, *, field: str) -> date:
    if not value:
        raise HTTPException(status_code=400, detail=f"{field}_required")
    try:
        return datetime.fromisoformat(value.strip()).date()
    except ValueError:
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d").date()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"{field}_invalid") from exc


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _fetch_calendar_booking_row(
    booking_id: UUID,
    *,
    token: str | None,
) -> dict[str, Any]:
    params = {
        "id": f"eq.{booking_id}",
        "select": "id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
        "limit": "1",
    }
    resp = await _sb_get("/rest/v1/calendar_bookings", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando cita")
    data = resp.json() or []
    row = _first_row(data)
    if not row:
        raise HTTPException(status_code=404, detail="booking_not_found")
    return row


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
async def get_permissions(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
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
async def cfg_personal(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)

    resp_personal = await _sb_get(
        "/rest/v1/v_configuracion_personal",
        params={"select": "*", "order": "correo.asc"},
    )
    if resp_personal.status_code >= 400:
        raise _supabase_error(resp_personal, "Error consultando personal")

    resp_roles = await _sb_get(
        "/rest/v1/roles",
        params={
            "select": "id,codigo,nombre,descripcion,creado_en",
            "order": "codigo.asc",
        },
    )
    if resp_roles.status_code >= 400:
        raise _supabase_error(resp_roles, "Error consultando roles")

    resp_departamentos = await _sb_get(
        "/rest/v1/departamentos",
        params={
            "select": "id,nombre,departamento_padre_id,creado_en",
            "order": "nombre.asc",
        },
    )
    if resp_departamentos.status_code >= 400:
        raise _supabase_error(resp_departamentos, "Error consultando departamentos")

    resp_puestos = await _sb_get(
        "/rest/v1/puestos",
        params={
            "select": "id,nombre,descripcion,departamento_id,creado_en",
            "order": "nombre.asc",
        },
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
        "/rest/v1/puestos",
        params={"id": f"eq.{puesto_id}"},
        prefer="return=representation",
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
async def cfg_agentes(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
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
async def cfg_canales(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
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


def _map_agenda_row(row: dict[str, Any]) -> dict[str, Any]:
    metadata_raw = row.get("metadata")
    metadata_parsed = _coerce_metadata(metadata_raw)
    if metadata_parsed is None and isinstance(metadata_raw, dict):
        metadata_parsed = metadata_raw
    metadata: dict[str, Any] = dict(metadata_parsed) if isinstance(metadata_parsed, dict) else {}
    estado = _normalize_agenda_estado(row.get("status") or metadata.get("estado"))

    contacto_payload = {
        "id": row.get("contacto_id") or row.get("contact_id"),
        "nombre": row.get("contacto_nombre") or "Contacto sin nombre",
        "correo": row.get("contacto_correo"),
        "telefono": row.get("contacto_telefono"),
        "empresa": row.get("contacto_empresa"),
        "origen": row.get("contacto_origen"),
    }
    asignado_payload: dict[str, Any] | None = None
    if row.get("asignado_a_usuario_id") or row.get("asignado_nombre"):
        asignado_payload = {
            "id": row.get("asignado_a_usuario_id"),
            "nombre": row.get("asignado_nombre"),
        }
    propietario_payload: dict[str, Any] | None = None
    if row.get("propietario_usuario_id") or row.get("propietario_nombre"):
        propietario_payload = {
            "id": row.get("propietario_usuario_id"),
            "nombre": row.get("propietario_nombre"),
        }

    return {
        "id": row.get("id"),
        "resource_id": row.get("resource_id"),
        "hold_id": row.get("hold_id"),
        "tarjeta_id": row.get("tarjeta_id"),
        "contacto_id": contacto_payload["id"],
        "conversacion_id": row.get("conversacion_id"),
        "start_at": row.get("start_at"),
        "end_at": row.get("end_at"),
        "timezone": row.get("timezone"),
        "estado": estado,
        "notes": row.get("notes"),
        "meeting_url": row.get("meeting_url"),
        "external_join_url": row.get("external_join_url"),
        "canal": row.get("tarjeta_canal") or row.get("conversacion_canal"),
        "provider": "calendar",
        "lead_score": row.get("tarjeta_lead_score"),
        "etapa_nombre": row.get("etapa_nombre"),
        "metadata": metadata,
        "contacto": contacto_payload,
        "asignado": asignado_payload,
        "propietario": propietario_payload,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _compute_agenda_metrics(items: Sequence[dict[str, Any]]) -> dict[str, int]:
    metrics = {
        "total": len(items),
        "activas": 0,
        "proximas24h": 0,
        "canceladas": 0,
        "realizadas": 0,
    }
    now = datetime.now(timezone.utc)
    window_limit = now + AGENDA_UPCOMING_WINDOW

    for item in items:
        estado = (item.get("estado") or "").lower()
        if estado == "cancelada":
            metrics["canceladas"] += 1
        if estado == "realizada":
            metrics["realizadas"] += 1
        if estado in AGENDA_ACTIVE_ESTADOS:
            metrics["activas"] += 1
            start_dt = _parse_iso_datetime(item.get("start_at"))
            if start_dt and now <= start_dt <= window_limit:
                metrics["proximas24h"] += 1

    return metrics


@router.get("/agenda/bookings")
async def listar_agenda_bookings(
    authorization: str | None = Header(default=None),
    rango: str | None = Query(default=None),
    fecha_desde: str | None = Query(default=None, alias="from"),
    fecha_hasta: str | None = Query(default=None, alias="to"),
    estado: list[str] | None = Query(default=None),
    assigned: list[str] | None = Query(default=None),
    provider: list[str] | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    cursor: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    limit = max(1, min(limit, 500))
    offset = max(cursor, 0)

    date_from, date_to = _resolve_date_range(rango, fecha_desde, fecha_hasta)
    if not date_from and not date_to:
        now = datetime.now(timezone.utc)
        date_from = now - timedelta(days=30)
        date_to = now + timedelta(days=30)

    select_clause = (
        "id,resource_id,hold_id,tarjeta_id,conversacion_id,"
        "contact_id,contacto_id:contact_id,"
        "start_at,end_at,timezone,status,notes,meeting_url,external_join_url,metadata,"
        "created_at,updated_at,tarjeta_canal,tarjeta_lead_score,"
        "etapa_nombre,asignado_a_usuario_id,asignado_nombre,"
        "propietario_usuario_id,propietario_nombre,"
        "contacto_nombre,contacto_correo,contacto_telefono,contacto_empresa,contacto_origen,"
        "conversacion_canal"
    )

    params: dict[str, str] = {
        "select": select_clause,
        "order": "start_at.asc.nullslast,created_at.asc",
        "limit": str(limit),
        "offset": str(offset),
    }

    and_filters: list[str] = []
    if date_from:
        and_filters.append(f"start_at.gte.{_format_utc(date_from)}")
    if date_to:
        and_filters.append(f"start_at.lte.{_format_utc(date_to)}")
    if and_filters:
        params["and"] = f"({','.join(and_filters)})"

    estado_filters = {
        value.strip().lower()
        for value in (estado or [])
        if isinstance(value, str) and value.strip()
    }
    status_filters: set[str] = set()
    for value in estado_filters:
        if value in {"cancelada"}:
            status_filters.add("cancelled")
        elif value in {"confirmada", "pendiente", "reprogramada"}:
            status_filters.add("confirmed")
    if status_filters:
        if len(status_filters) == 1:
            params["status"] = f"eq.{next(iter(status_filters))}"
        else:
            joined = ",".join(sorted(status_filters))
            params["status"] = f"in.({joined})"

    assigned_uuid_filters = {
        value.strip()
        for value in (assigned or [])
        if isinstance(value, str) and _looks_like_uuid(value.strip())
    }
    if assigned_uuid_filters:
        if len(assigned_uuid_filters) == 1:
            params["asignado_a_usuario_id"] = f"eq.{next(iter(assigned_uuid_filters))}"
        else:
            params["asignado_a_usuario_id"] = f"in.({','.join(sorted(assigned_uuid_filters))})"

    if search:
        cleaned = " ".join(search.strip().split())
        sanitized = "".join(ch for ch in cleaned if ch.isalnum() or ch in "@._+- ")
        if sanitized:
            like = sanitized
            params["or"] = (
                f"(contacto_nombre.ilike.*{like}*,contacto_correo.ilike.*{like}*,"
                f"contacto_telefono.ilike.*{like}*,notes.ilike.*{like}*)"
            )

    provider_filters = {
        value.strip().lower()
        for value in (provider or [])
        if isinstance(value, str) and value.strip()
    }
    if provider_filters and "calendar" not in provider_filters:
        return {
            "ok": True,
            "items": [],
            "metrics": {
                "total": 0,
                "activas": 0,
                "proximas24h": 0,
                "canceladas": 0,
                "realizadas": 0,
            },
            "total": 0,
            "limit": limit,
            "offset": offset,
            "has_more": False,
        }

    resp = await _sb_get(
        "/rest/v1/panel_calendar_bookings",
        params=params,
        token=token,
        prefer="count=planned",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando agenda")

    raw = resp.json() or []
    if not isinstance(raw, list):
        raw = []

    items = [_map_agenda_row(row) for row in raw if isinstance(row, dict)]

    filtered_items: list[dict[str, Any]] = []
    assigned_name_filters = {
        value.strip().lower()
        for value in (assigned or [])
        if isinstance(value, str) and not _looks_like_uuid(value.strip()) and value.strip()
    }

    for item in items:
        estado_value = (item.get("estado") or "").lower()
        if estado_filters and estado_value not in estado_filters:
            continue
        if assigned_name_filters:
            assigned_payload = item.get("asignado") or {}
            candidate_id = (assigned_payload.get("id") or "").lower()
            candidate_name = (assigned_payload.get("nombre") or "").lower()
            if (
                candidate_id not in assigned_name_filters
                and candidate_name not in assigned_name_filters
            ):
                continue
        filtered_items.append(item)

    metrics = _compute_agenda_metrics(filtered_items)
    total = _content_range_total(resp.headers.get("content-range"))
    raw_count = len(raw)
    computed_total = total if total is not None else offset + raw_count

    return {
        "ok": True,
        "items": filtered_items,
        "metrics": metrics,
        "total": computed_total,
        "limit": limit,
        "offset": offset,
        "has_more": computed_total > offset + raw_count,
    }


@router.get("/agenda/availability")
async def obtener_agenda_availability(
    authorization: str | None = Header(default=None),
    resource_id: str | None = Query(default=None),
    fecha_desde: str | None = Query(default=None, alias="from"),
    fecha_hasta: str | None = Query(default=None, alias="to"),
    timezone_hint: str | None = Query(default=None, alias="timezone"),
    max_days: int = Query(default=14, ge=1, le=60),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    calendar_resource = resource_id or settings.webchat_calendar_resource_id
    if not calendar_resource:
        raise HTTPException(status_code=400, detail="calendar_resource_missing")

    today = datetime.now(timezone.utc).date()
    if fecha_desde:
        start_date = _parse_iso_date(fecha_desde, field="from")
    else:
        start_date = today
    if fecha_hasta:
        end_date = _parse_iso_date(fecha_hasta, field="to")
    else:
        end_date = start_date + timedelta(days=max_days)

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="range_invalid")

    allowed_span = timedelta(days=min(max_days, 60))
    if end_date - start_date > allowed_span:
        end_date = start_date + allowed_span

    tz_hint = (timezone_hint or settings.webchat_calendar_timezone or "UTC").strip()
    try:
        payload = await calendar_service.list_slots(
            resource_id=calendar_resource,
            start_date=start_date,
            end_date=end_date,
            timezone_hint=tz_hint,
            max_days=min(max_days, 60),
        )
    except CalendarError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "availability": payload}


@router.post("/agenda/bookings/{booking_id}/reschedule")
async def reprogramar_agenda_booking(
    booking_id: UUID,
    payload: AgendaReschedulePayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    booking_row = await _fetch_calendar_booking_row(booking_id, token=token)
    conversation_id = booking_row.get("conversacion_id")
    if not conversation_id:
        raise HTTPException(status_code=400, detail="booking_without_conversation")

    start_dt = _parse_datetime_input(payload.start_at, field="start_at")
    try:
        booking = await webchat_service.reschedule_calendar_booking(
            conversation_id=str(conversation_id),
            booking_id=str(booking_id),
            start_at=start_dt,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "booking": booking}


@router.post("/agenda/bookings/{booking_id}/cancel")
async def cancelar_agenda_booking(
    booking_id: UUID,
    payload: AgendaCancelPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    booking_row = await _fetch_calendar_booking_row(booking_id, token=token)
    conversation_id = booking_row.get("conversacion_id")
    if not conversation_id:
        raise HTTPException(status_code=400, detail="booking_without_conversation")

    try:
        booking = await webchat_service.cancel_calendar_booking(
            conversation_id=str(conversation_id),
            booking_id=str(booking_id),
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "booking": booking}


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
        prefer="count=planned",
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


@router.get("/contactos/{contacto_id}")
async def obtener_contacto_detalle(
    contacto_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")
    try:
        contacto_uuid = str(UUID(contacto_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="contacto_invalid_id")

    params = {
        "id": f"eq.{contacto_uuid}",
        "select": (
            "id,nombre_completo,correo,telefono_e164,origen,propietario_usuario_id,"
            "estado,creado_en,contacto_datos,company_name,notes,necesidad_proposito,"
            "captura_estado"
        ),
        "limit": "1",
    }
    resp = await _sb_get("/rest/v1/contactos", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando contacto")
    rows = resp.json() or []
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=404, detail="contacto_not_found")

    row = rows[0]
    datos_raw = row.get("contacto_datos")
    datos_extra = datos_raw if isinstance(datos_raw, dict) else None
    contacto = {
        "id": row.get("id"),
        "nombre": row.get("nombre_completo"),
        "correo": row.get("correo"),
        "telefono": row.get("telefono_e164"),
        "origen": row.get("origen"),
        "estado": row.get("estado"),
        "creado_en": row.get("creado_en"),
        "company_name": row.get("company_name"),
        "notes": row.get("notes"),
        "necesidad_proposito": row.get("necesidad_proposito"),
        "captura_estado": row.get("captura_estado"),
        "propietario_usuario_id": row.get("propietario_usuario_id"),
        "datos": datos_extra,
    }
    return {"ok": True, "contacto": contacto}


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


@router.get(
    "/settings/logos",
    response_model=LogoAssetListResponse,
)
async def listar_logos_settings(
    authorization: str | None = Header(default=None),
) -> LogoAssetListResponse:
    await _require_admin(authorization)
    resp = await _sb_get(
        "/rest/v1/logos",
        params={
            "select": "id,nombre,descripcion,file_path,file_url,metadata,created_at",
            "order": "created_at.desc",
        },
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando logos")
    rows = resp.json() or []
    logos: list[LogoAsset] = []
    for row in rows:
        if isinstance(row, dict):
            try:
                logos.append(_logo_from_row(row))
            except ValueError:
                continue
    return LogoAssetListResponse(logos=logos)


@router.post(
    "/settings/logos",
    response_model=LogoAsset,
)
async def subir_logo_settings(
    authorization: str | None = Header(default=None),
    file: UploadFile = File(...),
    nombre: str = Form(...),
    descripcion: str | None = Form(default=None),
) -> LogoAsset:
    user_id = await _require_admin(authorization)

    if not file.filename:
        raise HTTPException(status_code=400, detail="logo_file_required")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="logo_invalid_type")

    try:
        upload = await storage.upload_logo_asset(file=file)
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="logo_upload_failed") from exc

    payload = {
        "nombre": (nombre or "").strip() or (file.filename or "Logo"),
        "descripcion": (descripcion or "").strip() or None,
        "file_path": upload["path"],
        "file_url": upload["url"],
        "metadata": {
            "mime": upload.get("mime"),
            "original_name": upload.get("name"),
        },
        "uploaded_by": str(user_id),
    }

    resp = await _sb_post(
        "/rest/v1/logos",
        json=payload,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error guardando logo")
    row = _first_row(resp.json() or [])
    if not isinstance(row, dict):
        raise HTTPException(status_code=502, detail="logo_save_unexpected_response")
    return _logo_from_row(row)


@router.get("/analytics/catalog/ventas")
async def catalogo_kpi_ventas(
    mes_desde: str | None = Query(default=None, description="YYYY-MM-01"),
    mes_hasta: str | None = Query(default=None, description="YYYY-MM-01"),
    moneda: str | None = Query(default=None, min_length=3, max_length=3),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _require_token(authorization)
    params: dict[str, str] = {
        "select": "mes,catalog_item_id,item_nombre,moneda,total_vendido,unidades_vendidas,leads_ganados"
    }
    if mes_desde and mes_hasta:
        params["and"] = f"(mes.gte.{mes_desde},mes.lte.{mes_hasta})"
    elif mes_desde:
        params["mes"] = f"gte.{mes_desde}"
    elif mes_hasta:
        params["mes"] = f"lte.{mes_hasta}"
    if moneda:
        params["moneda"] = f"eq.{moneda.upper()}"
    resp = await _sb_get("/rest/v1/ventas_por_producto_mes", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando ventas por producto")
    data = resp.json() or []
    return {"ok": True, "rows": data}


@router.get("/analytics/catalog/embudo")
async def catalogo_kpi_embudo(
    tablero_id: UUID | None = Query(default=None),
    etapa_id: UUID | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _require_token(authorization)
    params: dict[str, str] = {
        "select": "tablero_id,etapa_id,catalog_item_id,item_nombre,moneda,monto_estimado,leads_con_cotizacion",
    }
    if tablero_id:
        params["tablero_id"] = f"eq.{tablero_id}"
    if etapa_id:
        params["etapa_id"] = f"eq.{etapa_id}"
    resp = await _sb_get("/rest/v1/embudo_por_producto", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando embudo por producto")
    data = resp.json() or []
    return {"ok": True, "rows": data}


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


# --- Catálogo de productos/servicios ---


@router.get("/catalog/items", response_model=CatalogItemListResponse)
async def catalog_list_items(
    authorization: str | None = Header(default=None),
    search: str | None = Query(default=None, max_length=200),
    tipo: Literal["producto", "servicio", "paquete"] | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
) -> CatalogItemListResponse:
    token = _require_token(authorization)
    params: dict[str, str] = {
        "select": "*",
        "order": "nombre.asc",
        "limit": str(limit),
    }
    if not include_inactive:
        params["activo"] = "eq.true"
    if tipo:
        params["tipo"] = f"eq.{tipo}"
    if search:
        pattern = _ilike_param(search)
        params["or"] = f"(nombre.{pattern},slug.{pattern},descripcion_corta.{pattern})"
    resp = await _sb_get("/rest/v1/catalog_items", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando catálogo")
    rows = resp.json() or []
    items: list[CatalogItem] = []
    if isinstance(rows, list):
        for row in rows:
            catalog = _catalog_item_from_row(row)
            if catalog:
                items.append(catalog)
    return CatalogItemListResponse(items=items)


@router.post("/catalog/items", status_code=201, response_model=CatalogItemResponse)
async def catalog_create_item(
    payload: CatalogItemCreatePayload,
    authorization: str | None = Header(default=None),
) -> CatalogItemResponse:
    user_id = await _require_admin(authorization)
    nombre = payload.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="nombre_required")
    body = _normalize_catalog_body(payload)
    body["nombre"] = nombre
    body.setdefault("moneda", "MXN")
    body.setdefault("activo", True)
    body["created_by"] = user_id
    body["updated_by"] = user_id

    resp = await _sb_post(
        "/rest/v1/catalog_items",
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando producto")
    rows = resp.json() or []
    item = _catalog_item_from_row(_first_row(rows))
    if not item:
        raise HTTPException(status_code=502, detail="catalog_create_unexpected_response")
    return CatalogItemResponse(item=item)


@router.patch("/catalog/items/{item_id}", response_model=CatalogItemResponse)
async def catalog_update_item(
    item_id: UUID,
    payload: CatalogItemUpdatePayload,
    authorization: str | None = Header(default=None),
) -> CatalogItemResponse:
    user_id = await _require_admin(authorization)
    body = _normalize_catalog_body(payload)
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="nombre_required")
        body["nombre"] = nombre
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    body["updated_by"] = user_id

    resp = await _sb_patch(
        "/rest/v1/catalog_items",
        params={"id": f"eq.{item_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando producto")
    row = _first_row(resp.json() or [])
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="catalog_item_not_found")
    item = _catalog_item_from_row(row)
    if not item:
        raise HTTPException(status_code=502, detail="catalog_update_unexpected_response")
    return CatalogItemResponse(item=item)


@router.delete("/catalog/items/{item_id}")
async def catalog_delete_item(
    item_id: UUID,
    authorization: str | None = Header(default=None),
    hard: bool = Query(default=False),
) -> dict[str, Any]:
    user_id = await _require_admin(authorization)
    if hard:
        resp = await _sb_delete(
            "/rest/v1/catalog_items",
            params={"id": f"eq.{item_id}"},
            prefer="return=representation",
        )
        if resp.status_code >= 400:
            raise _supabase_error(resp, "Error eliminando producto")
        deleted_row = _first_row(resp.json() or [])
        item = _catalog_item_from_row(deleted_row) if isinstance(deleted_row, dict) else None
        if not item:
            raise HTTPException(status_code=404, detail="catalog_item_not_found")
        return {"ok": True, "item": item, "hard_deleted": True}

    body = {"activo": False, "updated_by": user_id}
    resp = await _sb_patch(
        "/rest/v1/catalog_items",
        params={"id": f"eq.{item_id}"},
        json=body,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error archivando producto")
    row = _first_row(resp.json() or [])
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="catalog_item_not_found")
    item = _catalog_item_from_row(row)
    if not item:
        raise HTTPException(status_code=502, detail="catalog_update_unexpected_response")
    return {"ok": True, "item": item, "hard_deleted": False}


@router.get("/leads/{lead_id}/quotes", response_model=LeadQuoteListResponse)
async def listar_cotizaciones_lead(
    lead_id: UUID,
    authorization: str | None = Header(default=None),
) -> LeadQuoteListResponse:
    token = _require_token(authorization)

    params = {
        "tarjeta_id": f"eq.{lead_id}",
        "order": "version.desc",
        "select": QUOTE_WITH_ITEMS_SELECT,
        "items.order": "orden.asc",
    }
    resp = await _sb_get("/rest/v1/lead_cotizaciones", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando cotizaciones")
    rows = resp.json() or []
    quotes: list[LeadQuote] = []
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict):
                quotes.append(_quote_from_row(row))
    return LeadQuoteListResponse(quotes=quotes)


@router.post(
    "/leads/{lead_id}/quotes",
    status_code=201,
    response_model=LeadQuoteResponse,
)
async def crear_cotizacion_lead(
    lead_id: UUID,
    payload: LeadQuoteCreatePayload,
    authorization: str | None = Header(default=None),
) -> LeadQuoteResponse:
    token = _require_token(authorization)

    body = {
        "p_tarjeta_id": str(lead_id),
        "p_payload": _quote_payload_from_body(payload),
    }
    resp = await _sb_rpc("panel_lead_quote_create", json=body, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error creando cotización")
    data = resp.json() or {}
    row = _first_row(data)
    if not isinstance(row, dict):
        raise HTTPException(status_code=502, detail="quote_create_unexpected_response")
    quote_id = row.get("id")
    if not quote_id:
        raise HTTPException(status_code=502, detail="quote_create_missing_id")
    fresh_row = await _fetch_quote_with_items(UUID(str(quote_id)), token)
    quote = _quote_from_row(fresh_row)
    return LeadQuoteResponse(quote=quote)


@router.post(
    "/leads/{lead_id}/quotes/send",
    response_model=LeadQuoteResponse,
)
async def enviar_cotizacion_lead(
    lead_id: UUID,
    payload: LeadQuoteSendPayload,
    authorization: str | None = Header(default=None),
) -> LeadQuoteResponse:
    token = _require_token(authorization)

    lead_row = await _fetch_lead_for_quote(lead_id, token)
    contact = _single_related(lead_row.get("contacto")) or {}
    currency = payload.moneda or lead_row.get("moneda") or "MXN"

    base_payload_data = payload.model_dump(
        include=set(LeadQuoteCreatePayload.model_fields.keys()),
        exclude_none=True,
    )
    base_payload = LeadQuoteCreatePayload(**base_payload_data)
    normalized_items = _normalize_quote_items(base_payload.items or [])
    totals = _quote_totals_from_items(normalized_items)
    if totals:
        base_payload.subtotal = totals["subtotal"]
        base_payload.impuestos = totals["impuestos"]
        base_payload.total = totals["total"]
    conceptos_context = base_payload.conceptos or _concepts_from_items(normalized_items)

    quote_context = quotes_service.QuoteRenderContext(
        lead_label=_resolve_lead_label(lead_row),
        reference=str(lead_id).split("-")[0],
        issuer_name=settings.mail_username or "Tal-IA",
        issuer_email=settings.mail_username,
        contact_name=_clean_str(contact.get("nombre_completo")),
        contact_company=_clean_str(contact.get("company_name")),
        contact_email=_clean_str(contact.get("correo")),
        contact_phone=_clean_str(contact.get("telefono_e164")),
        conceptos=conceptos_context,
        subtotal=base_payload.subtotal,
        impuestos=base_payload.impuestos,
        total=base_payload.total,
        moneda=currency,
        valido_hasta=base_payload.valido_hasta,
        descripcion=base_payload.descripcion or base_payload.titulo,
        notes=lead_row.get("proyecto_necesidades") or contact.get("necesidad_proposito"),
        items=normalized_items,
    )

    pdf_doc = await quotes_service.render_quote_pdf(quote_context)
    try:
        upload = await storage.upload_quote_document(
            content=pdf_doc.content,
            filename=pdf_doc.filename,
            lead_id=str(lead_id),
            content_type="application/pdf",
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="quote_upload_failed") from exc

    create_payload = _quote_payload_from_body(base_payload)
    create_payload["pdf_url"] = upload["url"]
    create_payload["pdf_path"] = upload["path"]
    resp_create = await _sb_rpc(
        "panel_lead_quote_create",
        json={"p_tarjeta_id": str(lead_id), "p_payload": create_payload},
        token=token,
    )
    if resp_create.status_code >= 400:
        raise _supabase_error(resp_create, "Error creando cotización")
    row_created = _first_row(resp_create.json() or {})
    if not isinstance(row_created, dict):
        raise HTTPException(status_code=502, detail="quote_create_unexpected_response")
    quote_id_value = row_created.get("id")
    if not quote_id_value:
        raise HTTPException(status_code=502, detail="quote_create_missing_id")
    quote_uuid = UUID(str(quote_id_value))

    channel = payload.channel
    extra_data: dict[str, Any]
    if channel == "email":
        recipients = _resolve_email_recipients(contact, payload.email_to)
        if not recipients:
            raise HTTPException(status_code=400, detail="quote_email_missing_recipient")
        subject = payload.subject or quotes_service.compose_email_subject(quote_context)
        body = quotes_service.compose_email_body(quote_context, payload.message)
        try:
            await asyncio.to_thread(
                send_email,
                subject=subject,
                body_text=body,
                recipients=recipients,
                attachments=[
                    {
                        "content": pdf_doc.content,
                        "maintype": "application",
                        "subtype": "pdf",
                        "filename": pdf_doc.filename,
                    }
                ],
            )
        except EmailSendError as exc:
            raise HTTPException(status_code=502, detail="quote_email_send_failed") from exc
        extra_data = _quote_mark_extra({"email_to": recipients, "subject": subject})
    else:
        whatsapp_number = _resolve_whatsapp_number(contact, payload.whatsapp_to)
        if not whatsapp_number:
            raise HTTPException(status_code=400, detail="quote_whatsapp_missing_recipient")
        body = quotes_service.compose_whatsapp_body(quote_context, payload.message)
        try:
            await quotes_service.send_whatsapp_message(
                to_number=whatsapp_number,
                body=body,
                media_url=upload["url"],
            )
        except quotes_service.QuoteSendError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        extra_data = _quote_mark_extra({"whatsapp_to": whatsapp_number})

    mark_body = {
        "p_quote_id": str(quote_uuid),
        "p_estado": "enviada",
        "p_canal": channel,
        "p_extra": extra_data,
    }
    resp_mark = await _sb_rpc("panel_lead_quote_mark", json=mark_body, token=token)
    if resp_mark.status_code >= 400:
        raise _supabase_error(resp_mark, "Error actualizando cotización")
    row_marked = _first_row(resp_mark.json() or {})
    if not isinstance(row_marked, dict):
        raise HTTPException(status_code=502, detail="quote_mark_unexpected_response")

    refreshed_row = await _fetch_quote_with_items(
        UUID(str(row_marked.get("id") or quote_uuid)),
        token,
    )
    quote = _quote_from_row(refreshed_row)
    if quote.estado == "aceptada":
        await _auto_move_lead_to_won(UUID(str(quote.tarjeta_id)), token=token, quote=quote)
    return LeadQuoteResponse(quote=quote)


@router.post(
    "/quotes/{quote_id}/mark",
    response_model=LeadQuoteResponse,
)
async def actualizar_estado_cotizacion(
    quote_id: UUID,
    payload: LeadQuoteMarkPayload,
    authorization: str | None = Header(default=None),
) -> LeadQuoteResponse:
    token = _require_token(authorization)

    body = {
        "p_quote_id": str(quote_id),
        "p_estado": payload.estado,
        "p_canal": payload.canal,
        "p_extra": _quote_extra_payload(payload),
    }
    resp = await _sb_rpc("panel_lead_quote_mark", json=body, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error actualizando cotización")
    data = resp.json() or {}
    row = _first_row(data)
    if not isinstance(row, dict):
        raise HTTPException(status_code=502, detail="quote_mark_unexpected_response")
    fresh_row = await _fetch_quote_with_items(quote_id, token)
    quote = _quote_from_row(fresh_row)
    if quote.estado == "aceptada":
        await _auto_move_lead_to_won(UUID(str(quote.tarjeta_id)), token=token, quote=quote)
    return LeadQuoteResponse(quote=quote)


def _normalise_sender_type(value: Any) -> str | None:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if not lowered:
            return None
        if lowered.startswith("human"):
            return "human"
        if lowered.startswith("assistant"):
            return "assistant"
        if lowered.startswith("user"):
            return "user"
    return None


def _coerce_metadata(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        parsed = value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
    else:
        return None

    extra = parsed.get("extra")
    if isinstance(extra, str):
        try:
            parsed["extra"] = json.loads(extra)
        except json.JSONDecodeError:
            parsed["extra"] = None
    return parsed


def _extract_sender_type(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    candidates: list[Any] = [
        metadata.get("sender_type"),
        metadata.get("senderType"),
        metadata.get("sender"),
        metadata.get("author_type"),
        metadata.get("agent_type"),
    ]
    sender = metadata.get("sender")
    if isinstance(sender, dict):
        candidates.extend([sender.get("type"), sender.get("sender_type"), sender.get("senderType")])
    agent = metadata.get("agent")
    if isinstance(agent, dict):
        candidates.extend([agent.get("type"), agent.get("sender_type"), agent.get("senderType")])
    extra = metadata.get("extra")
    if isinstance(extra, str):
        try:
            extra = json.loads(extra)
        except json.JSONDecodeError:
            extra = None
    if isinstance(extra, dict):
        candidates.extend(
            [
                extra.get("sender_type"),
                extra.get("senderType"),
                extra.get("sender"),
                extra.get("author_type"),
                extra.get("agent_type"),
            ]
        )
        sender_extra = extra.get("sender")
        if isinstance(sender_extra, dict):
            candidates.extend(
                [
                    sender_extra.get("type"),
                    sender_extra.get("sender_type"),
                    sender_extra.get("senderType"),
                ]
            )
        agent_extra = extra.get("agent")
        if isinstance(agent_extra, dict):
            candidates.extend(
                [
                    agent_extra.get("type"),
                    agent_extra.get("sender_type"),
                    agent_extra.get("senderType"),
                ]
            )
    for candidate in candidates:
        match = _normalise_sender_type(candidate)
        if match:
            return match

    manual_flag = metadata.get("manual_override") or metadata.get("manualOverride")
    if manual_flag is None:
        manual_flag = metadata.get("manual_mode") or metadata.get("manualMode")
    if isinstance(manual_flag, bool) and manual_flag:
        return "human"

    origin = metadata.get("origin")
    if isinstance(origin, str) and "manual" in origin.lower():
        return "human"
    source = metadata.get("source")
    if isinstance(source, str) and "manual" in source.lower():
        return "human"
    if isinstance(extra, dict):
        extra_origin = extra.get("origin")
        if isinstance(extra_origin, str) and "manual" in extra_origin.lower():
            return "human"
        extra_source = extra.get("source")
        if isinstance(extra_source, str) and "manual" in extra_source.lower():
            return "human"

    return None


def _extract_agent_name(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    direct = metadata.get("agent_name")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    manual_author = metadata.get("manual_author") or metadata.get("manualAuthor")
    if isinstance(manual_author, str) and manual_author.strip():
        return manual_author.strip()
    agent = metadata.get("agent")
    if isinstance(agent, dict):
        for key in ("name", "display_name", "displayName", "full_name", "fullName"):
            candidate = agent.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    owner = metadata.get("owner") or metadata.get("owner_name")
    if isinstance(owner, str) and owner.strip():
        return owner.strip()
    user = metadata.get("user")
    if isinstance(user, dict):
        for key in ("name", "full_name", "fullName", "display_name", "displayName"):
            candidate = user.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    author = metadata.get("author") or metadata.get("author_name") or metadata.get("authorName")
    if isinstance(author, str) and author.strip():
        return author.strip()
    extra = metadata.get("extra")
    if isinstance(extra, str):
        try:
            extra = json.loads(extra)
        except json.JSONDecodeError:
            extra = None
    if isinstance(extra, dict):
        for key in ("agent_name", "manual_author", "manualAuthor"):
            candidate = extra.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        agent_extra = extra.get("agent")
        if isinstance(agent_extra, dict):
            for key in ("name", "display_name", "displayName", "full_name", "fullName"):
                candidate = agent_extra.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        for key in ("owner_name", "owner"):
            candidate = extra.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        user_extra = extra.get("user")
        if isinstance(user_extra, dict):
            for key in ("name", "full_name", "fullName", "display_name", "displayName"):
                candidate = user_extra.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        author_extra = extra.get("author") or extra.get("author_name") or extra.get("authorName")
        if isinstance(author_extra, str) and author_extra.strip():
            return author_extra.strip()
    return None


def _extract_agent_email(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    email_keys = ("manual_email", "manualEmail", "agent_email", "agentEmail", "email")
    for key in email_keys:
        candidate = metadata.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    user = metadata.get("user")
    if isinstance(user, dict):
        for key in ("email", "correo", "mail"):
            candidate = user.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    agent = metadata.get("agent")
    if isinstance(agent, dict):
        for key in ("email", "correo"):
            candidate = agent.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    extra = metadata.get("extra")
    if isinstance(extra, str):
        try:
            extra = json.loads(extra)
        except json.JSONDecodeError:
            extra = None
    if isinstance(extra, dict):
        for key in email_keys:
            candidate = extra.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        user_extra = extra.get("user")
        if isinstance(user_extra, dict):
            for key in ("email", "correo", "mail"):
                candidate = user_extra.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        agent_extra = extra.get("agent")
        if isinstance(agent_extra, dict):
            for key in ("email", "correo"):
                candidate = agent_extra.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
    return None


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
        "ultimo_mensaje:mensajes!conversaciones_ultimo_mensaje_fk(texto,direccion,creado_en,datos)"
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
        metadata = _coerce_metadata(ultimo.get("datos"))
        preview_sender_type = _extract_sender_type(metadata) if metadata else None
        preview_direction = ultimo.get("direccion")
        preview_author: str | None = None
        if preview_direction == "saliente":
            if preview_sender_type == "human":
                preview_author = _extract_agent_name(metadata)
            elif preview_sender_type == "assistant":
                preview_author = "Tal-IA"
            else:
                preview_author = _extract_agent_name(metadata) or "Tal-IA"
        elif preview_direction == "entrante":
            preview_author = contacto.get("nombre_completo") or "Usuario"

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
                "preview_direccion": preview_direction,
                "preview_ts": ultimo.get("creado_en"),
                "preview_sender_type": preview_sender_type,
                "preview_author": preview_author,
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


def _extract_session_id_from_contact(contact_data: Any) -> str | None:
    """Intenta extraer session_id de la estructura contacto_datos."""
    if not isinstance(contact_data, dict):
        return None
    candidates: list[Any] = [
        contact_data.get("session_id"),
        contact_data.get("SessionId"),
    ]
    trazabilidad = contact_data.get("trazabilidad")
    if isinstance(trazabilidad, dict):
        candidates.extend(
            [
                trazabilidad.get("session_id"),
                trazabilidad.get("SessionId"),
            ]
        )
    metadata = contact_data.get("metadata")
    if isinstance(metadata, dict):
        candidates.extend(
            [
                metadata.get("session_id"),
                metadata.get("SessionId"),
            ]
        )
    for candidate in candidates:
        if isinstance(candidate, str):
            stripped = candidate.strip()
            if stripped:
                return stripped
    return None


async def _resolve_webchat_session_id(contact_id: str) -> str | None:
    """Obtiene el session_id asociado al contacto webchat."""
    try:
        contact = await storage.fetch_contact(contact_id)
    except storage.StorageError as exc:
        logger.exception(
            "panel.inbox.fetch_contact_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        contact = None

    session_id: str | None = None
    if contact:
        session_id = _extract_session_id_from_contact(contact.get("contacto_datos"))
        if session_id:
            return session_id

    try:
        return await storage.fetch_webchat_session_id(contact_id)
    except storage.StorageError as exc:
        logger.exception(
            "panel.inbox.fetch_session_id_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return None


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
        "select": (
            "id,direccion,tipo_contenido,texto,creado_en,datos,"
            "attachments:adjuntos(id,url,mime,tamano_bytes,size_bytes,proveedor_id,nombre,path)"
        ),
        "conversacion_id": f"eq.{conversacion_id}",
        "order": "creado_en.asc",
        "limit": str(limit),
    }
    resp = await _sb_get("/rest/v1/mensajes", params=params, token=token)
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail="Error consultando mensajes")
    if resp.status_code >= 400:
        logger.warning(
            "panel.inbox.messages_denied",
            extra={
                "status_code": resp.status_code,
                "conversation_id": conversacion_id,
                "supabase_body": resp.text[:300],
            },
        )
        return {"ok": True, "items": []}
    raw = resp.json() or []
    items: list[dict[str, Any]] = []
    for row in raw:
        datos = row.get("datos") or {}
        sender_type = datos.get("sender_type")
        metadata = datos if isinstance(datos, dict) else {}
        raw_attachments = row.get("attachments") or []
        attachments: list[dict[str, Any]] = []
        if isinstance(raw_attachments, list):
            for attachment in raw_attachments:
                if not isinstance(attachment, dict):
                    continue
                url = attachment.get("url")
                if not url:
                    continue
                size_value = (
                    attachment.get("size")
                    or attachment.get("size_bytes")
                    or attachment.get("tamano_bytes")
                )
                size: int | None = None
                if isinstance(size_value, (int, float)):
                    size = int(size_value)
                elif isinstance(size_value, str):
                    try:
                        size = int(float(size_value))
                    except (TypeError, ValueError):
                        size = None
                name_value = attachment.get("nombre") or attachment.get("name")
                name = name_value.strip() if isinstance(name_value, str) else None
                provider_id = attachment.get("proveedor_id") or attachment.get("provider_id")
                attachments.append(
                    {
                        "id": attachment.get("id"),
                        "url": url,
                        "mime": attachment.get("mime"),
                        "size": size,
                        "name": name,
                        "provider_id": provider_id,
                        "path": attachment.get("path"),
                    }
                )
        items.append(
            {
                "id": row.get("id"),
                "direccion": row.get("direccion"),
                "tipo_contenido": row.get("tipo_contenido"),
                "texto": row.get("texto"),
                "creado_en": row.get("creado_en"),
                "sender_type": sender_type,
                "metadata": metadata or None,
                "attachments": attachments or None,
            }
        )
    return {"ok": True, "items": items}


@router.get("/inbox/{conversacion_id}/messages")
async def get_inbox_messages(
    conversacion_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Alias compatible con el frontend React (Next.js) que consume `/api/inbox/...`.

    El backend histórico usaba `/api/conversaciones/...`, así que delegamos a esa
    implementación asegurando que las respuestas sean idénticas.
    """
    return await get_messages(
        conversacion_id=conversacion_id,
        limit=limit,
        authorization=authorization,
    )


async def _fetch_panel_user_profile(user_id: str) -> dict[str, Any] | None:
    params = {
        "id": f"eq.{user_id}",
        "select": "id,nombre_completo,correo",
        "limit": "1",
    }
    try:
        resp = await _sb_get("/rest/v1/usuarios", params=params, token=None)
    except HTTPException as exc:  # pragma: no cover - red propagada
        logger.warning(
            "panel.inbox.manual_user_lookup_failed",
            extra={"user_id": user_id, "error": getattr(exc, "detail", str(exc))},
        )
        return None
    except Exception as exc:  # pragma: no cover - red variada
        logger.exception(
            "panel.inbox.manual_user_lookup_exception",
            extra={"user_id": user_id, "error": str(exc)},
        )
        return None

    if resp.status_code >= 400:
        logger.warning(
            "panel.inbox.manual_user_lookup_http_error",
            extra={
                "user_id": user_id,
                "status": resp.status_code,
                "body_sample": resp.text[:120],
            },
        )
        return None
    try:
        payload = resp.json()
    except ValueError:
        logger.warning(
            "panel.inbox.manual_user_lookup_parse_error",
            extra={"user_id": user_id},
        )
        return None
    if not isinstance(payload, list) or not payload:
        return None
    record = payload[0]
    if isinstance(record, dict):
        return record
    return None


@router.post("/conversaciones/{conversacion_id}/responder")
async def reply_conversation(
    conversacion_id: UUID,
    payload: ConversationReplyPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    content_raw = payload.content or ""
    content = content_raw.strip()
    has_attachments = bool(payload.attachments)
    attachments_payload = [
        attachment.model_dump(mode="json") for attachment in (payload.attachments or [])
    ]
    if not content and not has_attachments:
        raise HTTPException(status_code=422, detail="message_required")

    try:
        conversation_meta = await storage.fetch_webchat_conversation(str(conversacion_id))
    except storage.StorageError as exc:
        message = str(exc)
        lowered = message.lower()
        log_extra = {"conversation_id": str(conversacion_id), "error": message}
        if "no encontrada" in lowered or "not found" in lowered:
            logger.warning("panel.inbox.conversation_not_found", extra=log_extra)
            raise HTTPException(status_code=404, detail="conversation_not_found") from exc
        logger.exception("panel.inbox.fetch_conversation_failed", extra=log_extra)
        raise HTTPException(status_code=502, detail="No se pudo recuperar la conversación") from exc

    channel = (conversation_meta.get("channel") or "").lower()
    if channel != "webchat":
        raise HTTPException(status_code=400, detail="unsupported_channel")

    contact_id = conversation_meta.get("contact_id")
    if not contact_id:
        raise HTTPException(status_code=500, detail="conversation_contact_missing")

    session_id = await _resolve_webchat_session_id(str(contact_id))
    if not session_id:
        raise HTTPException(status_code=409, detail="session_id_not_found")

    client_message_id = payload.client_message_id or uuid4().hex
    message_payload = webchat_schemas.MessageRequest(
        session_id=session_id,
        author="user",
        content=content,
        client_message_id=client_message_id,
        locale=payload.locale,
        metadata=payload.metadata,
        attachments=payload.attachments,
    )

    manual_override = bool(conversation_meta.get("manual_override"))
    if not manual_override:
        # Revalida con tabla de controles para evitar lecturas inconsistentes.
        try:
            manual_override = await storage.get_manual_override(str(conversacion_id))
        except storage.StorageError as exc:
            logger.exception(
                "panel.inbox.manual_check_failed",
                extra={"conversation_id": str(conversacion_id), "error": str(exc)},
            )

    logger.info(
        "panel.inbox.manual_state",
        extra={
            "conversation_id": str(conversacion_id),
            "manual_override": manual_override,
        },
    )

    if manual_override:
        extra_metadata: dict[str, Any] = {
            "conversation_id": str(conversacion_id),
            "client_message_id": client_message_id,
            "manual_override": True,
            "manual_mode": True,
            "origin": "panel_manual",
            "sender_type": "human",
            "author_type": "human",
        }
        if payload.locale:
            extra_metadata["locale"] = payload.locale
        manual_user_id = _jwt_verify_and_sub(token)
        manual_user_id = manual_user_id.strip() if isinstance(manual_user_id, str) else None

        agent_payload: dict[str, Any] = {}
        if payload.metadata and isinstance(payload.metadata, dict):
            agent_payload.update(payload.metadata)

        manual_name = _extract_agent_name(agent_payload) if agent_payload else None
        if manual_name and manual_name.strip().lower() in {"agent", "agente"}:
            manual_name = None
        manual_email = _extract_agent_email(agent_payload) if agent_payload else None

        if manual_user_id:
            for key in (
                "user_id",
                "userId",
                "manual_user_id",
                "manualUserId",
                "agent_id",
                "agentId",
            ):
                agent_payload.setdefault(key, manual_user_id)

        profile: dict[str, Any] | None = None
        if manual_user_id and (manual_name is None or manual_email is None):
            profile = await _fetch_panel_user_profile(manual_user_id)

        if profile:
            if manual_name is None:
                profile_name = _clean_str(profile.get("nombre_completo")) or _clean_str(
                    profile.get("correo")
                )
                if profile_name:
                    manual_name = profile_name
            if manual_email is None:
                profile_email = _clean_str(profile.get("correo"))
                if profile_email:
                    manual_email = profile_email

        if manual_name is None and manual_email:
            local_part = manual_email.split("@")[0]
            fallback_name = local_part.strip() or manual_email
            manual_name = fallback_name

        if manual_name:
            for key in ("manual_author", "manualAuthor", "agent_name", "agentName"):
                agent_payload.setdefault(key, manual_name)
        if manual_email:
            for key in ("manual_email", "manualEmail", "agent_email", "agentEmail"):
                agent_payload.setdefault(key, manual_email)

        if manual_user_id or manual_name or manual_email:
            user_section = agent_payload.get("user")
            if isinstance(user_section, dict):
                user_payload = dict(user_section)
            else:
                user_payload = {}
            if manual_user_id and "id" not in user_payload:
                user_payload["id"] = manual_user_id
            if manual_name and "name" not in user_payload:
                user_payload["name"] = manual_name
            if manual_email and "email" not in user_payload:
                user_payload["email"] = manual_email
            if user_payload:
                user_payload.setdefault("type", "human")
                agent_payload["user"] = user_payload

        if agent_payload:
            agent_payload.setdefault("origin", agent_payload.get("origin") or "panel_manual")
            agent_payload.setdefault("source", agent_payload.get("source") or "panel_manual")
            agent_payload.setdefault("sender_type", agent_payload.get("sender_type") or "human")
            agent_payload.setdefault("senderType", agent_payload.get("senderType") or "human")
            agent_payload.setdefault("author_type", agent_payload.get("author_type") or "human")
            agent_payload.setdefault("authorType", agent_payload.get("authorType") or "human")

            for key, value in agent_payload.items():
                if key not in extra_metadata and key != "attachments":
                    extra_metadata[key] = value
            extra_metadata["extra"] = agent_payload
            resolved_name = manual_name or _extract_agent_name(agent_payload)
            if resolved_name:
                extra_metadata.setdefault("manual_author", resolved_name)
                extra_metadata.setdefault("agent_name", resolved_name)
            else:
                agent_name = agent_payload.get("agent_name") or agent_payload.get("agentName")
                if isinstance(agent_name, str) and agent_name.strip():
                    extra_metadata.setdefault("agent_name", agent_name.strip())
            resolved_email = manual_email or _extract_agent_email(agent_payload)
            if resolved_email:
                extra_metadata.setdefault("manual_email", resolved_email)
                extra_metadata.setdefault("agent_email", resolved_email)
        try:
            await storage.register_webchat_message(
                session_id=session_id,
                author="agent",
                content=content,
                inactivity_hours=settings.webchat_inactivity_hours,
                metadata=extra_metadata,
                attachments=attachments_payload,
            )
        except storage.StorageError as exc:
            logger.exception(
                "panel.inbox.manual_register_failed",
                extra={"conversation_id": str(conversacion_id), "error": str(exc)},
            )
            raise HTTPException(status_code=502, detail="No se pudo registrar el mensaje") from exc

        try:
            await webchat_service.append_manual_agent_context(
                conversation_meta=conversation_meta,
                session_id=session_id,
                content=content,
                locale=payload.locale,
            )
        except Exception as exc:  # pragma: no cover - logging defensivo
            logger.exception(
                "panel.inbox.manual_context_append_failed",
                extra={"conversation_id": str(conversacion_id), "error": str(exc)},
            )

        logger.info(
            "panel.inbox.manual_message_recorded",
            extra={
                "conversation_id": str(conversacion_id),
                "session_id": session_id,
                "client_message_id": client_message_id,
            },
        )

        metadata: dict[str, Any] = {
            "conversation_id": str(conversacion_id),
            "client_message_id": client_message_id,
            "manual_mode": True,
            "session_id": session_id,
            "contact_id": str(contact_id),
            "sender_type": "human",
            "author_type": "human",
        }
        if attachments_payload:
            metadata["attachments"] = attachments_payload
        if agent_payload:
            metadata["extra"] = agent_payload
            manual_name_resp = agent_payload.get("manual_author") or agent_payload.get(
                "manualAuthor"
            )
            agent_name_resp = agent_payload.get("agent_name") or agent_payload.get("agentName")
            manual_email_resp = (
                agent_payload.get("manual_email")
                or agent_payload.get("manualEmail")
                or agent_payload.get("agent_email")
                or agent_payload.get("agentEmail")
            )
            if isinstance(agent_name_resp, str) and agent_name_resp.strip():
                metadata["agent_name"] = agent_name_resp.strip()
            elif isinstance(manual_name_resp, str) and manual_name_resp.strip():
                metadata["agent_name"] = manual_name_resp.strip()
            if isinstance(manual_name_resp, str) and manual_name_resp.strip():
                metadata["manual_author"] = manual_name_resp.strip()
            if isinstance(manual_email_resp, str) and manual_email_resp.strip():
                cleaned_email = manual_email_resp.strip()
                metadata["manual_email"] = cleaned_email
                metadata.setdefault("agent_email", cleaned_email)
        return {
            "ok": True,
            "reply": None,
            "metadata": metadata,
        }

    try:
        logger.info(
            "panel.inbox.manual_state_auto_reply",
            extra={
                "conversation_id": str(conversacion_id),
                "manual_override": manual_override,
                "client_message_id": client_message_id,
            },
        )
        assistant_response = await webchat_service.handle_message(
            message_payload,
            request=None,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - logging y error genérico
        logger.exception(
            "panel.inbox.assistant_failed",
            extra={"conversation_id": str(conversacion_id), "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="Error al invocar al asistente") from exc

    metadata_model = assistant_response.metadata
    metadata = (
        metadata_model.model_dump(exclude_none=True)
        if isinstance(metadata_model, BaseModel)
        else {}
    )
    metadata.setdefault("conversation_id", str(conversacion_id))
    metadata.setdefault("client_message_id", client_message_id)
    metadata.setdefault(
        "manual_mode",
        (
            bool(metadata_model.manual_mode)
            if isinstance(metadata_model, webchat_schemas.MessageMetadata)
            else False
        ),
    )
    metadata.setdefault("session_id", session_id)
    metadata.setdefault("contact_id", str(contact_id))

    return {
        "ok": True,
        "reply": assistant_response.reply,
        "metadata": metadata,
    }


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


VISITAS_SORT_FIELDS: dict[str, str] = {
    "session": "session",
    "ip": "ip",
    "visitas": "visitas",
    "primera": "primera",
    "ultimo": "ultimo",
    "stay": "stay",
    "avg_stay": "avg_stay",
    "chat": "chat",
    "country": "country",
    "state": "state",
    "city": "city",
    "device": "device",
    "referrer": "referrer",
    "landing": "landing",
}


@router.get("/visitas/webchat")
async def visitas_webchat_detalle(
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    con_chat: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    pais: str | None = Query(default=None),
    ciudad: str | None = Query(default=None),
    session: str | None = Query(default=None, description="Filtro por ID de sesión (parcial)."),
    ip: str | None = Query(default=None, description="Filtro por IP (parcial)."),
    visitas_min: int | None = Query(default=None, ge=0),
    visitas_max: int | None = Query(default=None, ge=0),
    primera_desde: str | None = Query(default=None),
    primera_hasta: str | None = Query(default=None),
    ultimo_desde: str | None = Query(default=None),
    ultimo_hasta: str | None = Query(default=None),
    estancia_min: float | None = Query(default=None, ge=0.0),
    estancia_max: float | None = Query(default=None, ge=0.0),
    estancia_promedio_min: float | None = Query(default=None, ge=0.0),
    estancia_promedio_max: float | None = Query(default=None, ge=0.0),
    contacto_estado: str | None = Query(
        default=None,
        description="Estado del contacto (completo, incompleto, sin_contacto).",
    ),
    dispositivo: str | None = Query(
        default=None, description="Lista separada por comas de tipos de dispositivo."
    ),
    referrer: str | None = Query(default=None),
    landing: str | None = Query(default=None),
    orden: str | None = Query(default=None, description="Campo de ordenamiento."),
    direccion: str | None = Query(
        default=None, description="Dirección de ordenamiento (asc/desc)."
    ),
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
    country = pais.strip().upper() if pais else None
    if country == "":
        country = None
    city = ciudad.strip() if ciudad else None
    if city == "":
        city = None
    session_filter = session.strip() if session else None
    if session_filter == "":
        session_filter = None
    ip_filter = ip.strip() if ip else None
    if ip_filter == "":
        ip_filter = None

    visitas_min_value = visitas_min if visitas_min is not None else None
    visitas_max_value = visitas_max if visitas_max is not None else None
    primera_desde_dt = (
        _parse_date_value(primera_desde, field="primera_desde") if primera_desde else None
    )
    primera_hasta_dt = (
        _parse_date_value(primera_hasta, field="primera_hasta") if primera_hasta else None
    )
    ultimo_desde_dt = (
        _parse_date_value(ultimo_desde, field="ultimo_desde") if ultimo_desde else None
    )
    ultimo_hasta_dt = (
        _parse_date_value(ultimo_hasta, field="ultimo_hasta") if ultimo_hasta else None
    )
    estancia_min_value = float(estancia_min) if estancia_min is not None else None
    estancia_max_value = float(estancia_max) if estancia_max is not None else None
    estancia_promedio_min_value = (
        float(estancia_promedio_min) if estancia_promedio_min is not None else None
    )
    estancia_promedio_max_value = (
        float(estancia_promedio_max) if estancia_promedio_max is not None else None
    )

    contacto_estado_norm = contacto_estado.strip().lower() if contacto_estado else None
    if contacto_estado_norm in {"", "todos", "all"}:
        contacto_estado_norm = None
    valid_contact_states = {"completo", "incompleto", "sin", "sin_contacto"}
    if contacto_estado_norm is not None and contacto_estado_norm not in valid_contact_states:
        raise HTTPException(status_code=400, detail="contacto_estado_invalid")

    device_values: list[str] | None = None
    if dispositivo:
        candidates = [part.strip() for part in dispositivo.split(",") if part.strip()]
        if candidates:
            device_values = candidates
    referrer_filter = referrer.strip() if referrer else None
    if referrer_filter == "":
        referrer_filter = None
    landing_filter = landing.strip() if landing else None
    if landing_filter == "":
        landing_filter = None

    orden_norm = (orden or "").strip().lower()
    if orden_norm and orden_norm not in VISITAS_SORT_FIELDS:
        raise HTTPException(status_code=400, detail="orden_invalid")
    order_field = orden_norm or None

    direccion_norm = (direccion or "").strip().lower()
    if direccion_norm and direccion_norm not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="direccion_invalid")
    order_direction = direccion_norm or None

    try:
        payload = await storage.fetch_webchat_visitas_detalle(
            date_from=date_from,
            date_to=date_to,
            has_chat=has_chat,
            session=session_filter,
            ip=ip_filter,
            state=state,
            country=country,
            city=city,
            search=search,
            visit_min=visitas_min_value,
            visit_max=visitas_max_value,
            first_from=primera_desde_dt,
            first_to=primera_hasta_dt,
            last_from=ultimo_desde_dt,
            last_to=ultimo_hasta_dt,
            stay_min=estancia_min_value,
            stay_max=estancia_max_value,
            avg_stay_min=estancia_promedio_min_value,
            avg_stay_max=estancia_promedio_max_value,
            contact_status=contacto_estado_norm,
            device_types=device_values,
            referrer=referrer_filter,
            landing=landing_filter,
            order_by=order_field,
            order_dir=order_direction,
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
            "pais": country,
            "ciudad": city,
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


def _parse_stages_param(etapas: str | None) -> list[str]:
    if not etapas:
        return []
    values: list[str] = []
    for chunk in etapas.split(","):
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


@router.get("/kpis/demografia/resumen")
async def demografia_resumen(
    nivel: str = Query(default="estado"),
    canales: str | None = Query(default=None),
    etapas: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    nivel_normalizado = nivel.lower()
    if nivel_normalizado not in {"pais", "estado", "municipio"}:
        raise HTTPException(status_code=400, detail="nivel_invalid")

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    channel_values = _parse_channels_param(canales)
    stage_values = _parse_stages_param(etapas)

    try:
        leads_payload = await demografia_service.fetch_leads_resumen(
            nivel=nivel_normalizado,
            channels=channel_values,
            stages=stage_values,
            date_from=date_from,
            date_to=date_to,
            jwt=token,
        )
        visitantes_payload = await demografia_service.fetch_visitantes_resumen(
            nivel=nivel_normalizado,
            date_from=date_from,
            date_to=date_to,
        )
    except demografia_service.DemografiaServiceError as exc:
        logger.exception("demografia.resumen_fetch_failed")
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando demografía"
        ) from exc

    return {
        "ok": True,
        "nivel": nivel_normalizado,
        "canales": channel_values,
        "etapas": stage_values,
        "range": _build_range_payload(rango, date_from, date_to),
        "leads": leads_payload,
        "visitantes": visitantes_payload,
    }


@router.get("/kpis/demografia/mapa")
async def demografia_mapa(
    nivel: str = Query(default="estado"),
    estado: str | None = Query(default=None),
    canales: str | None = Query(default=None),
    etapas: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    nivel_normalizado = nivel.lower()
    if nivel_normalizado not in {"pais", "estado", "municipio"}:
        raise HTTPException(status_code=400, detail="nivel_invalid")

    state_code: str | None = None
    if nivel_normalizado == "municipio":
        if not estado:
            raise HTTPException(status_code=400, detail="estado_required")
        state_code = _ensure_state_code(estado)

    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    channel_values = _parse_channels_param(canales)
    stage_values = _parse_stages_param(etapas)

    try:
        leads_payload = await demografia_service.fetch_leads_resumen(
            nivel=nivel_normalizado,
            channels=channel_values,
            stages=stage_values,
            date_from=date_from,
            date_to=date_to,
            jwt=token,
        )
        fallback_leads_payload = None
        if nivel_normalizado == "municipio":
            fallback_leads_payload = await demografia_service.fetch_leads_resumen(
                nivel="estado",
                channels=channel_values,
                stages=stage_values,
                date_from=date_from,
                date_to=date_to,
                jwt=token,
            )
        visitantes_payload = await demografia_service.fetch_visitantes_resumen(
            nivel=nivel_normalizado,
            date_from=date_from,
            date_to=date_to,
        )
        dataset = demografia_service.build_map_dataset(
            nivel=nivel_normalizado,
            leads_payload=leads_payload,
            visitantes_payload=visitantes_payload,
            state_filter=state_code,
            fallback_leads_payload=fallback_leads_payload,
        )
    except demografia_service.DemografiaServiceError as exc:
        logger.exception("demografia.mapa_fetch_failed")
        raise HTTPException(
            status_code=502, detail=str(exc) or "Error consultando demografía"
        ) from exc

    try:
        if nivel_normalizado == "pais":
            geojson = leads_geo.load_world_countries_geojson()
        elif nivel_normalizado == "estado":
            geojson = leads_geo.load_full_states_geojson()
        else:
            geojson = leads_geo.load_state_municipalities_geojson(state_code or "00")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="estado_not_found") from exc

    return {
        "ok": True,
        "nivel": nivel_normalizado,
        "estado": state_code,
        "canales": channel_values,
        "etapas": stage_values,
        "range": _build_range_payload(rango, date_from, date_to),
        "totales_leads": (leads_payload.get("totals") if isinstance(leads_payload, dict) else {}),
        "totales_visitantes": (
            visitantes_payload.get("totals") if isinstance(visitantes_payload, dict) else {}
        ),
        "totales_leads_por_canal": (
            leads_payload.get("totals_by_channel") if isinstance(leads_payload, dict) else {}
        ),
        "captado_orden": (
            leads_payload.get("captado_orden") if isinstance(leads_payload, dict) else None
        ),
        "dataset": dataset,
        "geojson": geojson,
    }


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
                {
                    "cve_ent": key,
                    "nombre": row.get("nombre"),
                    "total": 0,
                    "por_canal": {},
                },
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
                {
                    "cvegeo": key,
                    "nombre": row.get("nombre"),
                    "total": 0,
                    "por_canal": {},
                },
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


# ---------------------------------------------------------------------------
# Prospección · Google Places
# ---------------------------------------------------------------------------


@router.post("/prospeccion/google/busquedas")
async def crear_busqueda_google(
    payload: GoogleProspeccionBusquedaPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    client = GooglePlacesClient()
    query_value = payload.query or ", ".join(payload.included_types or []) or "google_places"
    try:
        places = await client.search_places(
            query=payload.query,
            latitude=payload.lat,
            longitude=payload.lng,
            radius_m=payload.radio_m,
            included_types=payload.included_types,
            strategy=payload.strategy,
            language_code=payload.language_code,
            region_code=payload.region_code,
            enrich_details=True,
        )
    except GooglePlacesError as exc:
        detail = str(exc) or "google_places_error"
        raise HTTPException(status_code=502, detail=detail) from exc

    normalized_items = [normalize_place_for_result(place) for place in places]
    meta_payload: dict[str, Any] = {
        "strategy": payload.strategy,
        "included_types": payload.included_types,
    }
    if payload.meta:
        meta_payload.update(payload.meta)
    if payload.language_code:
        meta_payload["language_code"] = payload.language_code
    if payload.region_code:
        meta_payload["region_code"] = payload.region_code

    crear_resp = await _sb_post(
        "/rest/v1/rpc/crear_busqueda",
        json={
            "p_fuente": "google_places",
            "p_query": query_value,
            "p_radio_m": payload.radio_m,
            "p_lat": payload.lat,
            "p_lng": payload.lng,
            "p_total": len(normalized_items),
            "p_meta": meta_payload,
        },
        token=token,
    )
    if crear_resp.status_code >= 400:
        raise _supabase_error(crear_resp, "error_creando_busqueda")
    try:
        crear_data = crear_resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="busqueda_id_missing")
    busqueda_value = _rpc_field(crear_data, "crear_busqueda", "id")
    try:
        busqueda_uuid = UUID(str(busqueda_value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=502, detail="busqueda_id_invalid")

    upserted = 0
    if normalized_items:
        upsert_resp = await _sb_post(
            "/rest/v1/rpc/upsert_resultados_lote",
            json={
                "p_busqueda_id": str(busqueda_uuid),
                "p_fuente": "google_places",
                "p_items": normalized_items,
            },
            token=token,
        )
        if upsert_resp.status_code >= 400:
            raise _supabase_error(upsert_resp, "error_guardando_resultados")
        try:
            upsert_data = upsert_resp.json()
        except ValueError:
            upsert_data = None
        upsert_value = _rpc_field(upsert_data, "upsert_resultados_lote")
        try:
            upserted = int(upsert_value or 0)
        except (TypeError, ValueError):
            upserted = len(normalized_items)

    preview = [_result_preview(item) for item in normalized_items[: min(10, len(normalized_items))]]
    return {
        "ok": True,
        "busqueda_id": str(busqueda_uuid),
        "google_results": len(normalized_items),
        "upserted": upserted,
        "preview": preview,
    }


@router.post("/prospeccion/denue/busquedas")
async def crear_busqueda_denue(
    payload: DenueBusquedaPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    client = DenueClient()
    try:
        records = await client.search(
            query=payload.query,
            latitude=payload.lat,
            longitude=payload.lng,
            radius_m=payload.radio_m,
        )
    except DenueError as exc:
        detail = str(exc) or "denue_error"
        raise HTTPException(status_code=502, detail=detail) from exc

    normalized_items = [normalize_denue_place(item) for item in records]
    meta_payload: dict[str, Any] = {"query": payload.query}
    if payload.meta:
        meta_payload.update(payload.meta)

    crear_resp = await _sb_post(
        "/rest/v1/rpc/crear_busqueda",
        json={
            "p_fuente": "denue",
            "p_query": payload.query,
            "p_radio_m": payload.radio_m,
            "p_lat": payload.lat,
            "p_lng": payload.lng,
            "p_total": len(normalized_items),
            "p_meta": meta_payload,
        },
        token=token,
    )
    if crear_resp.status_code >= 400:
        raise _supabase_error(crear_resp, "error_guardando_busqueda")
    try:
        crear_data = crear_resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="busqueda_id_missing")
    busqueda_value = _rpc_field(crear_data, "crear_busqueda", "id")
    try:
        busqueda_uuid = UUID(str(busqueda_value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=502, detail="busqueda_id_invalid")

    upserted = 0
    if normalized_items:
        upsert_resp = await _sb_post(
            "/rest/v1/rpc/upsert_resultados_lote",
            json={
                "p_busqueda_id": str(busqueda_uuid),
                "p_fuente": "denue",
                "p_items": normalized_items,
            },
            token=token,
        )
        if upsert_resp.status_code >= 400:
            raise _supabase_error(upsert_resp, "error_upsert_denue")
        try:
            upsert_data = upsert_resp.json()
        except ValueError:
            upsert_data = {}
        if isinstance(upsert_data, dict):
            upserted = (
                upsert_data.get("upserted") or upsert_data.get("total") or len(normalized_items)
            )
        elif isinstance(upsert_data, int):
            upserted = upsert_data
        else:
            upserted = len(normalized_items)

    preview = [_result_preview(item) for item in normalized_items[: min(10, len(normalized_items))]]
    return {
        "ok": True,
        "busqueda_id": str(busqueda_uuid),
        "denue_results": len(normalized_items),
        "upserted": upserted,
        "preview": preview,
    }


@router.get("/prospeccion/google/busquedas")
async def listar_busquedas_google(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, description="Filtro parcial sobre el query."),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    params: dict[str, str] = {
        "select": "id,fuente,query,radio_m,lat,lng,meta,total_encontrados,creado_en",
        "order": "creado_en.desc",
        "limit": str(limit),
        "offset": str(offset),
        "fuente": "eq.google_places",
    }
    if search:
        params["query"] = _ilike_param(search)

    resp = await _sb_get(
        "/rest/v1/busquedas",
        params=params,
        token=token,
        prefer="count=planned",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_listando_busquedas")
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    total = _content_range_total(resp.headers.get("content-range"))
    return {
        "ok": True,
        "items": rows,
        "limit": limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.delete("/prospeccion/google/busquedas/{busqueda_id}")
async def eliminar_busqueda_google(
    busqueda_id: UUID,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)

    resp = await _sb_delete(
        "/rest/v1/busquedas",
        params={
            "id": f"eq.{busqueda_id}",
            "fuente": "eq.google_places",
        },
        token=None,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_eliminando_busqueda")
    if resp.status_code == 204:
        return {"ok": True, "deleted": 0}
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    if not rows:
        return {"ok": True, "deleted": 0}
    return {"ok": True, "deleted": len(rows)}


@router.get("/prospeccion/denue/busquedas")
async def listar_busquedas_denue(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    params: dict[str, str] = {
        "select": "id,fuente,query,radio_m,lat,lng,meta,total_encontrados,creado_en",
        "order": "creado_en.desc",
        "limit": str(limit),
        "offset": str(offset),
        "fuente": "eq.denue",
    }
    if search:
        params["query"] = _ilike_param(search)

    resp = await _sb_get(
        "/rest/v1/busquedas",
        params=params,
        token=token,
        prefer="count=planned",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_listando_busquedas")
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    total = _content_range_total(resp.headers.get("content-range"))
    return {
        "ok": True,
        "items": rows,
        "limit": limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.delete("/prospeccion/denue/busquedas/{busqueda_id}")
async def eliminar_busqueda_denue(
    busqueda_id: UUID,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)

    resp = await _sb_delete(
        "/rest/v1/busquedas",
        params={
            "id": f"eq.{busqueda_id}",
            "fuente": "eq.denue",
        },
        token=None,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_eliminando_busqueda")
    if resp.status_code == 204:
        return {"ok": True, "deleted": 0}
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    if not rows:
        # Supabase puede no devolver representación si RLS impide SELECT, pero el DELETE fue OK.
        return {"ok": True, "deleted": 0}
    return {"ok": True, "deleted": len(rows)}


@router.get("/prospeccion/google/resultados")
async def listar_resultados_google(
    busqueda_id: UUID | None = Query(default=None),
    q: str | None = Query(
        default=None, description="Filtro parcial en nombre, actividad o dirección."
    ),
    tipo: str | None = Query(default=None, description="Filtra por google_primary_type."),
    max_distancia_m: int | None = Query(default=None, ge=1, le=50000),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    limit: int = Query(default=250, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    order: Literal["recientes", "rating", "distancia"] = Query(default="recientes"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    order_map = {
        "recientes": "resultado_creado_en.desc",
        "rating": "rating.desc.nullslast",
        "distancia": "distancia_m.asc.nullslast",
    }
    params_base: dict[str, str] = {
        "select": "*",
        "order": order_map.get(order, "resultado_creado_en.desc"),
    }
    if busqueda_id:
        params_base["busqueda_id"] = f"eq.{busqueda_id}"
    if tipo:
        params_base["google_primary_type"] = f"eq.{tipo}"
    if max_distancia_m:
        params_base["distancia_m"] = f"lte.{max_distancia_m}"
    if min_rating is not None:
        params_base["rating"] = f"gte.{min_rating}"
    if q:
        sanitized = q.replace("*", "").replace("%", "")
        params_base["or"] = (
            f"(display_name.ilike.*{sanitized}*,"
            f"actividad.ilike.*{sanitized}*,"
            f"address.ilike.*{sanitized}*)"
        )

    effective_limit = min(limit, 500)
    params_base["limit"] = str(effective_limit)
    params_base["offset"] = str(offset)

    resp = await _sb_get(
        "/rest/v1/v_google_places_contactables",
        params=params_base,
        token=token,
        prefer="count=planned",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_listando_resultados")
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    total = _content_range_total(resp.headers.get("content-range")) or len(rows)

    return {
        "ok": True,
        "items": rows,
        "limit": effective_limit,
        "offset": offset,
        "total": total,
    }


@router.delete("/prospeccion/google/resultados")
async def eliminar_resultados_google(
    payload: DeleteResultadosPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    if not payload.ids:
        raise HTTPException(status_code=400, detail="ids_required")

    ids_param = ",".join(str(value) for value in payload.ids)
    resp = await _sb_delete(
        "/rest/v1/resultados",
        params={
            "id": f"in.({ids_param})",
            "fuente": "eq.google_places",
        },
        token=None,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_eliminando_resultados")
    if resp.status_code == 204:
        return {"ok": True, "deleted": 0}
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    if not rows:
        return {"ok": True, "deleted": 0}
    return {"ok": True, "deleted": len(rows)}


@router.get("/prospeccion/denue/resultados")
async def listar_resultados_denue(
    busqueda_id: UUID | None = Query(default=None),
    q: str | None = Query(
        default=None, description="Filtro parcial en nombre, actividad o dirección."
    ),
    estrato: str | None = Query(
        default=None, description="Filtra por tamaño de empresa (estrato)."
    ),
    limit: int = Query(default=250, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    order: Literal["recientes", "distancia"] = Query(default="recientes"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="auth_required")

    order_map = {
        "recientes": "resultado_creado_en.desc",
        "distancia": "distancia_m.asc.nullslast",
    }
    params_base: dict[str, str] = {
        "select": "*",
        "order": order_map.get(order, "resultado_creado_en.desc"),
    }
    if busqueda_id:
        params_base["busqueda_id"] = f"eq.{busqueda_id}"
    if estrato:
        params_base["estrato"] = f"eq.{estrato}"
    if q:
        sanitized = q.replace("*", "").replace("%", "")
        params_base["or"] = (
            f"(display_name.ilike.*{sanitized}*,"
            f"actividad.ilike.*{sanitized}*,"
            f"address.ilike.*{sanitized}*)"
        )

    effective_limit = min(limit, 500)
    params_base["limit"] = str(effective_limit)
    params_base["offset"] = str(offset)

    resp = await _sb_get(
        "/rest/v1/v_denue_contactables",
        params=params_base,
        token=token,
        prefer="count=planned",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_listando_resultados")
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    total = _content_range_total(resp.headers.get("content-range")) or len(rows)

    return {
        "ok": True,
        "items": rows,
        "limit": effective_limit,
        "offset": offset,
        "total": total,
    }


@router.delete("/prospeccion/denue/resultados")
async def eliminar_resultados_denue(
    payload: DeleteResultadosPayload,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_admin(authorization)
    if not payload.ids:
        raise HTTPException(status_code=400, detail="ids_required")

    ids_param = ",".join(str(value) for value in payload.ids)
    resp = await _sb_delete(
        "/rest/v1/resultados",
        params={
            "id": f"in.({ids_param})",
            "fuente": "eq.denue",
        },
        token=None,
        prefer="return=representation",
    )
    if resp.status_code >= 400:
        raise _supabase_error(resp, "error_eliminando_resultados")
    if resp.status_code == 204:
        return {"ok": True, "deleted": 0}
    try:
        rows = resp.json() or []
    except ValueError:
        rows = []
    if not rows:
        return {"ok": True, "deleted": 0}
    return {"ok": True, "deleted": len(rows)}


@router.get("/panel/env.js")
async def panel_env_js() -> Response:
    """Expone configuración pública mínima para el panel.

    Usa variables del backend para evitar editar archivos estáticos en producción.
    """
    url = (settings.supabase_url or "").rstrip("/")
    anon = getattr(settings, "supabase_anon", None) or ""
    body = "window.SUPABASE_URL = '" + url + "';\n" "window.SUPABASE_ANON_KEY = '" + anon + "';\n"
    return Response(content=body, media_type="application/javascript")


@router.get("/analytics/catalog/ventas.csv")
async def catalogo_kpi_ventas_csv(
    mes_desde: str | None = Query(default=None, description="YYYY-MM-01"),
    mes_hasta: str | None = Query(default=None, description="YYYY-MM-01"),
    moneda: str | None = Query(default=None, min_length=3, max_length=3),
    authorization: str | None = Header(default=None),
):
    token = _require_token(authorization)
    params: dict[str, str] = {
        "select": "mes,catalog_item_id,item_nombre,moneda,total_vendido,unidades_vendidas,leads_ganados",
        "order": "mes.asc,item_nombre.asc",
    }
    if mes_desde and mes_hasta:
        params["and"] = f"(mes.gte.{mes_desde},mes.lte.{mes_hasta})"
    elif mes_desde:
        params["mes"] = f"gte.{mes_desde}"
    elif mes_hasta:
        params["mes"] = f"lte.{mes_hasta}"
    if moneda:
        params["moneda"] = f"eq.{moneda.upper()}"
    resp = await _sb_get("/rest/v1/ventas_por_producto_mes", params=params, token=token)
    if resp.status_code >= 400:
        raise _supabase_error(resp, "Error consultando ventas por producto")
    rows = resp.json() or []
    csv_content = _render_sales_csv(rows)
    filename = _sales_csv_filename(mes_desde, mes_hasta, moneda)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
