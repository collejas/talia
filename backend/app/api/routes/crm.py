"""Endpoints del CRM multi-tenant construidos sobre Supabase."""

from __future__ import annotations

import asyncio
import csv
import io
import json
import secrets
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from enum import Enum
from typing import Annotated, Any, Literal, Mapping, Sequence
from uuid import UUID, uuid4
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.channels.webchat import schemas as webchat_schemas
from app.channels.webchat import service as webchat_service
from app.channels.whatsapp import service as whatsapp_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import (
    DenueClient,
    DenueError,
    EmailSendError,
    TwilioLookupError,
    demografia_service,
    leads_geo,
    lookup_phone_number,
    normalize_denue_place,
    send_email,
    storage,
)
from app.services import calendar as calendar_service
from app.services import quotes as quotes_service
from app.services.buscador_jobs import BUSCADOR_JOB_MANAGER
from app.services.google_search_jobs import GOOGLE_SEARCH_JOB_MANAGER, GoogleSearchJob
from app.services.buscador_runner import BuscadorParams
from app.services.calendar import CalendarError
from app.services.brevo import process_brevo_events
from app.services.catalog_embeddings import CatalogEmbeddingService
from app.services.demografia_service import DemografiaServiceError
from app.services.metrics import metrics as contact_metrics
from app.services.prospeccion_contact_sender import contact_sender
from app.services.prospeccion_progress import progress_hub
from app.services.storage import StorageError

router = APIRouter(prefix="/crm", tags=["crm"])
logger = get_logger(__name__)

DEFAULT_TEMPLATE_SLUG = "default"
DEFAULT_QUOTE_TEMPLATE_SLUG = "default"
DEFAULT_REMINDER_SLUG = "default"
DEFAULT_CONTACTS_LIMIT = 200
DEFAULT_PORTAL_TOKEN_DAYS = 14
QUOTE_WITH_ITEMS_SELECT = "*,items:lead_cotizacion_items(*,catalog_item:catalog_items(id,slug,nombre,tipo,unidad,precio_base,moneda,impuestos,activo,descripcion_corta))"
QUOTE_DEFAULT_TAX_RATE = Decimal("0.16")
CURRENCY_QUANTUM = Decimal("0.01")
MAX_PROSPECCION_BATCH = 500


async def _run_catalog_reindex(
    organizacion_id: UUID,
    *,
    usuario_id: str | None = None,
    canal: str | None = None,
) -> None:
    """Reindexa por completo la vector store del catálogo para el tenant especificado."""
    logger.info(
        "vector_store.reindex.triggered",
        extra={"organizacion_id": str(organizacion_id)},
    )
    repo = CRMRepository()
    service = CatalogEmbeddingService(repo)
    status = "success"
    error_detail: str | None = None
    try:
        await service.reindex_catalog(organizacion_id)
        logger.info(
            "vector_store.reindex.completed",
            extra={"organizacion_id": str(organizacion_id)},
        )
    except Exception as exc:  # pragma: no cover - logging de errores de servicio externo
        status = "failed"
        error_detail = str(exc)
        logger.exception(
            "vector_store.reindex.failed",
            extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
        )
    finally:
        await service.audit_event(
            organizacion_id,
            "reindex",
            usuario_id=usuario_id,
            canal=canal,
            metadata={"status": status, "error": error_detail},
        )


def _trigger_catalog_reindex(
    background_tasks: BackgroundTasks,
    organizacion_value: Any | None,
    *,
    usuario_id: UUID | None = None,
    canal: str | None = None,
) -> None:
    """Programa la reindexación completa en segundo plano."""
    if not organizacion_value:
        return
    try:
        organizacion_id = UUID(str(organizacion_value))
    except (TypeError, ValueError):
        logger.warning(
            "vector_store.reindex.invalid_organizacion_id",
            extra={"value": organizacion_value},
        )
        return
        background_tasks.add_task(
            _run_catalog_reindex,
            organizacion_id,
            usuario_id=str(usuario_id) if usuario_id else None,
            canal=canal,
        )


def _map_delete_exception(
    exc: CRMRepositoryError,
    *,
    not_found_key: str,
    dependency_key: str,
    dependency_message: str,
) -> tuple[str, int]:
    text = str(exc)
    if dependency_key in text:
        return dependency_message, status.HTTP_409_CONFLICT
    if not_found_key in text:
        return not_found_key, status.HTTP_404_NOT_FOUND
    return text, status.HTTP_502_BAD_GATEWAY


def _extract_demo_booking_id(metadata: dict[str, Any]) -> str | None:
    """Obtiene el booking_id registrado en metadata.stage_prep.demo."""
    stage_prep = _ensure_dict(metadata.get("stage_prep"), default={})
    raw_demo = stage_prep.get("demo")
    if not isinstance(raw_demo, dict):
        return None
    booking_value = raw_demo.get("demo_booking_id")
    if isinstance(booking_value, str):
        trimmed = booking_value.strip()
        return trimmed or None
    return None


class CRMAccount(BaseModel):
    """Representación pública de una cuenta."""

    id: UUID
    organizacion_id: UUID
    nombre: str
    alias: str | None = None
    tipo: str | None = None
    industria: str | None = None
    tamano: str | None = Field(default=None, alias="tamano")
    sitio_web: str | None = None
    telefono: str | None = None
    correo: str | None = None
    direccion: dict | None = Field(default=None)
    propietario_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str

    model_config = {"populate_by_name": True}


class CRMAccountCreate(BaseModel):
    """Campos disponibles para crear una cuenta."""

    nombre: str = Field(..., max_length=255)
    alias: str | None = Field(default=None, max_length=255)
    tipo: str | None = Field(default=None, max_length=120)
    industria: str | None = Field(default=None, max_length=120)
    tamano: str | None = Field(default=None, max_length=120)
    sitio_web: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=64)
    correo: str | None = Field(default=None, max_length=320)
    direccion: dict | None = Field(default=None)
    propietario_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMAccountsResponse(BaseModel):
    """Respuesta paginada simple para cuentas."""

    items: list[CRMAccount]
    limit: int
    offset: int


class WhatsAppSalesAssignment(BaseModel):
    """Registro auditado de asignaciones de vendedores en WhatsApp."""

    id: UUID
    creado_en: str
    organizacion_id: UUID
    organizacion_nombre: str | None = None
    conversacion_id: str | None = None
    conversacion_canal: str | None = None
    oportunidad_id: UUID | None = None
    oportunidad_titulo: str | None = None
    contacto_id: UUID | None = None
    contacto_nombre: str | None = None
    contacto_empresa: str | None = None
    contacto_telefono: str | None = None
    contacto_correo: str | None = None
    vendedor_usuario_id: UUID
    vendedor_nombre: str | None = None
    vendedor_correo: str | None = None
    vendedor_telefono: str | None = None
    trigger_event: str
    metadata: dict[str, Any] | None = None


class WhatsAppSalesAssignmentsResponse(BaseModel):
    """Respuesta paginada para la vista de asignaciones WhatsApp."""

    items: list[WhatsAppSalesAssignment]
    limit: int
    offset: int


class ClienteOnboardingEstado(str, Enum):
    PENDIENTE = "pendiente"
    EN_PROGRESO = "en_progreso"
    COMPLETADO = "completado"


class ClienteDocumentoTipo(str, Enum):
    CONSTANCIA_FISCAL = "constancia_fiscal"
    COMPROBANTE_DOMICILIO = "comprobante_domicilio"
    IDENTIFICACION_OFICIAL = "identificacion_oficial"
    CONTRATO_SERVICIO = "contrato_servicio"
    NDA = "nda"
    OTRO = "otro"


class ClienteDocumentoEstado(str, Enum):
    PENDIENTE = "pendiente"
    RECIBIDO = "recibido"
    VALIDADO = "validado"
    RECHAZADO = "rechazado"


class ClienteFiscalUpdatePayload(BaseModel):
    estado_onboarding: ClienteOnboardingEstado | None = Field(default=None)
    rfc: str | None = Field(default=None, max_length=18)
    razon_social: str | None = Field(default=None, max_length=255)
    domicilio_fiscal: str | None = Field(default=None, max_length=500)
    domicilio_fisico: str | None = Field(default=None, max_length=500)
    regimen_fiscal: str | None = Field(default=None, max_length=120)
    datos_facturacion: dict[str, Any] | None = Field(default=None)


class ClienteDocumentoPayload(BaseModel):
    cliente_id: UUID | None = Field(default=None)
    tipo: ClienteDocumentoTipo
    estado: ClienteDocumentoEstado | None = Field(default=None)
    descripcion: str | None = Field(default=None, max_length=500)
    storage_url: str | None = Field(default=None, max_length=2048)
    storage_path: str | None = Field(default=None, max_length=2048)
    metadatos: dict[str, Any] | None = Field(default=None)


class ClienteDocumentoUpdatePayload(BaseModel):
    descripcion: str | None = Field(default=None, max_length=500)
    estado: ClienteDocumentoEstado | None = Field(default=None)
    metadatos: dict[str, Any] | None = Field(default=None)


class ClienteResponsablePayload(BaseModel):
    nombre: str = Field(..., max_length=255)
    correo: str | None = Field(default=None, max_length=320)
    telefono_e164: str | None = Field(default=None, max_length=32)
    rol: str | None = Field(default=None, max_length=120)
    es_responsable_principal: bool = False
    metadatos: dict[str, Any] | None = Field(default=None)


class ClienteResponsableUpdatePayload(BaseModel):
    nombre: str | None = Field(default=None, max_length=255)
    correo: str | None = Field(default=None, max_length=320)
    telefono_e164: str | None = Field(default=None, max_length=32)
    rol: str | None = Field(default=None, max_length=120)
    es_responsable_principal: bool | None = Field(default=None)
    metadatos: dict[str, Any] | None = Field(default=None)


class ClientePortalLinkPayload(BaseModel):
    nota: str | None = Field(default=None, max_length=500)
    correo_destinatarios: list[str] | None = Field(default=None)
    correo_asunto: str | None = Field(default=None, max_length=255)
    correo_mensaje: str | None = Field(default=None)
    metadatos: dict[str, Any] | None = Field(default=None)
    expira_en: datetime | None = Field(default=None)
    enviar_correo: bool = True


class ClienteContactoRecord(BaseModel):
    id: UUID
    nombre_completo: str | None = None
    correo: str | None = None
    telefono_e164: str | None = None
    company_name: str | None = None


class ClienteDocumentoRecord(BaseModel):
    id: UUID
    tipo: ClienteDocumentoTipo
    estado: ClienteDocumentoEstado
    descripcion: str | None = None
    storage_url: str | None = None
    storage_path: str | None = None
    metadatos: dict[str, Any] | None = None
    creado_en: datetime
    actualizado_en: datetime
    cuenta_id: UUID | None = None
    oportunidad_id: UUID | None = None


class ClienteResponsableRecord(BaseModel):
    id: UUID
    nombre: str
    correo: str | None = None
    telefono_e164: str | None = None
    rol: str | None = None
    es_responsable_principal: bool = False
    metadatos: dict[str, Any] | None = None
    creado_en: datetime
    actualizado_en: datetime
    cuenta_id: UUID | None = None
    oportunidad_id: UUID | None = None


class ClienteRecord(BaseModel):
    id: UUID
    organizacion_id: UUID
    contacto_id: UUID
    cuenta_id: UUID
    oportunidad_id: UUID | None = None
    legacy_lead_id: UUID | None = None
    estado_onboarding: ClienteOnboardingEstado
    rfc: str | None = None
    razon_social: str | None = None
    domicilio_fiscal: str | None = None
    domicilio_fisico: str | None = None
    regimen_fiscal: str | None = None
    datos_facturacion: dict[str, Any] | None = None
    fuente: str | None = None
    monto_estimado: float | None = None
    moneda: str | None = None
    metadatos: dict[str, Any] | None = None
    ganado_en: datetime | None = None
    creado_en: datetime
    actualizado_en: datetime
    contacto: ClienteContactoRecord | None = None
    documentos: list[ClienteDocumentoRecord] = Field(default_factory=list)
    responsables: list[ClienteResponsableRecord] = Field(default_factory=list)


class ClienteListResponse(BaseModel):
    items: list[ClienteRecord]
    limit: int
    offset: int


class LeadConversionPayload(BaseModel):
    forzar: bool = Field(default=False)


PORTAL_DOCUMENT_REQUIREMENTS: list[dict[str, str]] = [
    {
        "tipo": ClienteDocumentoTipo.CONSTANCIA_FISCAL.value,
        "titulo": "Constancia fiscal (SAT)",
        "descripcion": "Documento emitido por el SAT que contiene el RFC y el domicilio fiscal.",
    },
    {
        "tipo": ClienteDocumentoTipo.COMPROBANTE_DOMICILIO.value,
        "titulo": "Comprobante de domicilio",
        "descripcion": "Puede ser recibo de luz, teléfono o agua con antigüedad menor a 3 meses.",
    },
    {
        "tipo": ClienteDocumentoTipo.IDENTIFICACION_OFICIAL.value,
        "titulo": "Identificación oficial",
        "descripcion": "INE o pasaporte vigente del representante legal.",
    },
    {
        "tipo": ClienteDocumentoTipo.CONTRATO_SERVICIO.value,
        "titulo": "Contrato de servicio",
        "descripcion": "Contrato firmado para formalizar el inicio del servicio.",
    },
    {
        "tipo": ClienteDocumentoTipo.NDA.value,
        "titulo": "Acuerdo de confidencialidad (NDA)",
        "descripcion": "Documento opcional para proteger información sensible.",
    },
]


class AgendaReschedulePayload(BaseModel):
    """Payload para reprogramar citas."""

    start_at: str = Field(..., description="Fecha/hora en ISO 8601 con zona horaria.")
    notes: str | None = Field(default=None, description="Notas opcionales para la cita.")


class AgendaCancelPayload(BaseModel):
    """Payload para cancelar citas."""

    reason: str | None = Field(default=None, description="Motivo compartido por el cliente.")


class AgendaBookingCreatePayload(BaseModel):
    """Payload para crear citas desde el CRM."""

    start_at: str = Field(..., description="Fecha/hora en ISO 8601 con zona horaria.")
    notes: str | None = Field(default=None, description="Notas internas para la cita.")
    session_id: str | None = Field(
        default=None,
        description="Session_id opcional para conversaciones webchat.",
    )
    conversation_id: UUID | None = Field(
        default=None, description="Conversación existente vinculada al lead."
    )
    contacto_id: UUID | None = Field(
        default=None, description="Contacto asociado a la oportunidad."
    )
    oportunidad_id: UUID | None = Field(default=None, description="Oportunidad asociada a la cita.")
    canal: str | None = Field(
        default=None,
        description="Canal de origen preferido para la conversación (ej. crm, webchat).",
    )


class DeleteResultadosPayload(BaseModel):
    """IDs de resultados a eliminar."""

    model_config = ConfigDict(extra="forbid")

    ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="IDs de resultados (uuid) a eliminar.",
    )

    @field_validator("ids")
    @classmethod
    def _dedupe_ids(cls, value: list[UUID]) -> list[UUID]:
        seen: set[UUID] = set()
        deduped: list[UUID] = []
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        return deduped


class ProspectoSeleccionPayload(BaseModel):
    """IDs de resultados a convertir en prospectos."""

    model_config = ConfigDict(extra="forbid")

    fuente: Literal["google_places", "denue"]
    resultado_ids: list[UUID] = Field(
        ..., min_length=1, max_length=500, description="Resultados a preservar."
    )
    segmento: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] | None = Field(default=None)

    @field_validator("resultado_ids")
    @classmethod
    def _dedupe_resultado_ids(cls, value: list[UUID]) -> list[UUID]:
        unique: list[UUID] = []
        seen: set[UUID] = set()
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        return unique


class ProspectoLookupPayload(BaseModel):
    """Solicita verificación de teléfono con Twilio Lookup."""

    model_config = ConfigDict(extra="forbid")

    prospecto_ids: list[UUID] = Field(
        ..., min_length=1, max_length=200, description="Prospectos a verificar."
    )
    country_code: str | None = Field(
        default="MX", description="Código de país ISO2 para normalizar el número."
    )
    reintentar: bool = Field(
        default=False,
        description="Si es falso se omiten prospectos ya verificados o sin teléfono.",
    )

    @field_validator("prospecto_ids")
    @classmethod
    def _dedupe_prospecto_ids(cls, value: list[UUID]) -> list[UUID]:
        unique: list[UUID] = []
        seen: set[UUID] = set()
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        return unique


class ProspectoChecklistLookupPayload(BaseModel):
    """Configura la acción rápida para validar teléfonos desde el checklist."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=200, ge=1, le=200)
    country_code: str | None = Field(default="MX", max_length=4)
    reintentar: bool = Field(
        default=True,
        description="Si es falso se omiten prospectos previamente marcados como verificados.",
    )


class ProspectoChecklistScraperPayload(BaseModel):
    """Parámetros de la acción rápida que lanza el scraper para prospectos sin correo."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=3, ge=1, le=20, description="Número de jobs a disparar.")
    mode: Literal["generic", "government", "intelligent", "auto", "stealth"] = Field(default="auto")
    max_pages: int = Field(default=150, ge=10, le=2000)
    max_depth: int = Field(default=3, ge=1, le=10)
    max_runtime: int | None = Field(default=900, ge=60, le=3600)
    prospecto_ids: list[UUID] | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Prospectos específicos a scrapear (opcional).",
    )

    @field_validator("prospecto_ids")
    @classmethod
    def _dedupe_scraper_ids(cls, value: list[UUID] | None) -> list[UUID] | None:
        if not value:
            return value
        unique: list[UUID] = []
        seen: set[UUID] = set()
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        return unique


class ProspectoListQuery(BaseModel):
    """Filtros de paginación y búsqueda para prospectos guardados."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0, le=10_000)
    search: str | None = Field(default=None, max_length=120)
    fuente: Literal["google_places", "denue", "usuario", ""] | None = Field(default=None)
    lookup_status: str | None = Field(default=None, max_length=60)
    segmento: str | None = Field(default=None, max_length=120)
    carrier_type: Literal["mobile", "landline", "voip", ""] | None = Field(default=None)
    order: Literal["creado", "nombre"] | None = Field(default=None)
    stage: Literal["discover", "enrich", "prepare", "launch", "evaluate", ""] | None = Field(default=None)
    whatsapp_permitido: bool | None = Field(default=None)
    llamada_permitida: bool | None = Field(default=None)


class ProspectoFiltroPayload(BaseModel):
    """Subconjunto de filtros reutilizable para listas inteligentes y wizard."""

    model_config = ConfigDict(extra="forbid")

    search: str | None = Field(default=None, max_length=120)
    fuente: Literal["google_places", "denue", "usuario", ""] | None = Field(default=None)
    lookup_status: str | None = Field(default=None, max_length=60)
    segmento: str | None = Field(default=None, max_length=120)
    carrier_type: Literal["mobile", "landline", "voip", ""] | None = Field(default=None)
    stage: Literal["discover", "enrich", "prepare", "launch", "evaluate", ""] | None = Field(default=None)
    whatsapp_permitido: bool | None = Field(default=None)
    llamada_permitida: bool | None = Field(default=None)


class ProspeccionCanalConfig(BaseModel):
    """Configuración avanzada por canal dentro del wizard."""

    canal: Literal["correo", "whatsapp", "llamada"]
    template_id: UUID | None = None
    subject: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=4000)
    message: str | None = Field(default=None, max_length=1000)
    programado_en: datetime | None = None
    metadata: dict[str, Any] | None = Field(default=None)


class ProspeccionListaPayload(BaseModel):
    """Define una lista inteligente guardada."""

    model_config = ConfigDict(extra="forbid")

    nombre: str = Field(..., min_length=3, max_length=160)
    descripcion: str | None = Field(default=None, max_length=400)
    filtros: ProspectoFiltroPayload
    metadata: dict[str, Any] | None = Field(default=None)


class ProspeccionListaUpdatePayload(BaseModel):
    """Campos editables de una lista inteligente."""

    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=3, max_length=160)
    descripcion: str | None = Field(default=None, max_length=400)
    filtros: ProspectoFiltroPayload | None = None
    metadata: dict[str, Any] | None = Field(default=None)


class ProspeccionListaQuery(BaseModel):
    """Filtros para listar listas inteligentes."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0, le=1000)
    search: str | None = Field(default=None, max_length=120)


class ContactoTemplatePayload(BaseModel):
    """Crea una plantilla multicanal para prospección."""

    model_config = ConfigDict(extra="forbid")

    canal: Literal["correo", "whatsapp", "llamada"]
    nombre: str = Field(..., min_length=3, max_length=160)
    slug: str = Field(..., min_length=3, max_length=160)
    descripcion: str | None = Field(default=None, max_length=400)
    asunto: str | None = Field(default=None, max_length=200)
    cuerpo_texto: str | None = Field(default=None, max_length=4000)
    cuerpo_html: str | None = Field(default=None, max_length=8000)
    metadata: dict[str, Any] | None = Field(default=None)
    activo: bool = Field(default=True)


class ContactoTemplateUpdatePayload(BaseModel):
    """Campos editables de una plantilla existente."""

    model_config = ConfigDict(extra="forbid")

    canal: Literal["correo", "whatsapp", "llamada"] | None = None
    nombre: str | None = Field(default=None, min_length=3, max_length=160)
    slug: str | None = Field(default=None, min_length=3, max_length=160)
    descripcion: str | None = Field(default=None, max_length=400)
    asunto: str | None = Field(default=None, max_length=200)
    cuerpo_texto: str | None = Field(default=None, max_length=4000)
    cuerpo_html: str | None = Field(default=None, max_length=8000)
    metadata: dict[str, Any] | None = Field(default=None)
    activo: bool | None = None


class ProspeccionCampanaQuery(BaseModel):
    """Parámetros del dashboard de campañas."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=15, ge=1, le=100)


class ProspectoConvertirPayload(BaseModel):
    """Payload para convertir un prospecto a contacto de CRM."""

    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=2, max_length=200)
    correo: str | None = Field(default=None, max_length=320)
    telefono: str | None = Field(default=None, max_length=60)
    company_name: str | None = Field(default=None, max_length=160)
    notas: str | None = Field(default=None, max_length=1000)
    stage: Literal["discover", "enrich", "prepare", "launch", "evaluate"] | None = None
    canal_origen: Literal["correo", "whatsapp", "llamada", "otro"] | None = None


class ProspectoContactarPayload(BaseModel):
    """Programa envíos de contacto para prospectos verificados."""

    model_config = ConfigDict(extra="forbid")

    prospecto_ids: list[UUID] | None = Field(
        default=None, min_length=1, max_length=200, description="Prospectos seleccionados manualmente."
    )
    correo_asunto: str | None = Field(default=None, max_length=200)
    correo_cuerpo: str | None = Field(default=None, max_length=4000)
    whatsapp_mensaje: str | None = Field(default=None, max_length=2000)
    llamada_notas: str | None = Field(default=None, max_length=500)
    lista_id: UUID | None = None
    filtros: ProspectoFiltroPayload | None = None
    canales: list[ProspeccionCanalConfig] | None = None
    campana_id: UUID | None = None
    batch_titulo: str | None = Field(default=None, max_length=160)

    @field_validator("prospecto_ids")
    @classmethod
    def _dedupe_contact_ids(cls, value: list[UUID]) -> list[UUID]:
        if not value:
            return value
        unique: list[UUID] = []
        seen: set[UUID] = set()
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        return unique

    @model_validator(mode="after")
    def _ensure_selector(self) -> "ProspectoContactarPayload":
        if not self.prospecto_ids and not self.lista_id and not self.filtros:
            raise ValueError("selector_required")
        return self


class ProspectoManualPayload(BaseModel):
    """Datos capturados manualmente por un usuario."""

    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(..., min_length=2, max_length=200)
    actividad: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=320)
    website: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=400)
    segmento: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] | None = Field(default=None)

    @field_validator("display_name")
    @classmethod
    def _strip_display_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("display_name_required")
        return trimmed


class ProspectoUpdatePayload(BaseModel):
    """Campos editables de un prospecto."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=2, max_length=200)
    actividad: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=320)
    website: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=400)
    segmento: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] | None = Field(default=None)

    @field_validator("display_name")
    @classmethod
    def _validate_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("display_name_required")
        return trimmed

    @model_validator(mode="after")
    def _ensure_any_field(self) -> ProspectoUpdatePayload:
        provided = self.model_dump(exclude_unset=True)
        if not provided:
            raise ValueError("fields_required")
        return self


class ContactBatchQuery(BaseModel):
    """Filtros de paginación para los lotes de contacto."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=25, ge=1, le=200)
    offset: int = Field(default=0, ge=0, le=10_000)
    estado: str | None = Field(default=None, max_length=40)
    order: Literal["reciente", "antiguo"] = Field(default="reciente")


class ContactEnvioQuery(BaseModel):
    """Filtros para listar envíos por lote o prospecto."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0, le=10_000)
    batch_id: UUID | None = Field(default=None)
    prospecto_id: UUID | None = Field(default=None)
    canal: Literal["correo", "whatsapp", "llamada", ""] | None = Field(default=None)
    estado: str | None = Field(default=None, max_length=40)
    order: Literal["reciente", "antiguo"] = Field(default="reciente")


class ContactLogQuery(BaseModel):
    """Filtros para consultar la bitácora de contactos."""

    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=200, ge=1, le=500)
    offset: int = Field(default=0, ge=0, le=10_000)
    batch_id: UUID | None = Field(default=None)
    envio_id: UUID | None = Field(default=None)
    prospecto_id: UUID | None = Field(default=None)
    canal: Literal["correo", "whatsapp", "llamada", ""] | None = Field(default=None)
    estado: str | None = Field(default=None, max_length=40)
    order: Literal["reciente", "antiguo"] = Field(default="reciente")


class ContactTemplateQuery(BaseModel):
    """Filtros simples para listar plantillas."""

    canal: Literal["correo", "whatsapp", "llamada", ""] | None = Field(default=None)


class ProspectoAuditEntryResponse(BaseModel):
    id: UUID
    accion: Literal["insert", "update", "delete"]
    cambios: dict[str, Any] = Field(default_factory=dict)
    realizado_por: UUID | None = None
    realizado_en: datetime


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
    dense_mode: bool = Field(
        default=False,
        description="Activa el modo denso para cubrir zonas amplias sin límite de resultados.",
    )

    model_config = ConfigDict(extra="ignore")

    @field_validator("included_types")
    @classmethod
    def _validate_types(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [part.strip() for part in value if part and part.strip()]
        return cleaned or None

    @field_validator("query")
    @classmethod
    def _strip_query(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

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

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("query_required")
        return trimmed


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


def get_repository() -> CRMRepository:
    try:
        return CRMRepository()
    except CRMRepositoryError as exc:  # pragma: no cover - falla de config
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# Helpers -----------------------------------------------------------------------


def require_organizacion_id(
    x_organizacion_id: Annotated[str, Header(alias="X-Organizacion-Id")],
) -> UUID:
    try:
        return UUID(x_organizacion_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encabezado X-Organizacion-Id inválido",
        ) from exc


def optional_usuario_id(
    x_usuario_id: Annotated[str | None, Header(alias="X-Usuario-Id")] = None,
) -> UUID | None:
    if x_usuario_id is None:
        return None
    try:
        return UUID(x_usuario_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encabezado X-Usuario-Id inválido",
        ) from exc


def require_user_token(
    x_user_token: Annotated[str | None, Header(alias="X-User-Token")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    if x_user_token:
        token = x_user_token.strip()
        if token:
            return token
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="authorization_invalid",
    )


def _single_related(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _cliente_select_clause() -> str:
    return (
        "id,organizacion_id,contacto_id,cuenta_id,oportunidad_id,legacy_lead_id,"
        "estado_onboarding,rfc,razon_social,domicilio_fiscal,domicilio_fisico,regimen_fiscal,"
        "datos_facturacion,fuente,monto_estimado,moneda,metadatos,ganado_en,creado_en,actualizado_en,"
        "contacto:contactos!clientes_contacto_org_fkey(id,nombre_completo,correo,telefono_e164,company_name),"
        "documentos:cliente_documentos!cliente_documentos_cliente_org_fkey(id,tipo,estado,descripcion,storage_url,"
        "storage_path,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id),"
        "responsables:cliente_responsables!cliente_responsables_cliente_org_fkey(id,nombre,correo,telefono_e164,rol,"
        "es_responsable_principal,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id)"
    )


def _portal_token_select_clause(include_relations: bool = True) -> str:
    base = (
        "id,cliente_id,organizacion_id,cuenta_id,oportunidad_id,token,expira_en,revocado,"
        "usos,nota,metadata,ultimo_acceso_en,ultimo_acceso_ip,creado_en,actualizado_en"
    )
    if include_relations:
        base += (
            f",cliente:clientes!cliente_portal_tokens_cliente_org_fkey({_cliente_select_clause()})"
        )
    else:
        base += ",cliente:clientes!cliente_portal_tokens_cliente_org_fkey(id)"
    return base


def _cliente_context(cliente: dict[str, Any] | None) -> dict[str, Any]:
    if not cliente:
        return {}
    context: dict[str, Any] = {}
    for key in ("organizacion_id", "cuenta_id", "oportunidad_id"):
        value = cliente.get(key)
        if value:
            context[key] = str(value)
    return context


def _portal_session_context(session: dict[str, Any] | None) -> dict[str, Any]:
    if not session:
        return {}
    cliente_data = session.get("cliente")
    context = _cliente_context(cliente_data) if isinstance(cliente_data, dict) else {}
    for key in ("organizacion_id", "cuenta_id", "oportunidad_id"):
        if key not in context:
            value = session.get(key)
            if value:
                context[key] = str(value)
    return context


def _sanitize_portal_session(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    allowed = {
        "id",
        "cliente_id",
        "organizacion_id",
        "cuenta_id",
        "oportunidad_id",
        "expira_en",
        "revocado",
        "usos",
        "nota",
        "metadata",
        "ultimo_acceso_en",
        "ultimo_acceso_ip",
        "creado_en",
        "actualizado_en",
    }
    return {key: row.get(key) for key in allowed}


def _ensure_portal_token_active(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        raise HTTPException(status_code=404, detail="portal_token_not_found")
    if row.get("revocado"):
        raise HTTPException(status_code=410, detail="portal_token_revoked")
    expira = _parse_iso_datetime(row.get("expira_en"))
    if expira and expira < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="portal_token_expired")
    return row


def _portal_default_expiration() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=DEFAULT_PORTAL_TOKEN_DAYS)


def _serialize_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _request_ip(request: Request | None) -> str | None:
    if not request:
        return None
    forwarded = request.headers.get("x-forwarded-for") if request.headers else None
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    return client.host if client else None


def _build_portal_link(token: str) -> str:
    base = settings.cliente_portal_base_url
    if not base:
        raise HTTPException(status_code=500, detail="cliente_portal_base_url_missing")
    return f"{base.rstrip('/')}/{token}"


def _normalize_email_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        candidate = (raw or "").strip()
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(candidate)
    return normalized


def _cliente_contact_email(cliente: dict[str, Any] | None) -> str | None:
    if not cliente:
        return None
    contact = cliente.get("contacto")
    if isinstance(contact, dict):
        correo = (contact.get("correo") or "").strip()
        return correo or None
    return None


def _portal_email_subject(cliente: dict[str, Any] | None) -> str:
    nombre = (
        (cliente or {}).get("razon_social")
        or ((cliente or {}).get("contacto") or {}).get("nombre_completo")
        or ""
    )
    if nombre:
        return f"{nombre}, completa tu onboarding con Tal-IA"
    return "Completa tu onboarding con Tal-IA"


def _portal_email_body(
    cliente: dict[str, Any] | None,
    link: str,
    mensaje: str | None,
) -> str:
    nombre = (
        (cliente or {}).get("razon_social")
        or ((cliente or {}).get("contacto") or {}).get("nombre_completo")
        or "cliente"
    )
    body_lines = [
        f"Hola {nombre},",
        "",
        "Preparamos un enlace para que completes tu onboarding y compartas la información necesaria.",
        "",
        link,
    ]
    if mensaje:
        body_lines.extend(["", mensaje])
    body_lines.extend(
        [
            "",
            "Si tienes dudas, responde a este correo para ayudarte.",
            "",
            "Equipo Tal-IA",
        ]
    )
    return "\n".join(body_lines)


def _jwt_verify_and_sub(jwt_token: str | None) -> str | None:
    if not jwt_token:
        return None
    try:
        import base64
        import hashlib
        import hmac

        secret = getattr(settings, "supabase_jwt_secret", None) or getattr(
            settings, "supabase_legacy_jwt_secret", None
        )
        if not secret:
            return None
        header_b64, payload_b64, signature_b64 = jwt_token.split(".")

        def b64url_decode(value: str) -> bytes:
            rem = len(value) % 4
            if rem:
                value += "=" * (4 - rem)
            return base64.urlsafe_b64decode(value.encode())

        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        provided = b64url_decode(signature_b64)
        if not hmac.compare_digest(expected, provided):
            return None

        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def _resolve_portal_email_recipients(
    payload: ClientePortalLinkPayload,
    cliente: dict[str, Any] | None,
) -> list[str]:
    recipients = _normalize_email_list(payload.correo_destinatarios or [])
    contact_email = _cliente_contact_email(cliente)
    if contact_email:
        lowered = contact_email.lower()
        if lowered not in {item.lower() for item in recipients}:
            recipients.append(contact_email)
    return recipients


async def _resolve_portal_session(
    *,
    repo: CRMRepository,
    portal_token: str,
    request: Request | None = None,
    include_relations: bool = False,
) -> dict[str, Any]:
    row = await repo.get_portal_token(
        portal_token=portal_token,
        include_relations=include_relations,
    )
    row = _ensure_portal_token_active(row)
    token_id = row.get("id")
    if token_id:
        await repo.touch_portal_token(
            token_id=UUID(str(token_id)),
            usos=int(row.get("usos") or 0) + 1,
            ip=_request_ip(request),
        )
    cliente = row.get("cliente")
    if cliente is not None:
        row["cliente"] = _single_related(cliente)
    return row


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


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
        return True
    except Exception:
        return False


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
        if end.hour == 0 and end.minute == 0 and end.second == 0 and end.microsecond == 0:
            end = end + timedelta(days=1) - timedelta(microseconds=1)

    if start and end and start > end:
        raise HTTPException(status_code=400, detail="rango_fecha_invalido")

    return start, end


def _format_utc(dt: datetime) -> str:
    return _ensure_utc(dt).isoformat()


def _parse_date_value(value: str | None, *, field: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"{field}_invalid") from exc
    return parsed


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_iso_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        except ValueError:
            return None
        return _ensure_utc(dt)
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


def _ilike_param(value: str) -> str:
    sanitized = value.replace("*", "").replace("%", "")
    return f"ilike.*{sanitized}*"


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _normalize_phone_input(value: str) -> str | None:
    """Elimina caracteres no numéricos manteniendo el prefijo + si existe."""
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    digits = "".join(ch for ch in stripped if ch.isdigit())
    if not digits:
        return None
    if stripped.startswith("+"):
        return f"+{digits}"
    return digits


async def _run_prospecto_lookup(
    *,
    repo: CRMRepository,
    user_token: str,
    prospectos: Sequence[Mapping[str, Any]],
    country_code: str | None,
    reintentar: bool,
) -> list[dict[str, Any]]:
    """Ejecuta Twilio Lookup para una colección de prospectos y persiste los resultados."""

    processed: list[dict[str, Any]] = []
    for prospecto in prospectos:
        prospecto_id = prospecto.get("id") or prospecto.get("prospecto_id")
        if not prospecto_id:
            continue
        current_status = _clean_text(prospecto.get("lookup_status")) or ""
        if not reintentar and current_status in {"verificado", "sin_numero"}:
            continue
        base_phone = prospecto.get("phone_e164") or prospecto.get("phone")
        phone = _clean_text(base_phone)
        phone = _normalize_phone_input(phone) if phone else None
        if not phone:
            updates = {
                "lookup_status": "sin_numero",
                "lookup_error": None,
                "whatsapp_permitido": False,
                "llamada_permitida": False,
            }
        else:
            try:
                lookup = await lookup_phone_number(
                    phone,
                    country_code=country_code,
                )
            except TwilioLookupError as exc:
                updates = {
                    "lookup_status": "error",
                    "lookup_error": str(exc),
                }
            else:
                carrier = lookup.get("carrier") or {}
                carrier_type = _clean_text(carrier.get("type"))
                whatsapp_allowed = (carrier_type or "").lower() == "mobile"
                llamada_permitida = (carrier_type or "").lower() in {"mobile", "landline"}
                updates = {
                    "phone_e164": lookup.get("phone_number") or phone,
                    "phone_national": lookup.get("national_format"),
                    "carrier_name": carrier.get("name"),
                    "carrier_type": carrier_type,
                    "lookup_status": "verificado",
                    "lookup_error": None,
                    "whatsapp_permitido": whatsapp_allowed,
                    "llamada_permitida": llamada_permitida,
                }
        updated = await repo.update_prospecto(
            usuario_token=user_token,
            prospecto_id=UUID(str(prospecto_id)),
            payload=updates,
        )
        processed.append(
            {
                "prospecto_id": str(prospecto_id),
                "lookup_status": updated.get("lookup_status"),
                "carrier_type": updated.get("carrier_type"),
                "whatsapp_permitido": updated.get("whatsapp_permitido"),
            }
        )
    return processed


def _normalize_scraper_target(value: Any) -> tuple[str, str] | None:
    """Normaliza una URL de sitio web para lanzar el scraper devolviendo URL base y host."""

    raw = _clean_text(value)
    if not raw:
        return None
    candidate = raw if raw.startswith(("http://", "https://")) else f"https://{raw}"
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None
    host = parsed.netloc or ""
    if not host:
        return None
    scheme = parsed.scheme if parsed.scheme in {"http", "https"} else "https"
    base_url = f"{scheme}://{host}"
    return base_url, host.lower()


def _describe_prospeccion_source(row: Mapping[str, Any]) -> str:
    """Devuelve una etiqueta legible para el origen del prospecto."""

    fuente_busqueda = _clean_text(row.get("fuente_busqueda"))
    fuente = _clean_text(row.get("fuente"))
    if fuente_busqueda == "buscador":
        return "Prospección – Búsqueda web"
    if fuente_busqueda == "manual":
        return "Prospección – Captura manual"
    if fuente == "google_places":
        return "Prospección – Búsqueda Google"
    if fuente == "denue":
        return "Prospección – DENUE"
    return "Prospección – Manual"


def _infer_prospeccion_canal_label(row: Mapping[str, Any]) -> str:
    """Regresa un label corto para mostrar en el pipeline."""

    fuente_busqueda = _clean_text(row.get("fuente_busqueda"))
    fuente = _clean_text(row.get("fuente"))
    if fuente == "google_places":
        return "Google"
    if fuente == "denue":
        return "Denue"
    if fuente_busqueda == "buscador":
        return "Web"
    return "Manual"


def _single_related(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return first
    return None


def _ensure_concept_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


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
            value = _clean_text(raw_item.get(key))
            if value:
                entry[key] = value
        if isinstance(raw_item.get("metadatos"), dict):
            entry["metadatos"] = raw_item["metadatos"]
        for key in (
            "cantidad",
            "precio_unitario",
            "descuento",
            "subtotal",
            "impuestos",
            "total",
        ):
            number = _decimal_from_value(raw_item.get(key))
            if number is not None:
                entry[key] = float(number)
        currency = _clean_text(raw_item.get("moneda"))
        if currency and len(currency) == 3:
            entry["moneda"] = currency.upper()
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
        if total_value is None or total_value <= 0:
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
            discount = item.get("descuento") or 0
            if qty is not None and price is not None:
                total = max(qty * price - discount, 0)
        concept = {
            "titulo": title,
            "descripcion": desc,
            "unidad": item.get("unidad") or item.get("unidad_medida"),
            "cantidad": item.get("cantidad"),
        }
        if total is not None:
            concept["total"] = total
        if any(value for value in concept.values()):
            concepts.append(concept)
    return concepts


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return date.fromisoformat(cleaned.split("T")[0])
        except ValueError:
            return None
    return None


def _parse_timestamp(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        except ValueError:
            return None
        return _ensure_utc(dt)
    return None


def _parse_quote_items(value: Any) -> list[LeadQuoteItem]:
    items: list[LeadQuoteItem] = []
    if not isinstance(value, list):
        return items
    for entry in value:
        if not isinstance(entry, dict):
            continue
        catalog = entry.get("catalog_item")
        catalog_item = CRMCatalogItem.model_validate(catalog) if isinstance(catalog, dict) else None
        metadata = entry.get("metadata")
        metadata_dict = metadata if isinstance(metadata, dict) else {}
        catalog_item_id = (
            metadata_dict.get("catalog_item_id")
            or entry.get("producto_id")
            or entry.get("catalog_item_id")
        )
        items.append(
            LeadQuoteItem(
                id=entry.get("id"),
                cotizacion_id=entry.get("cotizacion_id"),
                catalog_item_id=catalog_item_id,
                catalog_item=catalog_item,
                titulo=metadata_dict.get("titulo")
                or entry.get("titulo")
                or entry.get("descripcion"),
                descripcion=metadata_dict.get("descripcion") or entry.get("descripcion"),
                unidad=metadata_dict.get("unidad") or entry.get("unidad"),
                cantidad=_as_number(entry.get("cantidad")),
                precio_unitario=_as_number(entry.get("precio_unitario")),
                descuento=_as_number(metadata_dict.get("descuento") or entry.get("descuento")),
                subtotal=_as_number(entry.get("subtotal")),
                impuestos=_as_number(metadata_dict.get("impuestos") or entry.get("impuestos")),
                total=_as_number(metadata_dict.get("total") or entry.get("total")),
                moneda=metadata_dict.get("moneda") or entry.get("moneda"),
                orden=metadata_dict.get("orden") or entry.get("orden"),
                metadatos=metadata_dict if metadata_dict else None,
                creado_en=_parse_timestamp(entry.get("creado_en")),
                actualizado_en=_parse_timestamp(entry.get("actualizado_en")),
            )
        )
    return items


def _quote_from_row(row: dict[str, Any]) -> LeadQuote:
    metadata = _ensure_dict(row.get("metadata"), default={})
    estado = row.get("estatus") or row.get("estado") or metadata.get("estado") or "borrador"
    oportunidad_id = row.get("oportunidad_id") or metadata.get("oportunidad_id")
    return LeadQuote(
        id=row.get("id"),
        oportunidad_id=oportunidad_id,
        version=metadata.get("version") or row.get("version") or 1,
        titulo=metadata.get("titulo") or row.get("titulo"),
        descripcion=metadata.get("descripcion") or row.get("descripcion"),
        detalles_propuesta_html=metadata.get("detalles_propuesta_html")
        or row.get("detalles_propuesta_html"),
        conceptos=_ensure_concept_list(metadata.get("conceptos") or row.get("conceptos")),
        subtotal=metadata.get("subtotal") or row.get("subtotal"),
        impuestos=metadata.get("impuestos") or row.get("impuestos"),
        total=_as_number(row.get("total")) or _as_number(metadata.get("total")),
        moneda=_clean_text(row.get("moneda") or metadata.get("moneda")),
        valido_hasta=_parse_date(row.get("valida_hasta") or metadata.get("valido_hasta")),
        estado=estado,
        canal_envio=metadata.get("canal_envio") or row.get("canal_envio"),
        enviada_por=metadata.get("enviada_por") or row.get("enviada_por"),
        enviada_en=_parse_timestamp(metadata.get("enviada_en") or row.get("enviada_en")),
        aprobada_en=_parse_timestamp(metadata.get("aprobada_en") or row.get("aprobada_en")),
        rechazada_en=_parse_timestamp(metadata.get("rechazada_en") or row.get("rechazada_en")),
        pdf_path=metadata.get("pdf_path") or row.get("pdf_path"),
        pdf_url=metadata.get("pdf_url") or row.get("pdf_url"),
        metadatos=metadata,
        creado_en=_parse_timestamp(row.get("creado_en")),
        actualizado_en=_parse_timestamp(row.get("actualizado_en")),
        items=_parse_quote_items(row.get("items")),
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
        body["moneda"] = (_clean_text(body["moneda"]) or "MXN").upper()
    if "valido_hasta" in body and isinstance(body["valido_hasta"], date):
        body["valido_hasta"] = body["valido_hasta"].isoformat()
    return body


def _quote_metadata_from_payload(body: dict[str, Any]) -> dict[str, Any]:
    metadata = _ensure_dict(body.pop("metadatos", {}), default={})
    for key in (
        "titulo",
        "descripcion",
        "detalles_propuesta_html",
        "conceptos",
        "subtotal",
        "impuestos",
        "pdf_url",
        "pdf_path",
        "canal_envio",
    ):
        value = body.pop(key, None)
        if value is not None:
            metadata[key] = value
    metadata.setdefault("version", metadata.get("version") or 1)
    return metadata


def _quote_items_to_repository_payload(
    items: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    repository_items: list[dict[str, Any]] = []
    if not items:
        return repository_items
    for index, item in enumerate(items, start=1):
        catalog_item_id = item.get("catalog_item_id")
        if catalog_item_id:
            catalog_item_id = str(catalog_item_id)
        metadata = {
            "titulo": item.get("titulo"),
            "descripcion": item.get("descripcion"),
            "unidad": item.get("unidad"),
            "descuento": item.get("descuento"),
            "impuestos": item.get("impuestos"),
            "total": item.get("total"),
            "moneda": item.get("moneda"),
            "orden": item.get("orden") or index,
        }
        if catalog_item_id:
            metadata["catalog_item_id"] = catalog_item_id
        repository_items.append(
            {
                "descripcion": item.get("titulo") or item.get("descripcion") or "Concepto",
                "cantidad": _as_number(item.get("cantidad")) or 1,
                "precio_unitario": _as_number(item.get("precio_unitario")),
                "descuento_porcentaje": None,
                "subtotal": _as_number(item.get("subtotal")) or _as_number(item.get("total")),
                "metadata": metadata,
            }
        )
    return repository_items


def _as_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _to_iso_date(value: Any) -> str | None:
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


def _quote_extra_payload(payload: LeadQuoteMarkPayload) -> dict[str, Any]:
    extra = dict(payload.metadata or {})
    value = payload.proposal_sent_at
    if value:
        if isinstance(value, datetime):
            extra["proposal_sent_at"] = _ensure_utc(value).isoformat()
        elif isinstance(value, date):
            extra["proposal_sent_at"] = value.isoformat()
    return extra


def _resolve_lead_label(lead_row: dict[str, Any]) -> str:
    contact = _single_related(lead_row.get("contacto")) or {}
    candidates = [
        lead_row.get("proyecto_nombre"),
        contact.get("company_name"),
        contact.get("nombre_completo"),
    ]
    for value in candidates:
        cleaned = _clean_text(value)
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
    contact_email = _clean_text((contact or {}).get("correo"))
    if contact_email:
        lowered = contact_email.lower()
        if lowered not in seen:
            recipients.append(contact_email)
            seen.add(lowered)
    return recipients


def _resolve_whatsapp_number(contact: dict[str, Any] | None, override: str | None) -> str | None:
    candidate = _clean_text(override)
    if candidate:
        return candidate
    contact_phone = _clean_text((contact or {}).get("telefono_e164"))
    return contact_phone


def _extract_agent_name(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    candidates: list[Any] = [
        metadata.get("manual_author"),
        metadata.get("manualAuthor"),
        metadata.get("agent_name"),
        metadata.get("agentName"),
        metadata.get("author_name"),
        metadata.get("authorName"),
    ]
    user = metadata.get("user")
    if isinstance(user, dict):
        candidates.extend(
            [
                user.get("name"),
                user.get("full_name"),
                user.get("fullName"),
                user.get("display_name"),
                user.get("displayName"),
            ]
        )
    agent = metadata.get("agent")
    if isinstance(agent, dict):
        candidates.extend(
            [
                agent.get("name"),
                agent.get("full_name"),
                agent.get("fullName"),
                agent.get("display_name"),
                agent.get("displayName"),
            ]
        )
    extra = metadata.get("extra")
    if isinstance(extra, str):
        try:
            extra = json.loads(extra)
        except json.JSONDecodeError:
            extra = None
    if isinstance(extra, dict):
        candidates.extend(
            [
                extra.get("manual_author"),
                extra.get("manualAuthor"),
                extra.get("agent_name"),
                extra.get("agentName"),
                extra.get("author_name"),
                extra.get("authorName"),
            ]
        )
        user_extra = extra.get("user")
        if isinstance(user_extra, dict):
            candidates.extend(
                [
                    user_extra.get("name"),
                    user_extra.get("full_name"),
                    user_extra.get("fullName"),
                    user_extra.get("display_name"),
                    user_extra.get("displayName"),
                ]
            )
        agent_extra = extra.get("agent")
        if isinstance(agent_extra, dict):
            candidates.extend(
                [
                    agent_extra.get("name"),
                    agent_extra.get("full_name"),
                    agent_extra.get("fullName"),
                    agent_extra.get("display_name"),
                    agent_extra.get("displayName"),
                ]
            )
        author_extra = extra.get("author") or extra.get("author_name") or extra.get("authorName")
        if isinstance(author_extra, str) and author_extra.strip():
            candidates.append(author_extra.strip())
    for candidate in candidates:
        if isinstance(candidate, str):
            trimmed = candidate.strip()
            if trimmed:
                return trimmed
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


def _extract_session_id_from_contact(contact_data: Any) -> str | None:
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
    try:
        contact = await storage.fetch_contact(contact_id)
    except storage.StorageError as exc:
        logger.exception(
            "panel.inbox.fetch_contact_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        contact = None

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


async def _fetch_panel_user_profile(
    repo: CRMRepository, user_id: str | None
) -> dict[str, Any] | None:
    if not user_id:
        return None
    try:
        user_uuid = UUID(str(user_id))
    except ValueError:
        return None
    try:
        profile = await repo.fetch_user_profile(usuario_id=user_uuid)
    except CRMRepositoryError as exc:
        logger.warning(
            "panel.inbox.manual_user_lookup_failed",
            extra={"user_id": user_id, "error": str(exc)},
        )
        return None
    return profile


def _quote_mark_extra(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = dict(extra or {})
    payload.setdefault("proposal_sent_at", datetime.now(timezone.utc).isoformat())
    return payload


async def _ensure_oportunidad_cuenta(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    oportunidad_row: dict[str, Any],
) -> tuple[UUID, dict[str, Any]]:
    cuenta_id = _safe_uuid(oportunidad_row.get("cuenta_id"))
    if cuenta_id:
        return cuenta_id, oportunidad_row
    contact = _single_related(oportunidad_row.get("contacto")) or {}
    name_candidates = [
        contact.get("company_name"),
        oportunidad_row.get("titulo"),
        contact.get("nombre_completo"),
    ]
    account_name = None
    for candidate in name_candidates:
        cleaned = _clean_text(candidate)
        if cleaned:
            account_name = cleaned
            break
    account_name = account_name or "Cuenta generada automáticamente"
    metadata: dict[str, Any] = {
        "auto_created_from_opportunity": str(oportunidad_row.get("id")),
    }
    contact_id_value = contact.get("id")
    if contact_id_value:
        metadata["contacto_principal_id"] = str(contact_id_value)
    account_payload = {
        "nombre": account_name,
        "telefono": _clean_text(contact.get("telefono_e164")),
        "correo": _clean_text(contact.get("correo")),
        "metadata": {k: v for k, v in metadata.items() if v},
    }
    try:
        account_row = await repo.create_account(
            organizacion_id=organizacion_id,
            payload=account_payload,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="cuenta_auto_create_failed") from exc
    cuenta_id = _safe_uuid(account_row.get("id"))
    if cuenta_id is None:
        raise HTTPException(status_code=502, detail="cuenta_auto_create_missing_id")
    oportunidad_id_value = _safe_uuid(oportunidad_row.get("id"))
    if oportunidad_id_value is None:
        raise HTTPException(status_code=502, detail="oportunidad_invalid_id")
    try:
        updated_row = await repo.update_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id_value,
            payload={"cuenta_id": str(cuenta_id)},
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="oportunidad_update_failed") from exc
    return cuenta_id, updated_row


async def _ensure_won_stage_metadata(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    oportunidad_id: UUID,
    oportunidad_row: dict[str, Any],
    quote: LeadQuote | None = None,
) -> dict[str, Any]:
    metadata = _ensure_dict(oportunidad_row.get("metadata"), default={})
    stage_prep = _ensure_dict(metadata.get("stage_prep"), default={})
    closed_prep = _ensure_dict(stage_prep.get("cerrado_ganado"), default={})
    changed = False
    today = datetime.now(timezone.utc).date().isoformat()
    existing_close = _clean_text(closed_prep.get("close_date"))
    if not existing_close:
        closed_prep["close_date"] = today
        changed = True
    if quote and quote.total is not None and "contract_value" not in closed_prep:
        closed_prep["contract_value"] = float(quote.total)
        changed = True
    elif "contract_value" not in closed_prep:
        monto = oportunidad_row.get("monto_estimado")
        if isinstance(monto, (int, float)):
            closed_prep["contract_value"] = float(monto)
            changed = True
    if changed:
        stage_prep["cerrado_ganado"] = closed_prep
        metadata["stage_prep"] = stage_prep
        try:
            await repo.update_opportunity(
                organizacion_id=organizacion_id,
                oportunidad_id=oportunidad_id,
                payload={"metadata": metadata},
            )
        except CRMRepositoryError:
            logger.warning(
                "quotes.auto_fill_won_failed",
                extra={"opportunity_id": str(oportunidad_id)},
            )
    return metadata


async def _auto_move_opportunity_to_won(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    oportunidad_id: UUID,
    oportunidad_row: dict[str, Any] | None = None,
    quote: LeadQuote | None = None,
) -> None:
    current_row = oportunidad_row or await repo.get_opportunity_with_contact(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if current_row is None:
        return
    stage_info = _single_related(current_row.get("etapa")) or {}
    stage_code = (_clean_text(stage_info.get("codigo")) or "").lower()
    stage_category = (_clean_text(stage_info.get("categoria")) or "").lower()
    await _ensure_won_stage_metadata(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
        oportunidad_row=current_row,
        quote=quote,
    )
    if stage_category == "ganada" or stage_code == "cerrado_ganado":
        return
    won_stage = await repo.get_stage_by_code(
        organizacion_id=organizacion_id,
        codigo="cerrado_ganado",
    )
    if not won_stage or not won_stage.get("id"):
        return
    history_payload = {
        "oportunidad_id": str(oportunidad_id),
        "etapa_origen_id": (
            str(current_row.get("etapa_id")) if current_row.get("etapa_id") else None
        ),
        "etapa_destino_id": str(won_stage["id"]),
        "fuente": "quote_auto_accept",
        "motivo": "quote_auto_accept",
        "metadata": {"source": "quote_auto_accept"},
    }
    try:
        await repo.update_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            payload={"etapa_id": str(won_stage["id"])},
        )
        await repo.append_stage_history(
            organizacion_id=organizacion_id,
            payload={k: v for k, v in history_payload.items() if v is not None},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "quotes.auto_move_failed",
            extra={
                "opportunity_id": str(oportunidad_id),
                "error": str(exc),
            },
        )


def _build_logo_asset(row: Any) -> CRMLogoAsset | None:
    if not isinstance(row, dict):
        return None
    try:
        logo_id = UUID(str(row.get("id")))
    except Exception:  # pragma: no cover - datos inesperados
        return None

    metadata = _coerce_metadata(row.get("metadata")) or {}
    created_at = _parse_iso_datetime(row.get("created_at")) or datetime.now(timezone.utc)
    file_url = _clean_text(row.get("file_url"))
    file_path = _clean_text(row.get("file_path"))
    if not file_url or not file_path:
        return None

    descripcion = _clean_text(row.get("descripcion"))
    nombre = _clean_text(row.get("nombre")) or "Logo"

    return CRMLogoAsset(
        id=logo_id,
        nombre=nombre,
        descripcion=descripcion,
        file_url=file_url,
        file_path=file_path,
        metadata=metadata,
        created_at=created_at,
    )


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


async def _get_prospecto_or_404(
    *,
    repo: CRMRepository,
    user_token: str,
    prospecto_id: UUID,
) -> dict[str, Any]:
    """Obtiene un prospecto y devuelve 404 si no existe."""

    try:
        rows = await repo.list_prospectos_by_ids(
            usuario_token=user_token,
            prospecto_ids=[prospecto_id],
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not rows:
        raise HTTPException(status_code=404, detail="prospecto_not_found")
    row = rows[0]
    if not isinstance(row, dict):
        raise HTTPException(status_code=502, detail="prospecto_invalid")
    return row


def _build_manual_prospecto_payload(payload: ProspectoManualPayload) -> dict[str, Any]:
    """Normaliza el payload manual para enviarlo al repositorio."""

    raw = payload.model_dump(exclude_unset=True)
    data: dict[str, Any] = {
        "fuente": "usuario",
        "fuente_busqueda": "manual",
        "display_name": payload.display_name.strip(),
        "name": payload.display_name.strip(),
        "lookup_error": None,
        "whatsapp_permitido": False,
        "llamada_permitida": False,
    }
    metadata = raw.get("metadata")
    if isinstance(metadata, dict):
        data["metadata"] = metadata
    for field in ("actividad", "phone", "email", "website", "address", "segmento"):
        if field not in raw:
            continue
        value = raw[field]
        if isinstance(value, str):
            data[field] = _clean_text(value)
        else:
            data[field] = value
    phone_value = data.get("phone")
    data["lookup_status"] = "pendiente" if phone_value else "sin_numero"
    return data


def _build_prospecto_update_payload(
    *,
    update_payload: ProspectoUpdatePayload,
) -> dict[str, Any]:
    """Determina los cambios permitidos y resetea lookup si se modifica el teléfono."""

    raw = update_payload.model_dump(exclude_unset=True)
    updates: dict[str, Any] = {}
    for field in (
        "display_name",
        "actividad",
        "email",
        "website",
        "address",
        "segmento",
    ):
        if field not in raw:
            continue
        value = raw[field]
        if isinstance(value, str):
            updates[field] = _clean_text(value)
        else:
            updates[field] = value
    phone_changed = False
    if "phone" in raw:
        phone_value = raw["phone"]
        normalized = _clean_text(phone_value) if isinstance(phone_value, str) else phone_value
        updates["phone"] = normalized
        phone_changed = True
    if "metadata" in raw:
        metadata_value = raw["metadata"]
        updates["metadata"] = metadata_value if isinstance(metadata_value, dict) else {}
    if phone_changed:
        lookup_state = "pendiente" if updates.get("phone") else "sin_numero"
        updates.update(
            {
                "phone_e164": None,
                "phone_national": None,
                "carrier_name": None,
                "carrier_type": None,
                "lookup_status": lookup_state,
                "lookup_error": None,
                "whatsapp_permitido": False,
                "llamada_permitida": False,
            }
        )
    if not updates:
        raise HTTPException(status_code=400, detail="prospecto_update_empty")
    return updates


def _build_prospecto_from_contactable(
    row: dict[str, Any],
    *,
    segmento: str | None,
    extra_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    """Normaliza una fila de vista contactable hacia la tabla de prospectos."""

    phone_value = _clean_text(row.get("phone"))
    base_metadata: dict[str, Any] = {}
    busqueda_meta = row.get("busqueda_meta")
    if isinstance(busqueda_meta, dict):
        base_metadata["busqueda_meta"] = busqueda_meta
    if extra_metadata:
        base_metadata.update(extra_metadata)

    payload: dict[str, Any] = {
        "busqueda_id": row.get("busqueda_id"),
        "resultado_id": row.get("resultado_id"),
        "fuente": row.get("fuente_resultado"),
        "fuente_busqueda": row.get("fuente_busqueda"),
        "display_name": row.get("display_name") or row.get("name") or "Prospecto",
        "name": row.get("name"),
        "razon_social": row.get("razon_social"),
        "actividad": row.get("actividad"),
        "estrato": row.get("estrato"),
        "phone": phone_value,
        "email": _clean_text(row.get("email")),
        "website": _clean_text(row.get("website")),
        "address": _clean_text(row.get("address")),
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "rating": row.get("rating"),
        "distancia_m": row.get("distancia_m"),
        "metadata": base_metadata,
    }
    if segmento:
        payload["segmento"] = segmento
    return payload


def _resolve_contact_channels(
    payload: ProspectoContactarPayload,
    *,
    template_map: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    """Construye la configuración de canales y sus programaciones."""

    canales: dict[str, dict[str, Any]] = {}
    programacion: dict[str, str] = {}
    templates = template_map or {}

    if payload.canales:
        for canal_config in payload.canales:
            canal = canal_config.canal
            entry: dict[str, Any] = {}
            if canal_config.template_id:
                template_key = str(canal_config.template_id)
                entry["template_id"] = template_key
                template_row = templates.get(template_key)
            else:
                template_row = None

            entry_metadata: dict[str, Any] = {}
            if template_row:
                template_meta = template_row.get("metadata")
                if isinstance(template_meta, dict):
                    entry_metadata.update(template_meta)
                slug_value = _clean_text(template_row.get("slug"))
                if slug_value:
                    entry_metadata.setdefault("template_slug", slug_value)
            if canal_config.metadata:
                entry_metadata.update(canal_config.metadata)
            if entry_metadata:
                entry["metadata"] = entry_metadata

            if canal == "correo":
                subject = _clean_text(canal_config.subject)
                if not subject and template_row:
                    subject = _clean_text(template_row.get("asunto"))
                body = canal_config.body or (template_row.get("cuerpo_texto") if template_row else None)
                if not subject or not body:
                    raise HTTPException(status_code=400, detail="correo_payload_incompleto")
                entry["subject"] = subject
                entry["body"] = body
            elif canal == "whatsapp":
                message = _clean_text(canal_config.body or canal_config.message)
                if not message and template_row:
                    message = _clean_text(template_row.get("cuerpo_texto"))
                twilio_sid = _clean_text((entry_metadata or {}).get("twilio_content_sid"))
                if message:
                    entry["body"] = message
                elif not twilio_sid:
                    raise HTTPException(status_code=400, detail="whatsapp_payload_incompleto")
            elif canal == "llamada":
                message = _clean_text(canal_config.message or canal_config.body) or "Llamada programada desde Tal IA."
                entry["message"] = message
            else:
                continue

            if canal_config.programado_en:
                programacion[canal] = canal_config.programado_en.isoformat()
            canales[canal] = entry

        return canales, programacion

    asunto = _clean_text(payload.correo_asunto)
    cuerpo = _clean_text(payload.correo_cuerpo)
    if asunto and cuerpo:
        canales["correo"] = {
            "subject": asunto,
            "body": cuerpo,
        }
    whatsapp_msg = _clean_text(payload.whatsapp_mensaje)
    if whatsapp_msg:
        canales["whatsapp"] = {"body": whatsapp_msg}
    llamada_notas = _clean_text(payload.llamada_notas)
    if llamada_notas:
        canales["llamada"] = {"message": llamada_notas}
    return canales, programacion


async def _fetch_contact_templates(
    *,
    repo: CRMRepository,
    user_token: str,
    template_ids: set[UUID],
) -> dict[str, dict[str, Any]]:
    template_map: dict[str, dict[str, Any]] = {}
    for template_id in template_ids:
        template = await repo.get_contact_template(
            usuario_token=user_token,
            template_id=template_id,
        )
        if not template:
            raise HTTPException(status_code=404, detail="contact_template_not_found")
        template_map[str(template_id)] = template
    return template_map


def _build_contact_template_payload(
    data: dict[str, Any],
    *,
    include_metadata: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                continue
            payload[key] = trimmed
        else:
            payload[key] = value

    metadata_requested = "metadata" in data or include_metadata
    if metadata_requested:
        metadata_value = data.get("metadata") or {}
        payload["metadata"] = metadata_value if isinstance(metadata_value, dict) else {}
    return payload


def _build_contact_batch_payload(
    *,
    canales: list[str],
    total: int,
    payload: ProspectoContactarPayload,
    usuario_id: UUID | None,
    filtros: dict[str, Any],
    programacion: dict[str, str] | None,
    metadata_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "iniciado_por": str(usuario_id) if usuario_id else None,
        "canales": canales,
        "total_prospectos": total,
        "estado": "pendiente",
        "filtros": filtros or {},
    }
    if payload.campana_id:
        body["campana_id"] = str(payload.campana_id)
    if payload.lista_id:
        body["lista_id"] = str(payload.lista_id)
    if payload.batch_titulo:
        body["titulo"] = payload.batch_titulo
    if programacion:
        body["programacion"] = programacion

    metadata = {
        "correo_asunto": payload.correo_asunto,
        "whatsapp_mensaje": payload.whatsapp_mensaje,
        "llamada_notas": payload.llamada_notas,
    }
    if metadata_extra:
        metadata.update(metadata_extra)
    body["metadata"] = metadata
    return body


def _prospecto_filters_to_kwargs(filters: ProspectoFiltroPayload) -> dict[str, Any]:
    """Convierte filtros del wizard a kwargs entendibles por el repositorio."""

    return {
        "search": filters.search,
        "fuente": filters.fuente or None,
        "lookup_status": filters.lookup_status,
        "segmento": filters.segmento,
        "carrier_type": filters.carrier_type or None,
        "stage": filters.stage or None,
        "whatsapp_permitido": filters.whatsapp_permitido,
        "llamada_permitida": filters.llamada_permitida,
    }


def _is_recontact_blocked(metadata: dict[str, Any]) -> bool:
    """Evalúa si el prospecto ya no debe recibir campañas automáticas."""

    if not metadata:
        return False
    if str(metadata.get("recontact_blocked")).lower() in {"true", "1", "yes"}:
        return True
    block_reason = _clean_text(metadata.get("recontact_block_reason"))
    if block_reason:
        return True
    convertido = _clean_text(metadata.get("convertido_contacto_id"))
    if convertido:
        return True
    return False


def _split_recontact_blocked_prospectos(
    prospectos: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Separa los prospectos bloqueados para evitar recontacto."""

    permitidos: list[dict[str, Any]] = []
    bloqueados: list[str] = []
    for prospecto in prospectos:
        metadata = _ensure_dict(prospecto.get("metadata"), default={})
        if _is_recontact_blocked(metadata):
            prospecto_id = prospecto.get("id") or prospecto.get("prospecto_id")
            if prospecto_id:
                bloqueados.append(str(prospecto_id))
            continue
        permitidos.append(prospecto)
    return permitidos, bloqueados


def _build_contact_envios_entries(
    *,
    batch_id: Any,
    prospectos: list[dict[str, Any]],
    canales: dict[str, dict[str, Any]],
    programacion: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    batch_value = str(batch_id)
    for prospecto in prospectos:
        prospecto_id = prospecto.get("id") or prospecto.get("prospecto_id")
        if not prospecto_id:
            continue
        metadata = _ensure_dict(prospecto.get("metadata"), default={})
        detalle = {
            "display_name": prospecto.get("display_name"),
            "actividad": prospecto.get("actividad"),
            "email": prospecto.get("email"),
            "phone": prospecto.get("phone_e164") or prospecto.get("phone"),
            "whatsapp_permitido": prospecto.get("whatsapp_permitido"),
            "llamada_permitida": prospecto.get("llamada_permitida"),
            "carrier_type": prospecto.get("carrier_type"),
            "segmento": prospecto.get("segmento"),
            "stage": metadata.get("stage"),
        }
        for canal, canal_payload in canales.items():
            entry = {
                "batch_id": batch_value,
                "prospecto_id": str(prospecto_id),
                "canal": canal,
                "payload": canal_payload,
                "detalle": detalle,
            }
            if programacion and programacion.get(canal):
                entry["programado_en"] = programacion[canal]
            entries.append(entry)
    return entries


def _build_contact_resumen(envios: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa los envíos por prospecto con su estado inicial."""

    resumen_por_prospecto: dict[str, dict[str, Any]] = {}
    for envio in envios:
        prospecto_id = envio.get("prospecto_id")
        if not prospecto_id:
            continue
        key = str(prospecto_id)
        canal = _clean_text(envio.get("canal")) or "canal"
        estado = _clean_text(envio.get("estado")) or "pendiente"
        detalle = _ensure_dict(envio.get("detalle"), default={})
        resumen = resumen_por_prospecto.setdefault(
            key,
            {
                "prospecto_id": key,
                "display_name": detalle.get("display_name"),
                "email": detalle.get("email"),
                "telefono": detalle.get("phone"),
                "segmento": detalle.get("segmento"),
                "stage": detalle.get("stage"),
            },
        )
        if detalle.get("display_name"):
            resumen["display_name"] = detalle.get("display_name")
        if detalle.get("email"):
            resumen["email"] = detalle.get("email")
        if detalle.get("phone"):
            resumen["telefono"] = detalle.get("phone")
        if detalle.get("segmento"):
            resumen["segmento"] = detalle.get("segmento")
        if detalle.get("stage"):
            resumen["stage"] = detalle.get("stage")
        resumen[canal] = estado
    return list(resumen_por_prospecto.values())


def _sse_payload(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _build_contact_log_entry(
    *,
    prospecto_id: Any,
    canal: str,
    estado: str,
    detalle: dict[str, Any] | None = None,
    error: str | None = None,
    batch_id: Any | None = None,
    envio_id: Any | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "prospecto_id": str(prospecto_id),
        "canal": canal,
        "estado": estado,
        "detalle": detalle or {},
    }
    if error:
        entry["error"] = error
    if batch_id:
        entry["batch_id"] = str(batch_id)
    if envio_id:
        entry["envio_id"] = str(envio_id)
    return entry


def _rpc_field(data: Any, *keys: str) -> Any:
    row: Any
    if isinstance(data, list):
        row = data[0] if data else None
    else:
        row = data
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


async def require_admin_user(
    *,
    repo: CRMRepository = Depends(get_repository),
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> UUID:
    if not usuario_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="auth_required")
    has_role = await repo.user_has_role(usuario_id=usuario_id, role_code="admin")
    if not has_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return usuario_id


def _coerce_metadata(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        parsed = value
    elif isinstance(value, str):
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


def _map_agenda_row(row: dict[str, Any]) -> dict[str, Any]:
    metadata_raw = row.get("metadata")
    metadata_parsed = _coerce_metadata(metadata_raw)
    if metadata_parsed is None and isinstance(metadata_raw, dict):
        metadata_parsed = metadata_raw
    metadata: dict[str, Any] = dict(metadata_parsed) if isinstance(metadata_parsed, dict) else {}
    estado = _normalize_agenda_estado(row.get("status") or metadata.get("estado"))
    oportunidad_id = (
        row.get("oportunidad_id") or metadata.get("oportunidad_id") or row.get("tarjeta_id")
    )

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
        "oportunidad_id": oportunidad_id,
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


def _map_visit_detail_row(row: dict[str, Any]) -> dict[str, Any]:
    mapped = dict(row)
    metadata = _coerce_metadata(mapped.get("metadata"))
    if metadata is not None:
        mapped["metadata"] = metadata
    else:
        metadata = mapped.get("metadata") if isinstance(mapped.get("metadata"), dict) else None
    opportunity_id = (
        mapped.get("oportunidad_id")
        or (metadata.get("oportunidad_id") if isinstance(metadata, dict) else None)
        or mapped.get("tarjeta_id")
        or mapped.get("legacy_lead_id")
    )
    if opportunity_id:
        mapped["oportunidad_id"] = opportunity_id
    return mapped


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


class CRMPipelineStage(BaseModel):
    id: UUID
    organizacion_id: UUID
    codigo: str
    nombre: str
    orden: int
    probabilidad: float | None = None
    categoria: str
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str


class CRMOpportunity(BaseModel):
    id: UUID
    organizacion_id: UUID
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID
    titulo: str
    descripcion: str | None = None
    monto_estimado: float | None = None
    moneda: str
    probabilidad: float | None = None
    fecha_cierre_probable: str | None = None
    estado: str
    motivo_perdida: str | None = None
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str
    cerrado_en: str | None = None


class CRMOpportunityCreate(BaseModel):
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID
    titulo: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    monto_estimado: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = None
    estado: str = Field(default="abierta")
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def moneda_upper(cls, value: str) -> str:
        return value.upper()


class CRMOpportunityUpdate(BaseModel):
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID | None = None
    titulo: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    monto_estimado: float | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = None
    estado: str | None = None
    motivo_perdida: str | None = None
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default=None)


class CRMOpportunitiesResponse(BaseModel):
    items: list[CRMOpportunity]
    limit: int
    offset: int


class CRMContact(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre_completo: str | None = None
    correo: str | None = None
    telefono_e164: str | None = None
    company_name: str | None = None
    notes: str | None = None
    necesidad_proposito: str | None = None
    estado: str | None = None
    origen: str | None = None
    metadata: dict[str, Any] | None = None
    actualizado_en: datetime | None = None


class CRMContactCreate(BaseModel):
    nombre_completo: str | None = Field(default=None, max_length=160)
    correo: str | None = Field(default=None, max_length=255)
    telefono_e164: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    necesidad_proposito: str | None = Field(default=None, max_length=2000)
    estado: str | None = Field(default=None, max_length=80)
    propietario_usuario_id: UUID | None = None
    origen: str | None = Field(default=None, max_length=80)
    metadata: dict[str, Any] | None = None


class CRMContactUpdate(BaseModel):
    nombre_completo: str | None = Field(default=None, max_length=160)
    correo: str | None = Field(default=None, max_length=255)
    telefono_e164: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    necesidad_proposito: str | None = Field(default=None, max_length=2000)
    estado: str | None = Field(default=None, max_length=80)


class CRMContactSearchItem(BaseModel):
    id: UUID
    nombre: str | None = None
    correo: str | None = None
    telefono: str | None = None
    empresa: str | None = None


class CRMContactSearchResponse(BaseModel):
    items: list[CRMContactSearchItem]
    limit: int
    offset: int


class EmailTemplateResource(BaseModel):
    label: str
    url: str


class CRMEmailTemplate(BaseModel):
    slug: str
    intro: str
    closing: str
    highlights: list[str]
    resources: list[EmailTemplateResource]
    use_summary: bool = True
    use_highlights: bool = True
    use_resources: bool = True
    signature_salutation: str
    signature: str
    updated_at: datetime | None = None


class CRMEmailTemplateUpdate(BaseModel):
    intro: str
    closing: str
    highlights: list[str]
    resources: list[EmailTemplateResource]
    use_summary: bool = True
    use_highlights: bool = True
    use_resources: bool = True
    signature_salutation: str
    signature: str


class CRMQuoteTemplate(BaseModel):
    slug: str
    nombre: str
    descripcion: str
    html: str
    css: str
    variables: list[str]
    config: dict[str, Any]
    version: int = 1
    is_active: bool = True
    updated_at: datetime | None = None


class CRMQuoteTemplateUpdate(BaseModel):
    nombre: str
    descripcion: str
    html: str
    css: str
    variables: list[str]
    config: dict[str, Any]
    version: int = 1
    is_active: bool = True


class CRMReminderSettings(BaseModel):
    slug: str
    reminder_enabled: bool
    reminder_offset_minutes: Annotated[int, Field(ge=15, le=720)]
    updated_at: datetime | None = None


class CRMReminderSettingsUpdate(BaseModel):
    reminder_enabled: bool
    reminder_offset_minutes: Annotated[int, Field(ge=15, le=720)]


class CRMCatalogItem(BaseModel):
    id: UUID
    slug: str | None = None
    nombre: str
    tipo: str
    descripcion_corta: str | None = None
    descripcion_larga: str | None = None
    unidad: str
    precio_base: float | None = None
    moneda: str
    impuestos: list[dict[str, Any]] | None = None
    activo: bool
    requiere_factura: bool
    clave_sat: str | None = None
    unidad_sat: str | None = None
    metadatos: dict[str, Any] | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None
    creado_en: datetime
    actualizado_en: datetime
    linea_id: UUID | None = None
    familia_id: UUID | None = None
    modelo_id: UUID | None = None
    linea: CRMLineaDeNegocio | None = None
    familia: CRMFamiliaProducto | None = None
    modelo: CRMModeloProducto | None = None

    model_config = {"populate_by_name": True}


class CRMCatalogItemCreate(BaseModel):
    slug: str | None = Field(default=None, max_length=140)
    nombre: str = Field(..., max_length=255)
    tipo: str = Field(default="servicio")
    descripcion_corta: str | None = Field(default=None, max_length=400)
    descripcion_larga: str | None = Field(default=None, max_length=4000)
    unidad: str = Field(default="unidad", max_length=80)
    precio_base: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    impuestos: list[dict[str, Any]] | None = Field(default_factory=list)
    activo: bool = True
    requiere_factura: bool = False
    clave_sat: str | None = Field(default=None, max_length=100)
    unidad_sat: str | None = Field(default=None, max_length=100)
    metadatos: dict[str, Any] | None = Field(default_factory=dict)
    linea_id: UUID | None = None
    familia_id: UUID | None = None
    modelo_id: UUID | None = None


class CRMCatalogItemUpdate(BaseModel):
    slug: str | None = Field(default=None, max_length=140)
    nombre: str | None = Field(default=None, max_length=255)
    tipo: str | None = Field(default=None)
    descripcion_corta: str | None = Field(default=None, max_length=400)
    descripcion_larga: str | None = Field(default=None, max_length=4000)
    unidad: str | None = Field(default=None, max_length=80)
    precio_base: float | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    impuestos: list[dict[str, Any]] | None = None
    activo: bool | None = None
    requiere_factura: bool | None = None
    clave_sat: str | None = Field(default=None, max_length=100)
    unidad_sat: str | None = Field(default=None, max_length=100)
    metadatos: dict[str, Any] | None = None
    linea_id: UUID | None = None
    familia_id: UUID | None = None
    modelo_id: UUID | None = None


class CRMCatalogDeleteResponse(BaseModel):
    item: CRMCatalogItem | None = None
    hard_deleted: bool = False


# existing classes...
class CRMProductoMetadataField(BaseModel):
    id: str
    label: str
    type: Literal["text", "number", "boolean", "select"] = "text"
    required: bool = False
    description: str | None = None
    options: list[str] | None = None


class CRMProductMetadataScheme(BaseModel):
    id: UUID
    organizacion_id: UUID
    name: str
    description: str | None = None
    fields: list[CRMProductoMetadataField]
    created_at: str
    updated_at: str


class CRMProductMetadataSchemeCreate(BaseModel):
    name: str
    description: str | None = None
    fields: list[CRMProductoMetadataField]


class CRMProductMetadataSchemeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    fields: list[CRMProductoMetadataField] | None = None


class CRMLineaDeNegocio(BaseModel):
    id: UUID
    nombre: str
    descripcion: str | None = None
    activo: bool
    metadata: dict[str, Any] | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMFamiliaProducto(BaseModel):
    id: UUID
    linea_id: UUID | None = None
    nombre: str
    descripcion: str | None = None
    activo: bool
    metadata: dict[str, Any] | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMModeloProducto(BaseModel):
    id: UUID
    nombre: str
    descripcion: str | None = None
    activo: bool
    metadata: dict[str, Any] | None = None
    creado_en: datetime
    actualizado_en: datetime
    familia_id: UUID | None = None


class CRMLineaDeNegocioCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    activo: bool = True
    metadata: dict[str, Any] | None = None


class CRMLineaDeNegocioUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    activo: bool | None = None
    metadata: dict[str, Any] | None = None


class CRMFamiliaProductoCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    linea_id: UUID
    activo: bool = True
    metadata: dict[str, Any] | None = None


class CRMFamiliaProductoUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    linea_id: UUID | None = None
    activo: bool | None = None
    metadata: dict[str, Any] | None = None


class CRMModeloProductoCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    activo: bool = True
    metadata: dict[str, Any] | None = None
    familia_id: UUID | None = None


class CRMModeloProductoUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=2000)
    activo: bool | None = None
    metadata: dict[str, Any] | None = None
    familia_id: UUID | None = None


class LeadQuoteItemPayload(BaseModel):
    catalog_item_id: UUID | None = None
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


class LeadQuoteItem(BaseModel):
    id: UUID
    cotizacion_id: UUID
    catalog_item_id: UUID | None = None
    catalog_item: CRMCatalogItem | None = None
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


class LeadQuoteCreatePayload(BaseModel):
    titulo: str | None = Field(default=None, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    detalles_propuesta_html: str | None = Field(default=None, max_length=16000)
    conceptos: list[dict[str, Any]] | None = Field(default=None)
    subtotal: float | None = Field(default=None)
    impuestos: float | None = Field(default=None)
    total: float | None = Field(default=None)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    valido_hasta: date | None = Field(default=None)
    pdf_url: str | None = Field(default=None, max_length=2048)
    pdf_path: str | None = Field(default=None, max_length=512)
    metadatos: dict[str, Any] | None = Field(default=None)
    items: list[LeadQuoteItemPayload] | None = Field(default=None)


class LeadQuoteMarkPayload(BaseModel):
    estado: Literal["enviada", "aceptada", "rechazada", "cancelada"]
    canal: Literal["email", "whatsapp", "manual", "otro"] | None = Field(default=None)
    proposal_sent_at: datetime | date | None = Field(default=None)
    metadata: dict[str, Any] | None = Field(default=None)


class LeadQuoteSendPayload(LeadQuoteCreatePayload):
    channel: Literal["email", "whatsapp"]
    email_to: list[str] | None = Field(default=None)
    whatsapp_to: str | None = Field(default=None)
    subject: str | None = Field(default=None, max_length=200)
    message: str | None = Field(default=None, max_length=2000)


class LeadQuote(BaseModel):
    id: UUID
    oportunidad_id: UUID
    version: int
    titulo: str | None = None
    descripcion: str | None = None
    detalles_propuesta_html: str | None = None
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


class LeadQuoteResponse(BaseModel):
    quote: LeadQuote


class LeadQuoteListResponse(BaseModel):
    quotes: list[LeadQuote] = Field(default_factory=list)


class QuoteSignedUrlResponse(BaseModel):
    url: HttpUrl
    expires_in: int = Field(default=300, ge=1)


class CRMContactSummary(BaseModel):
    total: int | None = 0
    completos: int | None = 0
    incompletos: int | None = 0
    activos: int | None = 0
    leads: int | None = 0
    webchat: int | None = 0
    propietarios: int | None = 0
    ultimo: str | None = None


class CRMContactTimelineEntry(BaseModel):
    bucket_date: str
    nuevos: int
    completos: int
    webchat: int


class CRMContactListRow(BaseModel):
    contacto_id: UUID
    nombre: str | None = None
    correo: str | None = None
    telefono: str | None = None
    estado: str | None = None
    captura_estado: str | None = None
    origen: str | None = None
    creado_en: datetime
    actualizado_en: datetime | None = None
    company_name: str | None = None
    propietario_id: UUID | None = None
    propietario_nombre: str | None = None
    ultimo_contacto_en: datetime | None = None
    conversaciones: int | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None
    total_rows: int | None = None


class CRMInboxFolder(BaseModel):
    id: str
    label: str | None = None
    count: int = 0


class CRMInboxSummary(BaseModel):
    total: int = 0
    unread: int = 0
    awaiting: int = 0
    folders: list[CRMInboxFolder] = Field(default_factory=list)


class CRMInboxThread(BaseModel):
    conversacion_id: UUID
    contacto_id: UUID | None = None
    contacto_nombre: str | None = None
    contacto_correo: str | None = None
    contacto_telefono: str | None = None
    canal: str | None = None
    estado: str | None = None
    prioridad: int | None = None
    iniciada_en: datetime | None = None
    ultimo_mensaje_en: datetime | None = None
    no_leidos: int | None = None
    asignado_id: UUID | None = None
    asignado_nombre: str | None = None
    tags: list[str] | None = None
    manual_override: bool | None = None
    oportunidad_id: UUID | None = None
    parent_opportunity_id: UUID | None = None
    restart_sequence: int | None = None
    conversation_history: list[str] | None = None
    last_message_preview: str | None = None
    last_message_at: datetime | None = None
    messages: list[dict[str, Any]] | None = None
    total_rows: int | None = None


class CRMInboxMessage(BaseModel):
    message_id: UUID
    conversacion_id: UUID
    author: str | None = None
    role: str | None = None
    body: list[str] | None = None
    tipo_contenido: str | None = None
    datos: dict[str, Any] | None = None
    creado_en: datetime
    attachments: list[dict[str, Any]] | None = None


class CRMPipelineHistoryItem(BaseModel):
    id: UUID
    oportunidad_id: UUID
    tipo: str
    cambiado_en: datetime
    cambiado_por_id: UUID | None = None
    cambiado_por_nombre: str | None = None
    fuente: str | None = None
    etapa_origen_id: UUID | None = None
    etapa_origen_nombre: str | None = None
    etapa_destino_id: UUID | None = None
    etapa_destino_nombre: str | None = None
    motivo: str | None = None
    nota: str | None = None
    metadata: dict[str, Any] | None = None


class CRMPipelineHistoryResponse(BaseModel):
    items: list[CRMPipelineHistoryItem]
    limit: int
    offset: int


class CRMHistoryNoteCreate(BaseModel):
    texto: str = Field(..., min_length=1, max_length=2000)
    metadata: dict[str, Any] | None = None


class CRMActivity(BaseModel):
    id: UUID
    organizacion_id: UUID
    tipo: str
    canal: str | None = None
    asunto: str | None = None
    descripcion: str | None = None
    estado: str
    prioridad: str
    fecha_vencimiento: datetime | None = None
    inicio_en: datetime | None = None
    fin_en: datetime | None = None
    sla_horas: int | None = None
    recordatorio_en: datetime | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMActivityCreate(BaseModel):
    tipo: str = Field(..., max_length=50)
    canal: str | None = Field(default=None, max_length=50)
    asunto: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=4000)
    estado: str = Field(default="pendiente")
    prioridad: str = Field(default="media")
    fecha_vencimiento: datetime | None = None
    inicio_en: datetime | None = None
    fin_en: datetime | None = None
    sla_horas: int | None = Field(default=None, ge=0)
    recordatorio_en: datetime | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMActivitiesResponse(BaseModel):
    items: list[CRMActivity]
    limit: int
    offset: int


class CRMTicket(BaseModel):
    id: UUID
    organizacion_id: UUID
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    asunto: str
    descripcion: str | None = None
    estado: str
    prioridad: str
    canal_origen: str | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime
    cerrado_en: datetime | None = None


class CRMTicketCreate(BaseModel):
    asunto: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=4000)
    estado: str = Field(default="abierto")
    prioridad: str = Field(default="media")
    canal_origen: str | None = Field(default=None, max_length=50)
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMTicketsResponse(BaseModel):
    items: list[CRMTicket]
    limit: int
    offset: int


class CRMTicketComment(BaseModel):
    id: UUID
    organizacion_id: UUID
    ticket_id: UUID
    autor_usuario_id: UUID | None = None
    autor_cliente_id: UUID | None = None
    mensaje: str
    metadata: dict | None = None
    creado_en: datetime


class CRMTicketCommentCreate(BaseModel):
    ticket_id: UUID
    mensaje: str = Field(..., max_length=4000)
    autor_usuario_id: UUID | None = None
    autor_cliente_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMFile(BaseModel):
    id: UUID
    organizacion_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    nombre_original: str
    content_type: str | None = None
    tamano_bytes: int | None = None
    storage_path: str
    metadata: dict | None = None
    subido_por_usuario_id: UUID | None = None
    subido_en: datetime


class CRMFileCreate(BaseModel):
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID
    nombre_original: str = Field(..., max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    tamano_bytes: int | None = Field(default=None, ge=0)
    storage_path: str = Field(..., max_length=500)
    metadata: dict | None = Field(default_factory=dict)
    subido_por_usuario_id: UUID | None = None


class CRMTag(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre: str
    color: str | None = None
    creado_en: datetime


class CRMTagCreate(BaseModel):
    nombre: str = Field(..., max_length=120)
    color: str | None = Field(default=None, max_length=20)


class CRMTagging(BaseModel):
    id: UUID
    organizacion_id: UUID
    tag_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    creado_en: datetime


class CRMTaggingCreate(BaseModel):
    tag_id: UUID
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID


class CRMProduct(BaseModel):
    id: UUID
    organizacion_id: UUID
    codigo: str
    nombre: str
    descripcion: str | None = None
    precio_base: float | None = None
    moneda: str
    activo: bool
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMProductCreate(BaseModel):
    codigo: str = Field(..., max_length=120)
    nombre: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    precio_base: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    activo: bool = True
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class CRMQuote(BaseModel):
    id: UUID
    organizacion_id: UUID
    oportunidad_id: UUID | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    estatus: str
    total: float | None = None
    moneda: str
    valida_hasta: date | None = None
    creada_por_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMQuoteCreate(BaseModel):
    oportunidad_id: UUID | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    estatus: str = Field(default="borrador")
    total: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    valida_hasta: date | None = None
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class CRMQuoteItem(BaseModel):
    id: UUID
    cotizacion_id: UUID
    producto_id: UUID | None = None
    descripcion: str
    cantidad: float
    precio_unitario: float | None = None
    descuento_porcentaje: float | None = None
    subtotal: float | None = None
    metadata: dict | None = None


class CRMQuoteItemCreate(BaseModel):
    cotizacion_id: UUID
    producto_id: UUID | None = None
    descripcion: str = Field(..., max_length=500)
    cantidad: float = Field(default=1, gt=0)
    precio_unitario: float | None = Field(default=None, ge=0)
    descuento_porcentaje: float | None = Field(default=None, ge=0, le=100)
    subtotal: float | None = Field(default=None, ge=0)
    metadata: dict | None = Field(default_factory=dict)


class CRMCampaign(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre: str
    tipo: str | None = None
    canal: str | None = None
    presupuesto: float | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMCampaignCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    tipo: str | None = Field(default=None, max_length=120)
    canal: str | None = Field(default=None, max_length=120)
    presupuesto: float | None = Field(default=None, ge=0)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMLead(BaseModel):
    id: UUID
    organizacion_id: UUID
    campana_id: UUID | None = None
    contacto_id: UUID | None = None
    cuenta_id: UUID | None = None
    origen: str | None = None
    estado: str
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMLeadCreate(BaseModel):
    campana_id: UUID | None = None
    contacto_id: UUID | None = None
    cuenta_id: UUID | None = None
    origen: str | None = Field(default=None, max_length=120)
    estado: str = Field(default="nuevo")
    metadata: dict | None = Field(default_factory=dict)


class CRMLeadEvent(BaseModel):
    id: UUID
    lead_id: UUID
    tipo: str
    metadata: dict | None = None
    registrado_en: datetime


class CRMLeadEventCreate(BaseModel):
    lead_id: UUID
    tipo: str = Field(..., max_length=120)
    metadata: dict | None = Field(default_factory=dict)


class CRMContactRestartStat(BaseModel):
    contacto_id: UUID
    contacto_nombre: str | None = None
    contacto_correo: str | None = None
    contacto_telefono: str | None = None
    total_ciclos: int
    ciclo_actual: int
    monto_total: float | None = None
    monto_ciclo_actual: float | None = None
    monto_ciclos_previos: float | None = None
    oportunidad_id: UUID | None = None
    etapa_id: UUID | None = None
    etapa_nombre: str | None = None
    estado: str | None = None
    vendedor_id: UUID | None = None
    vendedor_nombre: str | None = None
    actualizado_en: datetime
    primer_ciclo_en: datetime | None = None
    ultimo_reinicio_en: datetime | None = None
    ciclos_detalle: list[dict[str, Any]] | None = None


class CRMPipelineTopSeller(BaseModel):
    id: UUID | None = None
    nombre: str | None = None
    total: int = 0


class CRMPipelineCards(BaseModel):
    total: int = 0
    abiertas: int = 0
    ganadas: int = 0
    perdidas: int = 0
    nuevas: int = 0
    monto_total: float = 0
    top_vendedor: CRMPipelineTopSeller | None = None


class CRMPipelineChartPoint(BaseModel):
    date: str
    nuevos: int = 0
    ganados: int = 0
    perdidos: int = 0


class CRMPipelineTableRow(BaseModel):
    id: int
    header: str
    type: str
    status: str
    target: str
    limit: str
    reviewer: str
    raw: dict[str, Any] | None = None


class CRMPipelineOverview(BaseModel):
    cards: CRMPipelineCards
    chart: list[CRMPipelineChartPoint]
    table: list[CRMPipelineTableRow]
    total_rows: int


class CRMPipelineBoardCard(BaseModel):
    tarjeta_id: UUID
    contacto_id: UUID | None = None
    conversacion_id: UUID | None = None
    titulo: str
    nombre: str
    correo: str | None = None
    telefono: str | None = None
    empresa: str | None = None
    notas: str | None = None
    necesidad_proposito: str | None = None
    canal: str | None = None
    estado: str | None = None
    etapa_id: UUID
    etapa_nombre: str
    etapa_codigo: str | None = None
    monto: float | None = None
    moneda: str | None = None
    probabilidad: float | None = None
    proyecto_nombre: str | None = None
    proyecto_necesidades: str | None = None
    asignado_id: UUID | None = None
    asignado_nombre: str | None = None
    prioridad: float | None = None
    actualizado_en: datetime | None = None
    etiquetas: list[str] | None = None
    metadata: dict[str, Any] | None = None


class CRMPipelineBoardStage(BaseModel):
    id: UUID
    nombre: str
    codigo: str
    categoria: str
    orden: int
    tablero_id: str | None = None
    metadatos: dict[str, Any]
    tarjetas: list[CRMPipelineBoardCard]


class CRMPipelineBoard(BaseModel):
    stages: list[CRMPipelineBoardStage]
    sin_conversacion: list[CRMPipelineBoardCard]
    visitantes_sin_chat: int = 0


class CRMPipelineCardResponse(BaseModel):
    stage: CRMPipelineBoardStage
    card: CRMPipelineBoardCard


class CRMPipelineOpportunityPatch(CRMOpportunityUpdate):
    expected_etapa_id: UUID | None = None
    motivo: str | None = None
    fuente: str | None = Field(default=None, max_length=50)


class CRMNote(BaseModel):
    id: UUID
    organizacion_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    texto: str
    visible_para_cliente: bool
    tipo: str
    creado_por_usuario_id: UUID | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMNoteCreate(BaseModel):
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID
    texto: str = Field(..., max_length=4000)
    visible_para_cliente: bool = False
    tipo: str = Field(default="interna", max_length=50)
    creado_por_usuario_id: UUID | None = None


class CRMAuditLog(BaseModel):
    id: UUID
    organizacion_id: UUID
    usuario_id: UUID | None = None
    accion: str
    tabla: str
    registro_id: UUID | None = None
    cambios: dict | None = None
    ip: str | None = None
    user_agent: str | None = None
    creado_en: datetime


class CRMLogoAsset(BaseModel):
    id: UUID
    nombre: str
    descripcion: str | None = None
    file_url: str
    file_path: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CRMLogoAssetList(BaseModel):
    logos: list[CRMLogoAsset]


class CRMMediaAssetUpload(BaseModel):
    url: str
    path: str
    bucket: str = Field(default="recursos")


@router.get("/cuentas", response_model=CRMAccountsResponse)
async def list_accounts(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMAccountsResponse:
    try:
        rows = await repo.list_accounts(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMAccount.model_validate(row) for row in rows]
    return CRMAccountsResponse(items=items, limit=limit, offset=offset)


@router.post("/cuentas", response_model=CRMAccount, status_code=status.HTTP_201_CREATED)
async def create_account(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMAccountCreate,
) -> CRMAccount:
    try:
        row = await repo.create_account(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMAccount.model_validate(row)


@router.get("/cuentas/{cuenta_id}", response_model=CRMAccount)
async def get_account(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cuenta_id: UUID,
) -> CRMAccount:
    try:
        row = await repo.get_account(organizacion_id=organizacion_id, account_id=cuenta_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cuenta_no_encontrada")
    return CRMAccount.model_validate(row)


@router.get("/clientes", response_model=ClienteListResponse)
async def list_clientes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ClienteListResponse:
    try:
        rows = await repo.list_clientes(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [ClienteRecord.model_validate(row) for row in rows]
    return ClienteListResponse(items=items, limit=limit, offset=offset)


@router.get("/etapas", response_model=list[CRMPipelineStage])
async def list_pipeline_stages(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMPipelineStage]:
    try:
        rows = await repo.list_pipelines(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMPipelineStage.model_validate(row) for row in rows]


@router.get("/oportunidades", response_model=CRMOpportunitiesResponse)
async def list_opportunities(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    contacto_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMOpportunitiesResponse:
    try:
        rows = await repo.list_opportunities(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
            contacto_id=contacto_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMOpportunity.model_validate(row) for row in rows]
    return CRMOpportunitiesResponse(items=items, limit=limit, offset=offset)


@router.post(
    "/oportunidades",
    response_model=CRMOpportunity,
    status_code=status.HTTP_201_CREATED,
)
async def create_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMOpportunityCreate,
) -> CRMOpportunity:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_opportunity(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Registrar historial de etapa inicial (best-effort)
    if payload.etapa_id:
        history_payload: dict[str, str] = {
            "oportunidad_id": str(row["id"]),
            "etapa_destino_id": str(payload.etapa_id),
            "fuente": "api",
        }
        if usuario_id:
            history_payload["cambiado_por_usuario_id"] = str(usuario_id)
        try:
            await repo.append_stage_history(
                organizacion_id=organizacion_id,
                payload=history_payload,
            )
        except CRMRepositoryError as exc:  # pragma: no cover - no debe frenar creación
            logger.warning("crm.historial_no_registrado", extra={"error": str(exc)})

    return CRMOpportunity.model_validate(row)


@router.get("/oportunidades/{oportunidad_id}", response_model=CRMOpportunity)
async def get_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> CRMOpportunity:
    try:
        row = await repo.get_opportunity(
            organizacion_id=organizacion_id, opportunity_id=oportunidad_id
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="oportunidad_no_encontrada"
        )
    return CRMOpportunity.model_validate(row)


@router.post(
    "/pipeline/opportunities",
    response_model=CRMPipelineCardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def pipeline_create_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMOpportunityCreate,
) -> CRMPipelineCardResponse:
    try:
        row = await repo.create_opportunity(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    opportunity_id = row.get("id")
    if not opportunity_id:
        raise HTTPException(status_code=502, detail="opportunity_create_without_id")
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=UUID(str(opportunity_id)),
    )


@router.patch(
    "/pipeline/opportunities/{oportunidad_id}",
    response_model=CRMPipelineCardResponse,
)
async def pipeline_update_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    oportunidad_id: UUID,
    payload: CRMPipelineOpportunityPatch,
) -> CRMPipelineCardResponse:
    current = await repo.get_pipeline_opportunity(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if current is None:
        raise HTTPException(status_code=404, detail="opportunity_not_found")
    current_stage = _safe_uuid(current.get("etapa_id"))
    if payload.expected_etapa_id and current_stage and payload.expected_etapa_id != current_stage:
        raise HTTPException(status_code=409, detail="opportunity_stage_conflict")
    update_body = payload.model_dump(
        mode="json",
        exclude_none=True,
        exclude={"expected_etapa_id", "motivo", "fuente"},
    )
    current_metadata = _ensure_dict(current.get("metadata"), default={})
    previous_booking_id = _extract_demo_booking_id(current_metadata)
    merged_metadata = current_metadata
    if "metadata" in update_body:
        new_metadata = _ensure_dict(update_body.get("metadata"), default={})
        merged_metadata = {**current_metadata, **new_metadata}
        update_body["metadata"] = merged_metadata
    try:
        await repo.update_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            payload=update_body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    new_booking_id = _extract_demo_booking_id(merged_metadata)
    if new_booking_id and new_booking_id != previous_booking_id:
        await webchat_service.ensure_booking_invite_sent_for_opportunity(
            booking_id=new_booking_id,
            oportunidad_id=str(oportunidad_id),
        )
    if payload.etapa_id and current_stage and payload.etapa_id != current_stage:
        history_payload = {
            "oportunidad_id": str(oportunidad_id),
            "etapa_origen_id": str(current_stage),
            "etapa_destino_id": str(payload.etapa_id),
            "cambiado_por_usuario_id": str(usuario_id) if usuario_id else None,
            "motivo": payload.motivo,
            "fuente": payload.fuente or "humano",
            "metadata": payload.metadata or {},
        }
        await repo.append_stage_history(
            organizacion_id=organizacion_id,
            payload={k: v for k, v in history_payload.items() if v is not None},
        )
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )


@router.delete(
    "/pipeline/opportunities/{oportunidad_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def pipeline_delete_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> Response:
    try:
        await repo.delete_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/pipeline/cards/{oportunidad_id}",
    response_model=CRMPipelineCardResponse,
)
async def pipeline_get_card(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> CRMPipelineCardResponse:
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )


@router.get(
    "/pipeline/opportunities/{oportunidad_id}/history",
    response_model=CRMPipelineHistoryResponse,
)
async def pipeline_get_history(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMPipelineHistoryResponse:
    rows = await repo.list_opportunity_stage_history(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
        limit=limit,
        offset=offset,
    )
    items = [_history_item_from_row(row) for row in rows]
    return CRMPipelineHistoryResponse(items=items, limit=limit, offset=offset)


@router.post(
    "/pipeline/opportunities/{oportunidad_id}/history",
    response_model=CRMPipelineHistoryItem,
    status_code=status.HTTP_201_CREATED,
)
async def pipeline_append_history_note(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    oportunidad_id: UUID,
    payload: CRMHistoryNoteCreate,
) -> CRMPipelineHistoryItem:
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="note_empty")
    opportunity = await repo.get_pipeline_opportunity(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if opportunity is None:
        raise HTTPException(status_code=404, detail="opportunity_not_found")
    etapa_actual = _safe_uuid(opportunity.get("etapa_id"))
    if etapa_actual is None:
        raise HTTPException(status_code=400, detail="opportunity_stage_missing")
    metadata = _ensure_dict(payload.metadata, default={})
    try:
        entry = await repo.append_note_history(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            etapa_id=etapa_actual,
            usuario_id=usuario_id,
            texto=texto,
            metadata=metadata,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    history_id = _safe_uuid(entry.get("id"))
    enriched = None
    if history_id:
        enriched = await repo.get_opportunity_history_entry(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            history_id=history_id,
        )
    row = enriched or entry
    return _history_item_from_row(row)


@router.get("/catalog/items", response_model=list[CRMCatalogItem])
async def list_catalog_items(
    *,
    repo: CRMRepository = Depends(get_repository),
    include_inactive: bool = Query(default=False),
    tipo: Literal["producto", "servicio", "paquete"] | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[CRMCatalogItem]:
    try:
        rows = await repo.list_catalog_items(
            include_inactive=include_inactive,
            tipo=tipo,
            search=search,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMCatalogItem.model_validate(row) for row in rows]


@router.post("/catalog/items", response_model=CRMCatalogItem, status_code=status.HTTP_201_CREATED)
async def create_catalog_item(
    *,
    repo: CRMRepository = Depends(get_repository),
    payload: CRMCatalogItemCreate,
    usuario_id: UUID | None = Depends(optional_usuario_id),
    background_tasks: BackgroundTasks,
) -> CRMCatalogItem:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if usuario_id:
        body.setdefault("created_by", str(usuario_id))
        body.setdefault("updated_by", str(usuario_id))
    try:
        row = await repo.create_catalog_item(payload=body)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMCatalogItem.model_validate(row)


@router.patch("/catalog/items/{item_id}", response_model=CRMCatalogItem)
async def update_catalog_item(
    *,
    repo: CRMRepository = Depends(get_repository),
    item_id: UUID,
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMCatalogItemUpdate,
    background_tasks: BackgroundTasks,
) -> CRMCatalogItem:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    if usuario_id:
        body["updated_by"] = str(usuario_id)
    try:
        row = await repo.update_catalog_item(item_id=item_id, payload=body)
    except CRMRepositoryError as exc:
        detail = "catalog_item_not_found" if "catalog_item_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "catalog_item_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMCatalogItem.model_validate(row)


@router.delete("/catalog/items/{item_id}", response_model=CRMCatalogDeleteResponse)
async def delete_catalog_item(
    *,
    repo: CRMRepository = Depends(get_repository),
    item_id: UUID,
    hard: bool = Query(default=False),
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMCatalogDeleteResponse:
    try:
        if hard:
            row = await repo.delete_catalog_item(item_id=item_id)
            return CRMCatalogDeleteResponse(
                item=CRMCatalogItem.model_validate(row),
                hard_deleted=True,
            )
        body: dict[str, Any] = {"activo": False}
        if usuario_id:
            body["updated_by"] = str(usuario_id)
        row = await repo.soft_delete_catalog_item(item_id=item_id, payload=body)
        return CRMCatalogDeleteResponse(
            item=CRMCatalogItem.model_validate(row),
            hard_deleted=False,
        )
    except CRMRepositoryError as exc:
        detail = "catalog_item_not_found" if "catalog_item_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "catalog_item_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc


class CatalogVectorStoreStatus(BaseModel):
    last_reindex_at: str | None = None
    last_reindex_by: UUID | None = None
    last_reindex_channel: str | None = None
    last_query_at: str | None = None
    last_query_by: UUID | None = None
    last_query_channel: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class CatalogVectorStoreAuditEntry(BaseModel):
    id: UUID
    tipo: Literal["reindex", "query"]
    canal: str | None = None
    usuario_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    creado_en: str

    model_config = ConfigDict(populate_by_name=True)


@router.get("/catalog/vector-store/status", response_model=CatalogVectorStoreStatus)
async def catalog_vector_store_status(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> CatalogVectorStoreStatus:
    reindex_rows = await repo.list_catalog_embeddings_audit(
        organizacion_id=organizacion_id,
        tipo="reindex",
        limit=1,
    )
    query_rows = await repo.list_catalog_embeddings_audit(
        organizacion_id=organizacion_id,
        tipo="query",
        limit=1,
    )
    reindex = reindex_rows[0] if reindex_rows else None
    query = query_rows[0] if query_rows else None
    return CatalogVectorStoreStatus(
        last_reindex_at=reindex.get("creado_en") if reindex else None,
        last_reindex_by=_safe_uuid(reindex.get("usuario_id")) if reindex else None,
        last_reindex_channel=reindex.get("canal") if reindex else None,
        last_query_at=query.get("creado_en") if query else None,
        last_query_by=_safe_uuid(query.get("usuario_id")) if query else None,
        last_query_channel=query.get("canal") if query else None,
    )


@router.get(
    "/catalog/vector-store/audit",
    response_model=list[CatalogVectorStoreAuditEntry],
)
async def catalog_vector_store_audit(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[CatalogVectorStoreAuditEntry]:
    rows = await repo.list_catalog_embeddings_audit(
        organizacion_id=organizacion_id,
        limit=limit,
    )
    return [CatalogVectorStoreAuditEntry.model_validate(row) for row in rows]


@router.get("/productos/lineas", response_model=list[CRMLineaDeNegocio])
async def list_product_lineas(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None, max_length=200),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[CRMLineaDeNegocio]:
    try:
        rows = await repo.list_lineas_de_negocio(
            organizacion_id=organizacion_id,
            include_inactive=include_inactive,
            search=search,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMLineaDeNegocio.model_validate(row) for row in rows]


@router.post(
    "/productos/lineas",
    response_model=CRMLineaDeNegocio,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_linea(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMLineaDeNegocioCreate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMLineaDeNegocio:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if payload.metadata is not None:
        body["metadata"] = payload.metadata
    try:
        row = await repo.create_linea_de_negocio(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMLineaDeNegocio.model_validate(row)


@router.patch("/productos/lineas/{linea_id}", response_model=CRMLineaDeNegocio)
async def update_product_linea(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    linea_id: UUID,
    payload: CRMLineaDeNegocioUpdate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMLineaDeNegocio:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    try:
        row = await repo.update_linea_de_negocio(
            organizacion_id=organizacion_id,
            linea_id=linea_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        detail, status_code = _map_delete_exception(
            exc,
            not_found_key="linea_not_found",
            dependency_key="linea_has_children",
            dependency_message=(
                "Esta línea todavía tiene familias/modelos/productos asociados. "
                "Elimina primero esos registros antes de borrar la línea."
            ),
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMLineaDeNegocio.model_validate(row)


@router.delete("/productos/lineas/{linea_id}", response_model=CRMLineaDeNegocio)
async def delete_product_linea(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    linea_id: UUID,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMLineaDeNegocio:
    try:
        row = await repo.delete_linea_de_negocio(
            organizacion_id=organizacion_id,
            linea_id=linea_id,
        )
    except CRMRepositoryError as exc:
        detail = "linea_not_found" if "linea_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "linea_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMLineaDeNegocio.model_validate(row)


@router.get("/productos/familias", response_model=list[CRMFamiliaProducto])
async def list_product_familias(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    include_inactive: bool = Query(default=False),
    linea_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> list[CRMFamiliaProducto]:
    try:
        rows = await repo.list_familias_productos(
            organizacion_id=organizacion_id,
            include_inactive=include_inactive,
            linea_id=linea_id,
            search=search,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMFamiliaProducto.model_validate(row) for row in rows]


@router.post(
    "/productos/familias",
    response_model=CRMFamiliaProducto,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_familia(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMFamiliaProductoCreate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMFamiliaProducto:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_familia_producto(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMFamiliaProducto.model_validate(row)


@router.patch("/productos/familias/{familia_id}", response_model=CRMFamiliaProducto)
async def update_product_familia(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    familia_id: UUID,
    payload: CRMFamiliaProductoUpdate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMFamiliaProducto:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    try:
        row = await repo.update_familia_producto(
            organizacion_id=organizacion_id,
            familia_id=familia_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        detail, status_code = _map_delete_exception(
            exc,
            not_found_key="familia_not_found",
            dependency_key="familia_has_children",
            dependency_message=(
                "La familia tiene modelos o productos asociados. Elimina primero los productos "
                "y luego los modelos antes de borrar la familia."
            ),
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMFamiliaProducto.model_validate(row)


@router.delete("/productos/familias/{familia_id}", response_model=CRMFamiliaProducto)
async def delete_product_familia(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    familia_id: UUID,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMFamiliaProducto:
    try:
        row = await repo.delete_familia_producto(
            organizacion_id=organizacion_id,
            familia_id=familia_id,
        )
    except CRMRepositoryError as exc:
        detail = "familia_not_found" if "familia_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "familia_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMFamiliaProducto.model_validate(row)


@router.get("/productos/modelos", response_model=list[CRMModeloProducto])
async def list_product_modelos(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None, max_length=200),
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> list[CRMModeloProducto]:
    try:
        rows = await repo.list_modelos_productos(
            organizacion_id=organizacion_id,
            include_inactive=include_inactive,
            search=search,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMModeloProducto.model_validate(row) for row in rows]


@router.post(
    "/productos/modelos",
    response_model=CRMModeloProducto,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_modelo(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMModeloProductoCreate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMModeloProducto:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_modelo_producto(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMModeloProducto.model_validate(row)


@router.patch("/productos/modelos/{modelo_id}", response_model=CRMModeloProducto)
async def update_product_modelo(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    modelo_id: UUID,
    payload: CRMModeloProductoUpdate,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMModeloProducto:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    try:
        row = await repo.update_modelo_producto(
            organizacion_id=organizacion_id,
            modelo_id=modelo_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        detail, status_code = _map_delete_exception(
            exc,
            not_found_key="modelo_not_found",
            dependency_key="modelo_has_children",
            dependency_message=(
                "El modelo tiene productos asociados. Elimina primero los productos antes "
                "de borrar el modelo."
            ),
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMModeloProducto.model_validate(row)


@router.delete("/productos/modelos/{modelo_id}", response_model=CRMModeloProducto)
async def delete_product_modelo(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    modelo_id: UUID,
    background_tasks: BackgroundTasks,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> CRMModeloProducto:
    try:
        row = await repo.delete_modelo_producto(
            organizacion_id=organizacion_id,
            modelo_id=modelo_id,
        )
    except CRMRepositoryError as exc:
        detail = "modelo_not_found" if "modelo_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "modelo_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    _trigger_catalog_reindex(
        background_tasks,
        row.get("organizacion_id"),
        usuario_id=usuario_id,
        canal="panel",
    )
    return CRMModeloProducto.model_validate(row)


@router.get(
    "/productos/importador/schemes",
    response_model=list[CRMProductMetadataScheme],
)
async def list_product_metadata_schemes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMProductMetadataScheme]:
    try:
        rows = await repo.list_product_metadata_schemes(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMProductMetadataScheme.model_validate(row) for row in rows]


@router.post(
    "/productos/importador/schemes",
    response_model=CRMProductMetadataScheme,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_metadata_scheme(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMProductMetadataSchemeCreate,
) -> CRMProductMetadataScheme:
    try:
        row = await repo.create_product_metadata_scheme(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMProductMetadataScheme.model_validate(row)


@router.patch("/productos/importador/schemes/{scheme_id}", response_model=CRMProductMetadataScheme)
async def update_product_metadata_scheme(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    scheme_id: UUID,
    payload: CRMProductMetadataSchemeUpdate,
) -> CRMProductMetadataScheme:
    if not payload.model_dump(exclude_none=True):
        raise HTTPException(status_code=400, detail="empty_update")
    try:
        row = await repo.update_product_metadata_scheme(
            organizacion_id=organizacion_id,
            scheme_id=scheme_id,
            payload=payload.model_dump(mode="json", exclude_none=True),
        )
    except CRMRepositoryError as exc:
        detail = "scheme_not_found" if "scheme_not_found" in str(exc) else str(exc)
        status_code = 404 if detail == "scheme_not_found" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return CRMProductMetadataScheme.model_validate(row)


@router.delete(
    "/productos/importador/schemes/{scheme_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_product_metadata_scheme(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    scheme_id: UUID,
) -> Response:
    try:
        await repo.delete_product_metadata_scheme(
            organizacion_id=organizacion_id,
            scheme_id=scheme_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/contacts/search", response_model=CRMContactSearchResponse)
async def search_contacts(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    query: Annotated[str, Query(min_length=2, alias="q")],
    limit: Annotated[int, Query(ge=1, le=25)] = 8,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMContactSearchResponse:
    rows = await repo.search_contacts(
        organizacion_id=organizacion_id,
        query=query,
        limit=limit,
        offset=offset,
    )
    items: list[CRMContactSearchItem] = []
    for row in rows:
        contacto_id = _safe_uuid(row.get("id"))
        if not contacto_id:
            continue
        items.append(
            CRMContactSearchItem(
                id=contacto_id,
                nombre=row.get("nombre_completo"),
                correo=row.get("correo"),
                telefono=row.get("telefono_e164"),
                empresa=row.get("company_name"),
            )
        )
    return CRMContactSearchResponse(items=items, limit=limit, offset=offset)


@router.post("/contacts", response_model=CRMContact, status_code=status.HTTP_201_CREATED)
async def create_contact(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMContactCreate,
) -> CRMContact:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_contact(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMContact.model_validate(row)


@router.patch(
    "/contacts/{contacto_id}",
    response_model=CRMContact,
)
async def update_contact(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    contacto_id: UUID,
    payload: CRMContactUpdate,
) -> CRMContact:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.update_contact(
            organizacion_id=organizacion_id,
            contacto_id=contacto_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        if "contacto_no_encontrado" in str(exc):
            raise HTTPException(status_code=404, detail="contacto_no_encontrado") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMContact.model_validate(row)


@router.delete(
    "/contacts/{contacto_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_contact(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    contacto_id: UUID,
) -> Response:
    try:
        await repo.delete_contact(
            organizacion_id=organizacion_id,
            contacto_id=contacto_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/settings/logos", response_model=CRMLogoAssetList)
async def list_settings_logos(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),  # noqa: ARG001
) -> CRMLogoAssetList:
    try:
        rows = await repo.list_logos()
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    logos: list[CRMLogoAsset] = []
    for row in rows:
        logo = _build_logo_asset(row)
        if logo:
            logos.append(logo)
    return CRMLogoAssetList(logos=logos)


@router.post("/settings/logos", response_model=CRMLogoAsset)
async def upload_settings_logo(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),
    file: UploadFile = File(...),
    nombre: Annotated[str, Form()],
    descripcion: Annotated[str | None, Form()] = None,
) -> CRMLogoAsset:
    if not file.filename:
        raise HTTPException(status_code=400, detail="logo_file_required")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="logo_invalid_type")

    try:
        upload = await storage.upload_logo_asset(file=file)
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="logo_upload_failed") from exc

    resolved_nombre = _clean_text(nombre) or (file.filename or "Logo")
    resolved_descripcion = _clean_text(descripcion)

    payload = {
        "nombre": resolved_nombre,
        "descripcion": resolved_descripcion,
        "file_path": upload["path"],
        "file_url": upload["url"],
        "metadata": {
            "mime": upload.get("mime"),
            "original_name": upload.get("name") or file.filename,
        },
        "uploaded_by": str(admin_id),
    }

    try:
        row = await repo.create_logo(payload=payload)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    logo = _build_logo_asset(row)
    if not logo:
        raise HTTPException(status_code=502, detail="logo_save_unexpected_response")
    return logo


@router.post("/settings/media/upload", response_model=CRMMediaAssetUpload)
async def upload_settings_media(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    file: UploadFile = File(...),
) -> CRMMediaAssetUpload:
    _ = usuario_id
    if not file.filename:
        raise HTTPException(status_code=400, detail="media_file_required")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="media_invalid_type")

    try:
        upload = await storage.upload_media_asset(file=file)
    except StorageError as exc:
        logger.error(
            "media_upload_failure",
            exc_info=exc,
            extra={"file": file.filename, "organizacion_id": organizacion_id},
        )
        raise HTTPException(status_code=502, detail="media_upload_failed") from exc

    return CRMMediaAssetUpload(url=upload["url"], path=upload["path"], bucket="recursos")


@router.get("/settings/email-template", response_model=CRMEmailTemplate)
async def get_email_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    slug: str = DEFAULT_TEMPLATE_SLUG,
) -> CRMEmailTemplate:
    try:
        row = await repo.get_email_template(slug=slug)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="email_template_not_found")
    return CRMEmailTemplate.model_validate(row)


@router.put("/settings/email-template", response_model=CRMEmailTemplate)
async def update_email_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    payload: CRMEmailTemplateUpdate,
    slug: str = DEFAULT_TEMPLATE_SLUG,
) -> CRMEmailTemplate:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.upsert_email_template(slug=slug, payload=body)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMEmailTemplate.model_validate(row)


@router.get("/settings/quote-template", response_model=CRMQuoteTemplate)
async def get_quote_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    slug: str = DEFAULT_QUOTE_TEMPLATE_SLUG,
) -> CRMQuoteTemplate:
    try:
        row = await repo.get_quote_template(
            slug=slug,
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="quote_template_not_found")
    return CRMQuoteTemplate.model_validate(row)


@router.put("/settings/quote-template", response_model=CRMQuoteTemplate)
async def update_quote_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    payload: CRMQuoteTemplateUpdate,
    usuario_id: UUID | None = Depends(optional_usuario_id),
    slug: str = DEFAULT_QUOTE_TEMPLATE_SLUG,
) -> CRMQuoteTemplate:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.upsert_quote_template(
            slug=slug,
            organizacion_id=organizacion_id,
            payload=body,
            updated_by=usuario_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMQuoteTemplate.model_validate(row)


@router.get("/settings/reminders", response_model=CRMReminderSettings)
async def get_reminder_settings(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    slug: str = DEFAULT_REMINDER_SLUG,
) -> CRMReminderSettings:
    try:
        row = await repo.get_calendar_settings(slug=slug)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="reminder_settings_not_found")
    return CRMReminderSettings.model_validate(row)


@router.put("/settings/reminders", response_model=CRMReminderSettings)
async def update_reminder_settings(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    payload: CRMReminderSettingsUpdate,
    slug: str = DEFAULT_REMINDER_SLUG,
) -> CRMReminderSettings:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.upsert_calendar_settings(slug=slug, payload=body)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMReminderSettings.model_validate(row)


@router.get("/contacts/summary", response_model=CRMContactSummary)
async def get_contacts_summary(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> CRMContactSummary:
    try:
        row = await repo.contactos_resumen(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMContactSummary.model_validate(row)


@router.get("/contacts/timeline", response_model=list[CRMContactTimelineEntry])
async def get_contacts_timeline(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> list[CRMContactTimelineEntry]:
    try:
        rows = await repo.contactos_timeline(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMContactTimelineEntry.model_validate(row) for row in rows]


@router.get("/contacts/list", response_model=list[CRMContactListRow])
async def get_contacts_list(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=1, le=500)] = DEFAULT_CONTACTS_LIMIT,
) -> list[CRMContactListRow]:
    try:
        rows = await repo.contactos_list(usuario_token=user_token, limit=limit)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMContactListRow.model_validate(row) for row in rows]


@router.get("/inbox/summary", response_model=CRMInboxSummary)
async def get_inbox_summary(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> CRMInboxSummary:
    row = await repo.inbox_summary(usuario_token=user_token)
    folders_payload = row.get("folders") if isinstance(row, dict) else None
    folders: list[CRMInboxFolder] = []
    if isinstance(folders_payload, list):
        for entry in folders_payload:
            if isinstance(entry, dict) and entry.get("id"):
                folders.append(
                    CRMInboxFolder(
                        id=str(entry.get("id")),
                        label=entry.get("label"),
                        count=int(entry.get("count") or 0),
                    )
                )
    return CRMInboxSummary(
        total=int(row.get("total") or 0),
        unread=int(row.get("unread") or 0),
        awaiting=int(row.get("awaiting") or 0),
        folders=folders,
    )


@router.get("/inbox/threads", response_model=list[CRMInboxThread])
async def get_inbox_threads(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    estado: str | None = Query(default=None, max_length=50),
    asignado_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
    message_limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[CRMInboxThread]:
    rows = await repo.inbox_threads(
        usuario_token=user_token,
        estado=estado,
        asignado_id=asignado_id,
        limit=limit,
        offset=offset,
        message_limit=message_limit,
    )
    return [CRMInboxThread.model_validate(row) for row in rows]


@router.get("/inbox/messages/{conversacion_id}", response_model=list[CRMInboxMessage])
async def get_inbox_messages(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    conversacion_id: UUID,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    before: str | None = Query(default=None, max_length=64),
) -> list[CRMInboxMessage]:
    rows = await repo.inbox_messages(
        usuario_token=user_token,
        conversacion_id=conversacion_id,
        limit=limit,
        before=before,
    )
    return [CRMInboxMessage.model_validate(row) for row in rows]


@router.post("/inbox/conversations/{conversacion_id}/manual")
async def set_inbox_manual_mode(
    *,
    user_token: str = Depends(require_user_token),  # noqa: ARG001
    conversacion_id: UUID,
    payload: ManualOverridePayload,
) -> dict[str, Any]:
    try:
        await storage.set_manual_override(str(conversacion_id), payload.manual)
    except StorageError as exc:
        detail = str(exc) or "No se pudo actualizar el modo manual"
        lowered = detail.lower()
        status_code = 502 if ("error de red" in lowered or "respondió error" in lowered) else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return {"ok": True, "manual": payload.manual}


@router.post("/inbox/conversations/{conversacion_id}/reply")
async def reply_inbox_conversation(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    conversacion_id: UUID,
    payload: ConversationReplyPayload,
) -> dict[str, Any]:
    content = (payload.content or "").strip()
    attachments_payload = [
        attachment.model_dump(mode="json") for attachment in (payload.attachments or [])
    ]
    if not content and not attachments_payload:
        raise HTTPException(status_code=422, detail="message_required")

    try:
        conversation_meta = await storage.fetch_webchat_conversation(str(conversacion_id))
    except StorageError as exc:
        message = str(exc)
        lowered = message.lower()
        log_extra = {"conversation_id": str(conversacion_id), "error": message}
        if "no encontrada" in lowered or "not found" in lowered:
            logger.warning("panel.inbox.conversation_not_found", extra=log_extra)
            raise HTTPException(status_code=404, detail="conversation_not_found") from exc
        logger.exception("panel.inbox.fetch_conversation_failed", extra=log_extra)
        raise HTTPException(status_code=502, detail="No se pudo recuperar la conversación") from exc

    channel = (conversation_meta.get("channel") or "").lower()

    contact_id = conversation_meta.get("contact_id")
    if channel not in {"webchat", "whatsapp"}:
        raise HTTPException(status_code=400, detail="unsupported_channel")
    if not contact_id:
        raise HTTPException(status_code=500, detail="conversation_contact_missing")

    session_id: str | None = None
    message_payload: webchat_schemas.MessageRequest | None = None
    if channel == "webchat":
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
    else:
        client_message_id = payload.client_message_id or uuid4().hex

    manual_override = bool(conversation_meta.get("manual_override"))
    if not manual_override:
        try:
            manual_override = await storage.get_manual_override(str(conversacion_id))
        except StorageError as exc:
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
            "channel": channel,
        }
        if payload.locale:
            extra_metadata["locale"] = payload.locale
        manual_user_id = _jwt_verify_and_sub(user_token)
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

        profile = await _fetch_panel_user_profile(repo, manual_user_id)

        if profile:
            if manual_name is None:
                profile_name = _clean_text(profile.get("nombre_completo")) or _clean_text(
                    profile.get("correo")
                )
                if profile_name:
                    manual_name = profile_name
            if manual_email is None:
                profile_email = _clean_text(profile.get("correo"))
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

        if channel == "whatsapp" and attachments_payload:
            raise HTTPException(status_code=415, detail="attachments_not_supported")

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

        contact_org_id: str | None = None
        if str(contact_id).strip():
            try:
                contact_row = await storage.fetch_contact(str(contact_id))
            except StorageError as exc:
                logger.warning(
                    "panel.inbox.contact_lookup_failed",
                    extra={"contact_id": str(contact_id), "error": str(exc)},
                )
            else:
                org_value = contact_row.get("organizacion_id") if isinstance(contact_row, dict) else None
                if org_value:
                    try:
                        contact_org_id = str(org_value).strip() or None
                    except Exception:  # pragma: no cover - str conversion defensiva
                        contact_org_id = None

        if channel == "webchat":
            try:
                await storage.register_webchat_message(
                    session_id=session_id or "",
                    author="agent",
                    content=content,
                    inactivity_hours=settings.webchat_inactivity_hours,
                    metadata=extra_metadata,
                    attachments=attachments_payload,
                    organizacion_id=contact_org_id,
                )
            except StorageError as exc:
                logger.exception(
                    "panel.inbox.manual_register_failed",
                    extra={"conversation_id": str(conversacion_id), "error": str(exc)},
                )
                raise HTTPException(
                    status_code=502, detail="No se pudo registrar el mensaje"
                ) from exc

            try:
                await webchat_service.append_manual_agent_context(
                    conversation_meta=conversation_meta,
                    session_id=session_id or "",
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

        if channel == "whatsapp":
            metadata = await _send_manual_whatsapp_message(
                conversation_id=str(conversacion_id),
                contact_id=str(contact_id),
                content=content,
                metadata=extra_metadata,
            )
            return {
                "ok": True,
                "reply": None,
                "metadata": metadata,
            }

        raise HTTPException(status_code=400, detail="unsupported_channel")

    if channel != "webchat":
        raise HTTPException(status_code=400, detail="unsupported_channel")

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


@router.post("/inbox/conversations/{conversacion_id}/attachments")
async def upload_inbox_attachment(
    *,
    user_token: str = Depends(require_user_token),  # noqa: ARG001
    conversacion_id: UUID,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    try:
        conversation_meta = await storage.fetch_webchat_conversation(str(conversacion_id))
    except StorageError as exc:
        logger.exception(
            "panel.inbox.fetch_conversation_failed",
            extra={"conversation_id": str(conversacion_id), "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="conversation_lookup_failed") from exc

    channel = (conversation_meta.get("channel") or "").lower()
    if channel != "webchat":
        raise HTTPException(status_code=400, detail="unsupported_channel")

    contact_id = conversation_meta.get("contact_id")
    session_id = None
    if contact_id:
        session_id = await _resolve_webchat_session_id(str(contact_id))

    try:
        uploaded = await storage.upload_webchat_attachment(
            file=file,
            session_id=session_id,
            conversation_id=str(conversacion_id),
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="upload_failed") from exc

    return {"ok": True, "attachment": uploaded}


def _stringify_uuid(value: UUID | str | None) -> str | None:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return None


def _extract_opportunity_contact_id(opportunity: dict[str, Any] | None) -> UUID | None:
    if not isinstance(opportunity, dict):
        return None
    for key in ("contacto_principal_id", "contacto_id"):
        candidate = _safe_uuid(opportunity.get(key))
        if candidate:
            return candidate
    contact = opportunity.get("contacto")
    if isinstance(contact, dict):
        candidate = _safe_uuid(contact.get("id"))
        if candidate:
            return candidate
    return None


def _extract_opportunity_conversation_id(opportunity: dict[str, Any] | None) -> str | None:
    if not isinstance(opportunity, dict):
        return None
    metadata = _ensure_dict(opportunity.get("metadata"), default={})
    for key in ("conversation_id", "conversacion_id"):
        value = metadata.get(key)
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed:
                return trimmed
    return None


def _extract_opportunity_assignment_id(opportunity: dict[str, Any] | None) -> UUID | None:
    if not isinstance(opportunity, dict):
        return None
    for key in ("asignado_a_usuario_id", "propietario_usuario_id"):
        candidate = _safe_uuid(opportunity.get(key))
        if candidate:
            return candidate
    asignado = opportunity.get("asignado")
    if isinstance(asignado, dict):
        candidate = _safe_uuid(asignado.get("id"))
        if candidate:
            return candidate
    propietario = opportunity.get("propietario")
    if isinstance(propietario, dict):
        candidate = _safe_uuid(propietario.get("id"))
        if candidate:
            return candidate
    return None


def _resolve_conversation_channel(
    preferred: str | None,
    opportunity: dict[str, Any] | None,
) -> str:
    candidates: list[str | None] = [preferred]
    if isinstance(opportunity, dict):
        candidates.append(opportunity.get("canal"))
        metadata = _ensure_dict(opportunity.get("metadata"), default={})
        candidates.append(metadata.get("channel"))
        candidates.append(metadata.get("canal"))
    for candidate in candidates:
        if isinstance(candidate, str):
            trimmed = candidate.strip()
            if trimmed:
                return trimmed
    return "manual"


async def _persist_opportunity_conversation_metadata(
    *,
    repo: CRMRepository,
    opportunity: dict[str, Any] | None,
    conversation_id: str,
) -> None:
    if not isinstance(opportunity, dict):
        return
    org_uuid = _safe_uuid(opportunity.get("organizacion_id"))
    opp_uuid = _safe_uuid(opportunity.get("id"))
    if not org_uuid or not opp_uuid:
        return
    metadata = _ensure_dict(opportunity.get("metadata"), default={})
    existing = metadata.get("conversation_id")
    if isinstance(existing, str) and existing.strip() == conversation_id:
        return
    metadata["conversation_id"] = conversation_id
    if "conversacion_id" in metadata:
        metadata["conversacion_id"] = conversation_id
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "agenda.booking.metadata_patch_failed",
            extra={
                "oportunidad_id": str(opp_uuid),
                "error": str(exc),
            },
        )


@router.get("/agenda/bookings")
async def list_agenda_bookings(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    rango: str | None = Query(default=None),
    fecha_desde: str | None = Query(default=None, alias="from"),
    fecha_hasta: str | None = Query(default=None, alias="to"),
    estado: list[str] | None = Query(default=None),
    assigned: list[str] | None = Query(default=None),
    provider: list[str] | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    cursor: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
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
        empty_metrics = {
            "total": 0,
            "activas": 0,
            "proximas24h": 0,
            "canceladas": 0,
            "realizadas": 0,
        }
        return {
            "ok": True,
            "items": [],
            "metrics": empty_metrics,
            "total": 0,
            "limit": limit,
            "offset": offset,
            "has_more": False,
        }

    try:
        raw, total = await repo.list_agenda_bookings(
            usuario_token=user_token,
            params=params,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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


@router.post("/agenda/bookings")
async def create_agenda_booking(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),  # noqa: ARG001
    payload: AgendaBookingCreatePayload,
) -> dict[str, Any]:
    if (
        payload.conversation_id is None
        and payload.contacto_id is None
        and payload.oportunidad_id is None
    ):
        raise HTTPException(status_code=400, detail="identificadores_requeridos")

    start_dt = _parse_datetime_input(payload.start_at, field="start_at")

    opportunity_row: dict[str, Any] | None = None
    if payload.oportunidad_id:
        try:
            opportunity_row = await repo.get_pipeline_opportunity_by_id(
                oportunidad_id=payload.oportunidad_id,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if opportunity_row is None:
            raise HTTPException(status_code=404, detail="oportunidad_no_encontrada")

    conversation_id = _stringify_uuid(payload.conversation_id)
    contact_uuid = payload.contacto_id

    if opportunity_row:
        if contact_uuid is None:
            contact_uuid = _extract_opportunity_contact_id(opportunity_row)
        if conversation_id is None:
            conversation_id = _extract_opportunity_conversation_id(opportunity_row)

    if conversation_id is None and contact_uuid is None:
        raise HTTPException(status_code=400, detail="contacto_id_requerido")

    if conversation_id is None and contact_uuid is not None:
        try:
            existing_conversation = await repo.get_latest_conversation_for_contact(
                contacto_id=contact_uuid,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if existing_conversation:
            conversation_id = _stringify_uuid(existing_conversation.get("id"))

    if conversation_id is None and contact_uuid is not None:
        assigned_uuid = _extract_opportunity_assignment_id(opportunity_row)
        channel_value = _resolve_conversation_channel(payload.canal, opportunity_row)
        try:
            created_conversation = await repo.create_conversation(
                contacto_id=contact_uuid,
                canal=channel_value,
                estado="abierta",
                asignado_a_usuario_id=assigned_uuid,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        conversation_id = _stringify_uuid(created_conversation.get("id"))

    if conversation_id is None:
        raise HTTPException(status_code=400, detail="conversation_id_requerido")

    if opportunity_row:
        await _persist_opportunity_conversation_metadata(
            repo=repo,
            opportunity=opportunity_row,
            conversation_id=conversation_id,
        )

    try:
        booking = await webchat_service.schedule_calendar_booking(
            conversation_id=conversation_id,
            slot_id=None,
            start_at=start_dt,
            notes=payload.notes,
            session_id=payload.session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "booking": booking}


@router.get("/agenda/availability")
async def get_agenda_availability(
    *,
    user_token: str = Depends(require_user_token),  # noqa: ARG001
    resource_id: str | None = Query(default=None),
    fecha_desde: str | None = Query(default=None, alias="from"),
    fecha_hasta: str | None = Query(default=None, alias="to"),
    timezone_hint: str | None = Query(default=None, alias="timezone"),
    max_days: Annotated[int, Query(ge=1, le=60)] = 14,
) -> dict[str, Any]:
    calendar_resource = resource_id or settings.webchat_calendar_resource_id
    if not calendar_resource:
        raise HTTPException(status_code=400, detail="calendar_resource_missing")

    today = datetime.now(timezone.utc).date()
    if fecha_desde:
        start_date = _parse_date_value(fecha_desde, field="from")
        if not start_date:
            raise HTTPException(status_code=400, detail="from_invalid")
        start_day = start_date.date()
    else:
        start_day = today
    if fecha_hasta:
        end_date_parsed = _parse_date_value(fecha_hasta, field="to")
        if not end_date_parsed:
            raise HTTPException(status_code=400, detail="to_invalid")
        end_day = end_date_parsed.date()
    else:
        end_day = start_day + timedelta(days=max_days)

    if start_day > end_day:
        raise HTTPException(status_code=400, detail="range_invalid")

    allowed_span = timedelta(days=min(max_days, 60))
    if end_day - start_day > allowed_span:
        end_day = start_day + allowed_span

    tz_hint = (timezone_hint or settings.webchat_calendar_timezone or "UTC").strip()
    try:
        payload = await calendar_service.list_slots(
            resource_id=calendar_resource,
            start_date=start_day,
            end_date=end_day,
            timezone_hint=tz_hint,
            max_days=min(max_days, 60),
        )
    except CalendarError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "availability": payload}


@router.post("/agenda/bookings/{booking_id}/reschedule")
async def reschedule_agenda_booking(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    booking_id: UUID,
    payload: AgendaReschedulePayload,
) -> dict[str, Any]:
    try:
        booking_row = await repo.get_calendar_booking(
            usuario_token=user_token,
            booking_id=booking_id,
        )
    except CRMRepositoryError as exc:
        if "booking_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="booking_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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
async def cancel_agenda_booking(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    booking_id: UUID,
    payload: AgendaCancelPayload,
) -> dict[str, Any]:
    try:
        booking_row = await repo.get_calendar_booking(
            usuario_token=user_token,
            booking_id=booking_id,
        )
    except CRMRepositoryError as exc:
        if "booking_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="booking_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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


@router.get("/oportunidades/{oportunidad_id}/cliente")
async def obtener_cliente_de_oportunidad(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    oportunidad_id: UUID,
) -> dict[str, Any]:
    cliente = await repo.get_cliente_por_oportunidad(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        oportunidad_id=oportunidad_id,
    )
    return {"ok": True, "cliente": cliente}


@router.post("/oportunidades/{oportunidad_id}/convertir")
async def convertir_oportunidad_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    oportunidad_id: UUID,
    payload: LeadConversionPayload,
) -> dict[str, Any]:
    oportunidad_row = await repo.get_opportunity_with_contact(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if oportunidad_row is None:
        raise HTTPException(status_code=404, detail="oportunidad_no_encontrada")
    cuenta_id = _safe_uuid(oportunidad_row.get("cuenta_id"))
    if cuenta_id is None:
        cuenta_id, oportunidad_row = await _ensure_oportunidad_cuenta(
            repo=repo,
            organizacion_id=organizacion_id,
            oportunidad_row=oportunidad_row,
        )
    await repo.convert_oportunidad_en_cliente(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        oportunidad_id=oportunidad_id,
        forzar=payload.forzar,
    )
    cliente = await repo.get_cliente_por_oportunidad(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        oportunidad_id=oportunidad_id,
    )
    return {"ok": True, "cliente": cliente}


@router.get(
    "/oportunidades/{oportunidad_id}/quotes",
    response_model=LeadQuoteListResponse,
)
async def list_lead_quotes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> LeadQuoteListResponse:
    try:
        rows = await repo.list_quote_entries(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    quotes = []
    for row in rows:
        if isinstance(row, dict):
            quotes.append(_quote_from_row(row))
    return LeadQuoteListResponse(quotes=quotes)


@router.post(
    "/oportunidades/{oportunidad_id}/quotes",
    response_model=LeadQuoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lead_quote(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
    payload: LeadQuoteCreatePayload,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> LeadQuoteResponse:
    opportunity = await repo.get_opportunity_with_contact(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if opportunity is None:
        raise HTTPException(status_code=404, detail="oportunidad_no_encontrada")
    body = _quote_payload_from_body(payload)
    metadata = _quote_metadata_from_payload(body)
    repo_items = _quote_items_to_repository_payload(body.pop("items", None))
    try:
        created_row = await repo.create_quote_entry(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            cuenta_id=_safe_uuid(opportunity.get("cuenta_id")),
            contacto_id=_safe_uuid(opportunity.get("contacto_principal_id")),
            estatus=body.pop("estado", None) or body.pop("estatus", None) or "borrador",
            total=_as_number(body.get("total")),
            moneda=(body.get("moneda") or "MXN").upper(),
            valida_hasta=_to_iso_date(body.get("valido_hasta")),
            metadata=metadata,
            items=repo_items,
            usuario_id=usuario_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    quote = _quote_from_row(created_row)
    return LeadQuoteResponse(quote=quote)


@router.post(
    "/oportunidades/{oportunidad_id}/quotes/send",
    response_model=LeadQuoteResponse,
)
async def send_lead_quote(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
    payload: LeadQuoteSendPayload,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> LeadQuoteResponse:
    oportunidad_row = await repo.get_opportunity_with_contact(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if oportunidad_row is None:
        raise HTTPException(status_code=404, detail="oportunidad_no_encontrada")

    contact = _single_related(oportunidad_row.get("contacto")) or {}
    cuenta = _single_related(oportunidad_row.get("cuenta")) or {}
    oportunidad_metadata = _ensure_dict(oportunidad_row.get("metadata"), default={})
    lead_label = (
        oportunidad_row.get("titulo")
        or contact.get("nombre_completo")
        or cuenta.get("nombre")
        or "Oportunidad sin nombre"
    )
    currency = payload.moneda or oportunidad_row.get("moneda") or "MXN"
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
        lead_label=lead_label,
        reference=str(oportunidad_id).split("-")[0],
        issuer_name=settings.mail_username or "Tal-IA",
        issuer_email=settings.mail_username,
        contact_name=_clean_text(contact.get("nombre_completo")),
        contact_company=_clean_text(contact.get("company_name")),
        contact_email=_clean_text(contact.get("correo")),
        contact_phone=_clean_text(contact.get("telefono_e164")),
        conceptos=conceptos_context,
        subtotal=base_payload.subtotal,
        impuestos=base_payload.impuestos,
        total=base_payload.total,
        moneda=currency,
        valido_hasta=base_payload.valido_hasta,
        descripcion=base_payload.descripcion or base_payload.titulo,
        notes=oportunidad_metadata.get("proyecto_necesidades")
        or contact.get("necesidad_proposito"),
        items=normalized_items,
        economic_details_html=payload.detalles_propuesta_html,
    )

    pdf_doc = await quotes_service.render_quote_pdf(quote_context)
    try:
        upload = await storage.upload_quote_document(
            content=pdf_doc.content,
            filename=pdf_doc.filename,
            lead_id=str(oportunidad_id),
            content_type="application/pdf",
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="quote_upload_failed") from exc

    create_payload = _quote_payload_from_body(base_payload)
    create_payload["pdf_url"] = upload["url"]
    create_payload["pdf_path"] = upload["path"]
    metadata = _quote_metadata_from_payload(create_payload)
    repo_items = _quote_items_to_repository_payload(create_payload.pop("items", None))
    try:
        created_row = await repo.create_quote_entry(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            cuenta_id=_safe_uuid(oportunidad_row.get("cuenta_id")),
            contacto_id=_safe_uuid(oportunidad_row.get("contacto_principal_id")),
            estatus=create_payload.pop("estado", None)
            or create_payload.pop("estatus", None)
            or "borrador",
            total=_as_number(create_payload.get("total")),
            moneda=(create_payload.get("moneda") or currency).upper(),
            valida_hasta=_to_iso_date(create_payload.get("valido_hasta")),
            metadata=metadata,
            items=repo_items,
            usuario_id=usuario_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    quote_id_value = created_row.get("id")
    if not quote_id_value:
        raise HTTPException(status_code=502, detail="quote_create_missing_id")
    quote_uuid = UUID(str(quote_id_value))

    channel = payload.channel
    if channel == "email":
        recipients = _resolve_email_recipients(contact, payload.email_to)
        if not recipients:
            raise HTTPException(status_code=400, detail="quote_email_missing_recipient")
        subject = payload.subject or quotes_service.compose_email_subject(quote_context)
        body_text = quotes_service.compose_email_body(quote_context, payload.message)
        try:
            await asyncio.to_thread(
                send_email,
                subject=subject,
                body_text=body_text,
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
        body_text = quotes_service.compose_whatsapp_body(quote_context, payload.message)
        try:
            await quotes_service.send_whatsapp_message(
                to_number=whatsapp_number,
                body=body_text,
                media_url=upload["url"],
            )
        except quotes_service.QuoteSendError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        extra_data = _quote_mark_extra({"whatsapp_to": whatsapp_number})

    metadata_patch = dict(extra_data)
    metadata_patch["canal_envio"] = channel
    metadata_patch["enviada_en"] = datetime.now(timezone.utc).isoformat()
    if usuario_id:
        metadata_patch["enviada_por"] = str(usuario_id)
    try:
        quote_row = await repo.mark_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=quote_uuid,
            estatus="enviada",
            metadata_patch=metadata_patch,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    quote = _quote_from_row(quote_row)
    if quote.estado == "aceptada":
        await _auto_move_opportunity_to_won(
            repo=repo,
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            oportunidad_row=oportunidad_row,
            quote=quote,
        )
    return LeadQuoteResponse(quote=quote)


@router.get(
    "/quotes/{quote_id}/pdf",
    response_model=QuoteSignedUrlResponse,
)
async def get_quote_pdf_signed_url(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    quote_id: UUID,
    expires_in: int = Query(300, ge=30, le=3600),
) -> QuoteSignedUrlResponse:
    try:
        row = await repo.get_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=quote_id,
        )
    except CRMRepositoryError:
        raise HTTPException(status_code=404, detail="quote_not_found") from None

    metadata = _ensure_dict(row.get("metadata"), default={})
    pdf_path = (
        metadata.get("pdf_path")
        or metadata.get("pdfPath")
        or row.get("pdf_path")
    )
    if not isinstance(pdf_path, str) or not pdf_path.strip():
        raise HTTPException(status_code=404, detail="quote_pdf_not_found")

    try:
        signed_url = await storage.generate_quote_signed_url(
            path=pdf_path,
            expires_in=expires_in,
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="quote_pdf_link_failed") from exc

    return QuoteSignedUrlResponse(url=signed_url, expires_in=expires_in)


@router.post("/cotizaciones/{cotizacion_id}/mark", response_model=LeadQuoteResponse)
async def mark_lead_quote(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cotizacion_id: UUID,
    payload: LeadQuoteMarkPayload,
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> LeadQuoteResponse:
    extra = _quote_extra_payload(payload)
    extra["canal_envio"] = payload.canal
    extra["marcada_en"] = datetime.now(timezone.utc).isoformat()
    if usuario_id:
        extra["marcada_por"] = str(usuario_id)
    try:
        quote_row = await repo.mark_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=cotizacion_id,
            estatus=payload.estado,
            metadata_patch=extra,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    quote = _quote_from_row(quote_row)
    if quote.estado == "aceptada":
        oportunidad_id = quote.oportunidad_id
        if oportunidad_id:
            await _auto_move_opportunity_to_won(
                repo=repo,
                organizacion_id=organizacion_id,
                oportunidad_id=UUID(str(oportunidad_id)),
                quote=quote,
            )
    return LeadQuoteResponse(quote=quote)


@router.patch("/clientes/{cliente_id}")
async def actualizar_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    payload: ClienteFiscalUpdatePayload,
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return {"ok": True, "cliente": None}
    cliente = await repo.update_cliente(
        cliente_id=cliente_id,
        payload=updates,
        usuario_token=user_token,
    )
    if cliente is None:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    return {"ok": True, "cliente": cliente}


@router.post("/clientes/{cliente_id}/documentos")
async def registrar_documento_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    payload: ClienteDocumentoPayload,
) -> dict[str, Any]:
    cliente = await repo.get_cliente_por_id(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        cliente_id=cliente_id,
    )
    if cliente is None:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    body = payload.model_dump(exclude_none=True)
    body["cliente_id"] = str(cliente_id)
    body.setdefault("estado", ClienteDocumentoEstado.PENDIENTE.value)
    user_id = _jwt_verify_and_sub(user_token)
    if user_id:
        body.setdefault("cargado_por", user_id)
    body.update(_cliente_context(cliente))
    documento = await repo.create_cliente_document(
        payload=body,
        usuario_token=user_token,
    )
    return {"ok": True, "documento": documento}


@router.post("/clientes/{cliente_id}/documentos/upload")
async def subir_documento_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    tipo: ClienteDocumentoTipo = Form(...),
    descripcion: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    cliente = await repo.get_cliente_por_id(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        cliente_id=cliente_id,
    )
    if cliente is None:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    try:
        upload = await storage.upload_cliente_document(
            file=file,
            cliente_id=str(cliente_id),
            document_type=tipo.value,
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="document_upload_failed") from exc

    user_id = _jwt_verify_and_sub(user_token)
    body: dict[str, Any] = {
        "cliente_id": str(cliente_id),
        "tipo": tipo.value,
        "estado": ClienteDocumentoEstado.RECIBIDO.value,
        "descripcion": descripcion,
        "storage_path": upload.get("path"),
        "storage_url": upload.get("url"),
        "metadatos": {
            "nombre": upload.get("name"),
            "mime": upload.get("mime"),
            "size": upload.get("size"),
        },
    }
    if user_id:
        body["cargado_por"] = user_id
    body.update(_cliente_context(cliente))

    documento = await repo.create_cliente_document(
        payload=body,
        usuario_token=user_token,
    )
    return {"ok": True, "documento": documento}


@router.patch("/clientes/{cliente_id}/documentos/{documento_id}")
async def actualizar_documento_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    documento_id: UUID,
    payload: ClienteDocumentoUpdatePayload,
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return {"ok": True, "documento": None}
    user_id = _jwt_verify_and_sub(user_token)
    if updates.get("estado") == ClienteDocumentoEstado.VALIDADO.value and user_id:
        updates.setdefault("validado_por", user_id)
        updates.setdefault("validado_en", datetime.now(timezone.utc).isoformat())
    documento = await repo.update_cliente_document(
        cliente_id=cliente_id,
        documento_id=documento_id,
        payload=updates,
        usuario_token=user_token,
    )
    return {"ok": True, "documento": documento}


@router.post("/clientes/{cliente_id}/responsables")
async def crear_responsable_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    payload: ClienteResponsablePayload,
) -> dict[str, Any]:
    body = payload.model_dump(exclude_none=True)
    body["cliente_id"] = str(cliente_id)
    responsable = await repo.create_cliente_responsable(
        payload=body,
        usuario_token=user_token,
    )
    return {"ok": True, "responsable": responsable}


@router.patch("/clientes/{cliente_id}/responsables/{responsable_id}")
async def actualizar_responsable_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    responsable_id: UUID,
    payload: ClienteResponsableUpdatePayload,
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return {"ok": True, "responsable": None}
    responsable = await repo.update_cliente_responsable(
        cliente_id=cliente_id,
        responsable_id=responsable_id,
        payload=updates,
        usuario_token=user_token,
    )
    return {"ok": True, "responsable": responsable}


@router.post("/clientes/{cliente_id}/portal-links")
async def crear_link_portal_cliente(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    cliente_id: UUID,
    payload: ClientePortalLinkPayload,
) -> dict[str, Any]:
    cliente_data = await repo.get_cliente_por_id(
        organizacion_id=organizacion_id,
        usuario_token=user_token,
        cliente_id=cliente_id,
    )
    if cliente_data is None:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    portal_token = secrets.token_urlsafe(32)
    expira = payload.expira_en or _portal_default_expiration()
    user_id = _jwt_verify_and_sub(user_token)
    body: dict[str, Any] = {
        "cliente_id": str(cliente_id),
        "token": portal_token,
        "expira_en": _serialize_datetime(expira),
        "nota": payload.nota,
        "metadata": payload.metadatos or {},
    }
    if user_id:
        body["creado_por"] = user_id
    body.update(_cliente_context(cliente_data))

    registro = await repo.create_portal_token(
        usuario_token=user_token,
        payload=body,
    )
    link = _build_portal_link(portal_token)
    email_summary: dict[str, Any] = {
        "attempted": payload.enviar_correo,
        "sent": False,
        "recipients": [],
    }
    if payload.enviar_correo:
        recipients = _resolve_portal_email_recipients(payload, cliente_data)
        if recipients:
            subject = payload.correo_asunto or _portal_email_subject(cliente_data)
            body_text = _portal_email_body(cliente_data, link, payload.correo_mensaje)
            try:
                await asyncio.to_thread(
                    send_email,
                    subject=subject,
                    body_text=body_text,
                    recipients=recipients,
                )
                email_summary.update({"sent": True, "recipients": recipients, "subject": subject})
            except EmailSendError as exc:
                raise HTTPException(status_code=502, detail="portal_email_send_failed") from exc
        else:
            email_summary["reason"] = "missing_recipient"

    return {
        "ok": True,
        "link": link,
        "token": portal_token,
        "registro": _sanitize_portal_session(registro),
        "email": email_summary,
    }


@router.get("/portal/clientes/{portal_token}")
async def portal_cliente_estado(
    portal_token: str,
    request: Request,
    repo: CRMRepository = Depends(get_repository),
) -> dict[str, Any]:
    session = await _resolve_portal_session(
        repo=repo,
        portal_token=portal_token,
        request=request,
        include_relations=True,
    )
    cliente = session.get("cliente")
    if not cliente:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    return {
        "ok": True,
        "portal": _sanitize_portal_session(session),
        "cliente": cliente,
        "documentos_requeridos": PORTAL_DOCUMENT_REQUIREMENTS,
    }


@router.patch("/portal/clientes/{portal_token}/fiscales")
async def portal_actualizar_cliente(
    portal_token: str,
    payload: ClienteFiscalUpdatePayload,
    request: Request,
    repo: CRMRepository = Depends(get_repository),
) -> dict[str, Any]:
    session = await _resolve_portal_session(
        repo=repo,
        portal_token=portal_token,
        request=request,
        include_relations=False,
    )
    cliente_ref = session.get("cliente") or {}
    cliente_id = cliente_ref.get("id")
    if not cliente_id:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await repo.update_cliente(
            cliente_id=UUID(str(cliente_id)),
            payload=updates,
            usuario_token=None,
        )
    refreshed = await repo.get_cliente_por_id_service(cliente_id=UUID(str(cliente_id)))
    return {"ok": True, "cliente": refreshed}


@router.post("/portal/clientes/{portal_token}/documentos/upload")
async def portal_subir_documento_cliente(
    portal_token: str,
    request: Request,
    repo: CRMRepository = Depends(get_repository),
    tipo: ClienteDocumentoTipo = Form(...),
    descripcion: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    session = await _resolve_portal_session(
        repo=repo,
        portal_token=portal_token,
        request=request,
        include_relations=False,
    )
    cliente_ref = session.get("cliente") or {}
    cliente_id = cliente_ref.get("id")
    if not cliente_id:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    try:
        upload = await storage.upload_cliente_document(
            file=file,
            cliente_id=str(cliente_id),
            document_type=tipo.value,
        )
    except StorageError as exc:
        raise HTTPException(status_code=502, detail="document_upload_failed") from exc

    body: dict[str, Any] = {
        "cliente_id": str(cliente_id),
        "tipo": tipo.value,
        "estado": ClienteDocumentoEstado.RECIBIDO.value,
        "descripcion": descripcion,
        "storage_path": upload.get("path"),
        "storage_url": upload.get("url"),
        "metadatos": {
            "nombre": upload.get("name"),
            "mime": upload.get("mime"),
            "size": upload.get("size"),
            "fuente": "portal_cliente",
            "portal_token_id": session.get("id"),
        },
    }
    body.update(_portal_session_context(session))
    documento = await repo.create_cliente_document(
        payload=body,
        usuario_token=None,
    )
    return {"ok": True, "documento": documento}


@router.post("/portal/clientes/{portal_token}/responsables")
async def portal_agregar_responsable(
    portal_token: str,
    payload: ClienteResponsablePayload,
    request: Request,
    repo: CRMRepository = Depends(get_repository),
) -> dict[str, Any]:
    session = await _resolve_portal_session(
        repo=repo,
        portal_token=portal_token,
        request=request,
        include_relations=False,
    )
    cliente_ref = session.get("cliente") or {}
    cliente_id = cliente_ref.get("id")
    if not cliente_id:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    body = payload.model_dump(exclude_none=True)
    body["cliente_id"] = str(cliente_id)
    body.setdefault("metadatos", {})
    body["metadatos"]["fuente"] = "portal_cliente"
    body.update(_portal_session_context(session))
    responsable = await repo.create_cliente_responsable(
        payload=body,
        usuario_token=None,
    )
    return {"ok": True, "responsable": responsable}


@router.patch("/portal/clientes/{portal_token}/responsables/{responsable_id}")
async def portal_actualizar_responsable(
    portal_token: str,
    responsable_id: UUID,
    payload: ClienteResponsableUpdatePayload,
    request: Request,
    repo: CRMRepository = Depends(get_repository),
) -> dict[str, Any]:
    session = await _resolve_portal_session(
        repo=repo,
        portal_token=portal_token,
        request=request,
        include_relations=False,
    )
    cliente_ref = session.get("cliente") or {}
    cliente_id = cliente_ref.get("id")
    if not cliente_id:
        raise HTTPException(status_code=404, detail="cliente_not_found")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return {"ok": True, "responsable": None}
    responsable = await repo.update_cliente_responsable(
        cliente_id=UUID(str(cliente_id)),
        responsable_id=responsable_id,
        payload=updates,
        usuario_token=None,
    )
    return {"ok": True, "responsable": responsable}


@router.post("/prospeccion/google/busquedas")
async def crear_busqueda_google(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: GoogleProspeccionBusquedaPayload,
) -> dict[str, Any]:
    dense_mode = bool(payload.dense_mode)
    query_value = payload.query or ", ".join(payload.included_types or []) or "google_places"
    meta_payload: dict[str, Any] = {
        "strategy": payload.strategy,
        "included_types": payload.included_types,
        "dense_mode": dense_mode,
    }
    if payload.meta:
        meta_payload.update(payload.meta)
    if payload.language_code:
        meta_payload["language_code"] = payload.language_code
    if payload.region_code:
        meta_payload["region_code"] = payload.region_code

    job_meta = dict(meta_payload)
    job_meta["status"] = "queued"

    crear_body = {
        "p_fuente": "google_places",
        "p_query": query_value,
        "p_radio_m": payload.radio_m,
        "p_lat": payload.lat,
        "p_lng": payload.lng,
        "p_total": 0,
        "p_meta": job_meta,
    }
    try:
        crear_data = await repo.create_prospeccion_busqueda(
            usuario_token=user_token,
            payload=crear_body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    busqueda_value = _rpc_field(crear_data, "crear_busqueda", "id")
    try:
        busqueda_uuid = UUID(str(busqueda_value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="busqueda_id_invalid") from exc

    busqueda_row = await repo.get_prospeccion_busqueda(busqueda_id=busqueda_uuid, select="organizacion_id")
    organizacion_id = None
    if busqueda_row:
        raw_organizacion = busqueda_row.get("organizacion_id")
        if raw_organizacion:
            organizacion_id = str(raw_organizacion)
            job_meta["organizacion_id"] = organizacion_id

    job_payload: dict[str, Any] = {
        "query": payload.query,
        "lat": payload.lat,
        "lng": payload.lng,
        "radio_m": payload.radio_m,
        "included_types": payload.included_types,
        "strategy": payload.strategy,
        "language_code": payload.language_code,
        "region_code": payload.region_code,
        "dense_mode": dense_mode,
    }
    GOOGLE_SEARCH_JOB_MANAGER.schedule_job(
        repo=repo,
        job=GoogleSearchJob(busqueda_id=busqueda_uuid, payload=job_payload, meta=job_meta),
    )
    return {
        "ok": True,
        "busqueda_id": str(busqueda_uuid),
        "status": "queued",
    }


@router.post("/prospeccion/denue/busquedas")
async def crear_busqueda_denue(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: DenueBusquedaPayload,
) -> dict[str, Any]:
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

    crear_body = {
        "p_fuente": "denue",
        "p_query": payload.query,
        "p_radio_m": payload.radio_m,
        "p_lat": payload.lat,
        "p_lng": payload.lng,
        "p_total": len(normalized_items),
        "p_meta": meta_payload,
    }
    try:
        crear_data = await repo.create_prospeccion_busqueda(
            usuario_token=user_token,
            payload=crear_body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    busqueda_value = _rpc_field(crear_data, "crear_busqueda", "id")
    try:
        busqueda_uuid = UUID(str(busqueda_value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="busqueda_id_invalid") from exc

    upserted = 0
    if normalized_items:
        try:
            upsert_data = await repo.upsert_prospeccion_resultados(
                usuario_token=user_token,
                payload={
                    "p_busqueda_id": str(busqueda_uuid),
                    "p_fuente": "denue",
                    "p_items": normalized_items,
                },
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if isinstance(upsert_data, dict):
            upserted = (
                upsert_data.get("upserted") or upsert_data.get("total") or len(normalized_items)
            )
        else:
            try:
                upserted = int(upsert_data or 0)
            except (TypeError, ValueError):
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
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: str | None = Query(default=None),
) -> dict[str, Any]:
    params: dict[str, str] = {
        "select": "id,fuente,query,radio_m,lat,lng,meta,total_encontrados,creado_en",
        "order": "creado_en.desc",
        "limit": str(limit),
        "offset": str(offset),
        "fuente": "eq.google_places",
    }
    if search:
        params["query"] = _ilike_param(search)
    try:
        rows, total = await repo.list_prospeccion_busquedas(
            usuario_token=user_token,
            params=params,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "limit": limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.get("/prospeccion/denue/busquedas")
async def listar_busquedas_denue(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: str | None = Query(default=None),
) -> dict[str, Any]:
    params: dict[str, str] = {
        "select": "id,fuente,query,radio_m,lat,lng,meta,total_encontrados,creado_en",
        "order": "creado_en.desc",
        "limit": str(limit),
        "offset": str(offset),
        "fuente": "eq.denue",
    }
    if search:
        params["query"] = _ilike_param(search)
    try:
        rows, total = await repo.list_prospeccion_busquedas(
            usuario_token=user_token,
            params=params,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "limit": limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.delete("/prospeccion/google/busquedas/{busqueda_id}")
async def eliminar_busqueda_google(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),  # noqa: ARG001
    busqueda_id: UUID,
) -> dict[str, Any]:
    try:
        deleted = await repo.delete_prospeccion_busqueda(
            busqueda_id=busqueda_id,
            fuente="google_places",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "deleted": deleted}


@router.delete("/prospeccion/denue/busquedas/{busqueda_id}")
async def eliminar_busqueda_denue(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),  # noqa: ARG001
    busqueda_id: UUID,
) -> dict[str, Any]:
    try:
        deleted = await repo.delete_prospeccion_busqueda(
            busqueda_id=busqueda_id,
            fuente="denue",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "deleted": deleted}


@router.get("/prospeccion/google/resultados")
async def listar_resultados_google(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    busqueda_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    tipo: str | None = Query(default=None),
    max_distancia_m: Annotated[int | None, Query(ge=1, le=50000)] = None,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 250,
    offset: Annotated[int, Query(ge=0)] = 0,
    order: Literal["recientes", "rating", "distancia"] = Query(default="recientes"),
) -> dict[str, Any]:
    order_map = {
        "recientes": "resultado_creado_en.desc",
        "rating": "rating.desc.nullslast",
        "distancia": "distancia_m.asc.nullslast",
    }
    params: dict[str, str] = {
        "select": "*",
        "order": order_map.get(order, "resultado_creado_en.desc"),
    }
    if busqueda_id:
        params["busqueda_id"] = f"eq.{busqueda_id}"
    if tipo:
        params["google_primary_type"] = f"eq.{tipo}"
    if max_distancia_m:
        params["distancia_m"] = f"lte.{max_distancia_m}"
    if min_rating is not None:
        params["rating"] = f"gte.{min_rating}"
    if q:
        sanitized = q.replace("*", "").replace("%", "")
        params["or"] = (
            f"(display_name.ilike.*{sanitized}*,"
            f"actividad.ilike.*{sanitized}*,"
            f"address.ilike.*{sanitized}*)"
        )
    effective_limit = min(limit, 500)
    params["limit"] = str(effective_limit)
    params["offset"] = str(offset)
    try:
        rows, total = await repo.list_prospeccion_resultados(
            usuario_token=user_token,
            path="/rest/v1/v_google_places_contactables",
            params=params,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "limit": effective_limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.get("/prospeccion/denue/resultados")
async def listar_resultados_denue(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    busqueda_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    estrato: str | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=5000)] = 250,
    offset: Annotated[int, Query(ge=0)] = 0,
    order: Literal["recientes", "distancia"] = Query(default="recientes"),
) -> dict[str, Any]:
    order_map = {
        "recientes": "resultado_creado_en.desc",
        "distancia": "distancia_m.asc.nullslast",
    }
    params: dict[str, str] = {
        "select": "*",
        "order": order_map.get(order, "resultado_creado_en.desc"),
    }
    if busqueda_id:
        params["busqueda_id"] = f"eq.{busqueda_id}"
    if estrato:
        params["estrato"] = f"eq.{estrato}"
    if q:
        sanitized = q.replace("*", "").replace("%", "")
        params["or"] = (
            f"(display_name.ilike.*{sanitized}*,"
            f"actividad.ilike.*{sanitized}*,"
            f"address.ilike.*{sanitized}*)"
        )
    effective_limit = min(limit, 500)
    params["limit"] = str(effective_limit)
    params["offset"] = str(offset)
    try:
        rows, total = await repo.list_prospeccion_resultados(
            usuario_token=user_token,
            path="/rest/v1/v_denue_contactables",
            params=params,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "limit": effective_limit,
        "offset": offset,
        "total": total or len(rows),
    }


@router.delete("/prospeccion/google/resultados")
async def eliminar_resultados_google(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),  # noqa: ARG001
    payload: DeleteResultadosPayload,
) -> dict[str, Any]:
    try:
        deleted = await repo.delete_prospeccion_resultados(
            ids=payload.ids,
            fuente="google_places",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "deleted": deleted}


@router.delete("/prospeccion/denue/resultados")
async def eliminar_resultados_denue(
    *,
    repo: CRMRepository = Depends(get_repository),
    admin_id: UUID = Depends(require_admin_user),  # noqa: ARG001
    payload: DeleteResultadosPayload,
) -> dict[str, Any]:
    try:
        deleted = await repo.delete_prospeccion_resultados(
            ids=payload.ids,
            fuente="denue",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "deleted": deleted}


@router.get("/prospeccion/prospectos")
async def listar_prospectos(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ProspectoListQuery = Depends(),
) -> dict[str, Any]:
    """Devuelve prospectos guardados con paginación y filtros básicos."""

    order_value = "display_name.asc.nullslast" if params.order == "nombre" else None
    try:
        rows, total = await repo.list_prospectos(
            usuario_token=user_token,
            limit=params.limit,
            offset=params.offset,
            search=params.search,
            fuente=params.fuente or None,
            lookup_status=params.lookup_status,
            segmento=params.segmento,
            carrier_type=params.carrier_type or None,
            order=order_value,
            stage=params.stage or None,
            whatsapp_permitido=params.whatsapp_permitido,
            llamada_permitida=params.llamada_permitida,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/prospeccion/prospectos/contact-indicadores")
async def listar_prospecto_contact_indicadores(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    prospecto_ids: Annotated[list[UUID] | None, Query(alias="prospecto_id")] = None,
) -> dict[str, Any]:
    """Devuelve los indicadores agregados de contacto por prospecto."""

    if not prospecto_ids:
        raise HTTPException(status_code=400, detail="prospecto_ids_required")
    if len(prospecto_ids) > 50:
        raise HTTPException(status_code=400, detail="prospecto_ids_limit_exceeded")
    try:
        rows = await repo.list_prospecto_contact_indicators(
            usuario_token=user_token,
            prospecto_ids=prospecto_ids,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "items": rows}


@router.get("/prospeccion/contacto/batches")
async def listar_contacto_batches(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ContactBatchQuery = Depends(),
) -> dict[str, Any]:
    """Devuelve lotes de contacto con filtros básicos."""

    order = "creado_en.asc" if params.order == "antiguo" else "creado_en.desc"
    try:
        rows, total = await repo.list_contact_batches(
            usuario_token=user_token,
            limit=params.limit,
            offset=params.offset,
            estado=params.estado,
            order=order,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/prospeccion/contacto/envios")
async def listar_contacto_envios(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ContactEnvioQuery = Depends(),
) -> dict[str, Any]:
    """Lista envíos por lote o prospecto."""

    order = "creado_en.asc" if params.order == "antiguo" else "creado_en.desc"
    try:
        rows, total = await repo.list_contact_envios(
            usuario_token=user_token,
            limit=params.limit,
            offset=params.offset,
            batch_id=params.batch_id,
            prospecto_id=params.prospecto_id,
            canal=params.canal or None,
            estado=params.estado,
            order=order,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/prospeccion/contacto/logs")
async def listar_contacto_logs(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ContactLogQuery = Depends(),
) -> dict[str, Any]:
    """Bitácora detallada de eventos por lote/envío."""

    order = "creado_en.asc" if params.order == "antiguo" else "creado_en.desc"
    try:
        rows, total = await repo.list_contact_logs(
            usuario_token=user_token,
            limit=params.limit,
            offset=params.offset,
            batch_id=params.batch_id,
            envio_id=params.envio_id,
            prospecto_id=params.prospecto_id,
            canal=params.canal if params.canal else None,
            estado=params.estado,
            order=order,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.get("/prospeccion/contacto/templates")
async def listar_contacto_templates(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ContactTemplateQuery = Depends(),
) -> dict[str, Any]:
    """Lista plantillas disponibles para envíos."""

    try:
        items = await repo.list_contact_templates(
            usuario_token=user_token,
            canal=params.canal or None,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "items": items}


@router.post("/prospeccion/contacto/templates")
async def crear_contacto_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ContactoTemplatePayload,
) -> dict[str, Any]:
    body = _build_contact_template_payload(payload.model_dump(), include_metadata=True)
    try:
        template = await repo.create_contact_template(usuario_token=user_token, payload=body)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "template": template}


@router.patch("/prospeccion/contacto/templates/{template_id}")
async def actualizar_contacto_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    template_id: UUID,
    payload: ContactoTemplateUpdatePayload,
) -> dict[str, Any]:
    raw_data = payload.model_dump(exclude_none=True)
    if not raw_data:
        raise HTTPException(status_code=400, detail="empty_update")
    body = _build_contact_template_payload(raw_data)
    try:
        template = await repo.update_contact_template(
            usuario_token=user_token,
            template_id=template_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        if "contact_template_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="contact_template_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "template": template}


@router.delete("/prospeccion/contacto/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_contacto_template(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    template_id: UUID,
) -> Response:
    try:
        await repo.delete_contact_template(usuario_token=user_token, template_id=template_id)
    except CRMRepositoryError as exc:
        if "contact_template_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="contact_template_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/prospeccion/contacto/listas")
async def listar_contacto_listas(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    params: ProspeccionListaQuery = Depends(),
) -> dict[str, Any]:
    """Devuelve listas inteligentes guardadas."""

    try:
        rows, total = await repo.list_contact_lists(
            usuario_token=user_token,
            limit=params.limit,
            offset=params.offset,
            search=params.search,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": params.limit,
        "offset": params.offset,
    }


@router.post("/prospeccion/contacto/listas")
async def crear_contacto_lista(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ProspeccionListaPayload,
) -> dict[str, Any]:
    body = payload.model_dump(mode="json", exclude_none=True)
    try:
        row = await repo.create_contact_list(usuario_token=user_token, payload=body)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "lista": row}


@router.patch("/prospeccion/contacto/listas/{lista_id}")
async def actualizar_contacto_lista(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    lista_id: UUID,
    payload: ProspeccionListaUpdatePayload,
) -> dict[str, Any]:
    body = payload.model_dump(mode="json", exclude_none=True)
    if not body:
        raise HTTPException(status_code=400, detail="empty_update")
    try:
        row = await repo.update_contact_list(
            usuario_token=user_token,
            lista_id=lista_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        if "contact_list_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="contact_list_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "lista": row}


@router.delete("/prospeccion/contacto/listas/{lista_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_contacto_lista(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    lista_id: UUID,
) -> Response:
    try:
        await repo.delete_contact_list(usuario_token=user_token, lista_id=lista_id)
    except CRMRepositoryError as exc:
        if "contact_list_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="contact_list_not_found") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/prospeccion/campanas")
async def prospeccion_campanas_dashboard(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    organizacion_id: UUID = Depends(require_organizacion_id),
    params: ProspeccionCampanaQuery = Depends(),
) -> dict[str, Any]:
    """Dashboard compacto de campañas (agrupa lotes por campana)."""

    limit = params.limit
    try:
        batches, _ = await repo.list_contact_batches(
            usuario_token=user_token,
            limit=limit,
            offset=0,
            order="creado_en.desc",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    batch_ids: list[UUID] = []
    for row in batches:
        batch_id = row.get("id")
        try:
            if batch_id:
                batch_ids.append(UUID(str(batch_id)))
        except (ValueError, TypeError):
            continue

    try:
        resumenes = await repo.summarize_envios_por_batches(
            usuario_token=user_token,
            batch_ids=batch_ids,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    campana_ids: set[str] = set()
    for row in batches:
        campana_id = row.get("campana_id")
        if campana_id:
            campana_ids.add(str(campana_id))

    campana_map: dict[str, dict[str, Any]] = {}
    if campana_ids:
        try:
            campanas = await repo.list_campaigns(organizacion_id=organizacion_id)
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        for campana in campanas:
            campana_id = str(campana.get("id"))
            if campana_id in campana_ids:
                campana_map[campana_id] = campana

    grouped: dict[str, dict[str, Any]] = {}
    for row in batches:
        batch_id = str(row.get("id"))
        if not batch_id:
            continue
        campana_id_raw = row.get("campana_id")
        campana_key = str(campana_id_raw) if campana_id_raw else "sin_campana"
        campana_info = campana_map.get(str(campana_id_raw)) if campana_id_raw else None
        campana_nombre = campana_info.get("nombre") if campana_info else None
        batch_totales = resumenes.get(batch_id, {})
        batch_item = {
            "id": batch_id,
            "campana_id": str(campana_id_raw) if campana_id_raw else None,
            "campana_nombre": campana_nombre or row.get("titulo") or ("Sin campaña" if not campana_id_raw else None),
            "titulo": row.get("titulo"),
            "estado": row.get("estado"),
            "total_prospectos": row.get("total_prospectos"),
            "canales": row.get("canales") or [],
            "programacion": row.get("programacion") or {},
            "filtros": row.get("filtros") or {},
            "metadata": row.get("metadata") or {},
            "lista_id": row.get("lista_id"),
            "creado_en": row.get("creado_en"),
            "totales": batch_totales,
        }
        group = grouped.setdefault(
            campana_key,
            {
                "campana_id": batch_item["campana_id"],
                "campana_nombre": campana_nombre or ("Sin campaña" if campana_key == "sin_campana" else None),
                "batches": [],
                "totales": {},
            },
        )
        group["batches"].append(batch_item)
        for estado, count in batch_totales.items():
            group["totales"][estado] = group["totales"].get(estado, 0) + count

    return {"ok": True, "items": list(grouped.values())}


@router.get("/prospeccion/campanas/{campana_id}/duplicar")
async def prospeccion_campana_duplicar_defaults(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    organizacion_id: UUID = Depends(require_organizacion_id),
    campana_id: UUID,
) -> dict[str, Any]:
    """Obtiene el preset del lote más reciente para duplicar una campaña."""

    campana = await repo.get_campaign(organizacion_id=organizacion_id, campana_id=campana_id)
    if not campana:
        raise HTTPException(status_code=404, detail="campana_not_found")

    batches, _ = await repo.list_contact_batches(
        usuario_token=user_token,
        limit=1,
        offset=0,
        campana_id=campana_id,
        order="creado_en.desc",
    )
    if not batches:
        raise HTTPException(status_code=404, detail="campana_without_batches")
    base_batch = batches[0]
    metadata = _ensure_dict(base_batch.get("metadata"), default={})
    canales_config = _ensure_dict(metadata.get("canales_config"), default={})
    programacion = _ensure_dict(base_batch.get("programacion"), default={})
    filtros = base_batch.get("filtros") if isinstance(base_batch.get("filtros"), dict) else {}
    lista_id = base_batch.get("lista_id")
    source: Literal["selected", "lista", "filters"] = "selected"
    if lista_id:
        source = "lista"
    elif filtros:
        source = "filters"

    canales_defaults: dict[str, Any] = {}
    for canal, config in canales_config.items():
        if not isinstance(config, dict):
            continue
        canales_defaults[canal] = {
            "templateSlug": config.get("template_slug"),
            "subject": config.get("subject"),
            "body": config.get("body"),
            "message": config.get("message"),
            "schedule": programacion.get(canal),
            "enabled": True,
        }

    defaults = {
        "campana_id": str(campana_id),
        "campana_nombre": campana.get("nombre"),
        "titulo": base_batch.get("titulo"),
        "source": source,
        "lista_id": str(lista_id) if lista_id else None,
        "filtros": filtros or {},
        "canales": canales_defaults,
        "programacion": programacion or {},
    }
    return {
        "ok": True,
        "campana": {
            "id": str(campana_id),
            "nombre": campana.get("nombre"),
            "descripcion": campana.get("descripcion"),
        },
        "defaults": defaults,
    }


@router.get("/prospeccion/prospectos/{prospecto_id}/contactos")
async def listar_contactos_por_prospecto(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    prospecto_id: UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    """Historial de envíos asociados a un prospecto."""

    try:
        rows, total = await repo.list_contact_envios(
            usuario_token=user_token,
            limit=limit,
            offset=offset,
            prospecto_id=prospecto_id,
            order="creado_en.desc",
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "items": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/prospeccion/prospectos/{prospecto_id}/audit")
async def listar_audit_por_prospecto(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    prospecto_id: UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    try:
        rows = await repo.list_prospecto_audit(
            usuario_token=user_token,
            prospecto_id=prospecto_id,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    entries: list[ProspectoAuditEntryResponse] = []
    for row in rows:
        entry_id = _safe_uuid(row.get("id"))
        if entry_id is None:
            continue
        raw_action = str(row.get("accion") or "").lower()
        action: Literal["insert", "update", "delete"]
        if raw_action in {"insert", "delete"}:
            action = raw_action  # type: ignore[assignment]
        else:
            action = "update"
        cambios_value = row.get("cambios")
        cambios_dict = cambios_value if isinstance(cambios_value, dict) else {}
        entries.append(
            ProspectoAuditEntryResponse(
                id=entry_id,
                accion=action,
                cambios=cambios_dict,
                realizado_por=_safe_uuid(row.get("realizado_por")),
                realizado_en=_parse_datetime(row.get("realizado_en")) or datetime.now(timezone.utc),
            )
        )

    return {"ok": True, "items": [entry.model_dump(mode="json") for entry in entries]}


@router.post("/prospeccion/prospectos/{prospecto_id}/convertir-contacto")
async def convertir_prospecto_contacto(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    prospecto_id: UUID,
    payload: ProspectoConvertirPayload,
) -> dict[str, Any]:
    """Crea un contacto CRM a partir de un prospecto y actualiza su metadata."""

    prospecto = await _get_prospecto_or_404(
        repo=repo,
        user_token=user_token,
        prospecto_id=prospecto_id,
    )
    nombre = _clean_text(payload.nombre) or _clean_text(prospecto.get("display_name"))
    correo = payload.correo or prospecto.get("email")
    telefono = payload.telefono or prospecto.get("phone_e164") or prospecto.get("phone")
    canal_origen = (payload.canal_origen or "otro").lower()
    source_label = _describe_prospeccion_source(prospecto)
    pipeline_canal_label = _infer_prospeccion_canal_label(prospecto)
    contacto_body = {
        "nombre_completo": nombre,
        "correo": correo,
        "telefono_e164": telefono,
        "company_name": payload.company_name or prospecto.get("segmento"),
        "notes": payload.notas or prospecto.get("notas"),
        "origen": "prospeccion",
    }
    contacto_datos = {
        "prospecto_id": str(prospecto_id),
        "prospeccion_fuente": source_label,
    }
    if canal_origen != "otro":
        contacto_datos["prospeccion_canal"] = canal_origen
    contacto_body["contacto_datos"] = {k: v for k, v in contacto_datos.items() if v}
    contacto_body = {k: v for k, v in contacto_body.items() if v}

    try:
        contacto = await repo.create_contact(
            organizacion_id=organizacion_id,
            payload=contacto_body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    metadata = _ensure_dict(prospecto.get("metadata"), default={})
    contacto_id = contacto.get("id")
    if contacto_id:
        metadata["convertido_contacto_id"] = str(contacto_id)
    metadata["convertido_en"] = datetime.now(timezone.utc).isoformat()
    metadata["recontact_blocked"] = True
    metadata["recontact_block_reason"] = "convertido_contacto"
    metadata["recontact_blocked_en"] = datetime.now(timezone.utc).isoformat()
    if canal_origen and canal_origen != "otro":
        metadata["ultimo_canal_prospeccion"] = canal_origen
    if payload.stage:
        metadata["stage"] = payload.stage
    elif not metadata.get("stage"):
        metadata["stage"] = "evaluate"

    oportunidad = None
    oportunidad_id: UUID | None = None
    try:
        stage_payload = await repo.get_stage_by_code(
            organizacion_id=organizacion_id,
            codigo="prospeccion_primer_contacto",
        )
        if not stage_payload:
            stage_payload = await repo.ensure_prospeccion_stage(
                organizacion_id=organizacion_id,
            )
    except CRMRepositoryError as exc:
        logger.warning("prospeccion.stage_lookup_failed", extra={"error": str(exc)})
        stage_payload = None

    try:
        stage_id = (
            _safe_uuid(stage_payload.get("id")) if stage_payload else None
        )
    except Exception:
        stage_id = None

    if stage_id is None:
        try:
            stage_id = await repo.get_default_stage_id(organizacion_id=organizacion_id)
        except CRMRepositoryError as exc:  # pragma: no cover - fallback improbable
            logger.warning("prospeccion.stage_default_failed", extra={"error": str(exc)})
            stage_id = None

    if stage_id and contacto_id:
        opportunity_title = nombre or prospecto.get("display_name") or "Prospección"
        opportunity_metadata = {
            "prospecto_id": str(prospecto_id),
            "source": source_label,
        }
        if canal_origen != "otro":
            opportunity_metadata["prospeccion_canal"] = canal_origen
        fuente_busqueda = _clean_text(prospecto.get("fuente_busqueda"))
        if fuente_busqueda:
            opportunity_metadata["prospeccion_fuente_codigo"] = fuente_busqueda
        opportunity_metadata["canal"] = pipeline_canal_label

        opportunity_payload = {
            "contacto_principal_id": contacto_id,
            "etapa_id": str(stage_id),
            "titulo": opportunity_title[:255],
            "descripcion": payload.notas or prospecto.get("notas"),
            "metadata": opportunity_metadata,
        }
        try:
            oportunidad = await repo.create_opportunity(
                organizacion_id=organizacion_id,
                payload=opportunity_payload,
            )
        except CRMRepositoryError as exc:
            logger.warning("prospeccion.crear_oportunidad_error", extra={"error": str(exc)})
            oportunidad = None
        else:
            oportunidad_id = _safe_uuid(oportunidad.get("id"))
            if oportunidad_id:
                history_payload: dict[str, str] = {
                    "oportunidad_id": str(oportunidad_id),
                    "etapa_destino_id": str(stage_id),
                    "fuente": "prospeccion",
                }
                if usuario_id:
                    history_payload["cambiado_por_usuario_id"] = str(usuario_id)
                try:
                    await repo.append_stage_history(
                        organizacion_id=organizacion_id,
                        payload=history_payload,
                    )
                except CRMRepositoryError as exc:  # pragma: no cover - no frena flujo
                    logger.warning("prospeccion.historial_stage_error", extra={"error": str(exc)})

    if oportunidad_id:
        metadata["crm_oportunidad_id"] = str(oportunidad_id)
        metadata["crm_origen_etapa"] = "prospeccion_primer_contacto"

    try:
        updated = await repo.update_prospecto(
            usuario_token=user_token,
            prospecto_id=prospecto_id,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response: dict[str, Any] = {"ok": True, "prospecto": updated, "contacto": contacto}
    if oportunidad:
        response["oportunidad"] = oportunidad
    return response


@router.post("/prospeccion/prospectos")
async def guardar_prospectos(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ProspectoSeleccionPayload,
) -> dict[str, Any]:
    """Persiste IDs seleccionados de búsquedas en la tabla de prospectos."""

    try:
        contactables = await repo.list_contactables_by_ids(
            usuario_token=user_token,
            fuente=payload.fuente,
            resultado_ids=payload.resultado_ids,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not contactables:
        raise HTTPException(status_code=404, detail="resultados_not_found")

    items = [
        _build_prospecto_from_contactable(
            row,
            segmento=payload.segmento,
            extra_metadata=payload.metadata,
        )
        for row in contactables
    ]
    try:
        prospectos = await repo.upsert_prospeccion_prospectos(
            usuario_token=user_token,
            items=items,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "ok": True,
        "total": len(prospectos),
        "prospectos": prospectos,
    }


@router.post("/prospeccion/prospectos/manual")
async def crear_prospecto_manual(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ProspectoManualPayload,
) -> dict[str, Any]:
    """Crea un prospecto manual etiquetado como fuente usuario."""

    data = _build_manual_prospecto_payload(payload)
    try:
        prospecto = await repo.create_prospecto_manual(
            usuario_token=user_token,
            payload=data,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "prospecto": prospecto}


@router.patch("/prospeccion/prospectos/{prospecto_id}")
async def actualizar_prospecto(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    prospecto_id: UUID,
    payload: ProspectoUpdatePayload,
) -> dict[str, Any]:
    """Actualiza campos básicos de cualquier prospecto."""

    await _get_prospecto_or_404(
        repo=repo,
        user_token=user_token,
        prospecto_id=prospecto_id,
    )
    updates = _build_prospecto_update_payload(update_payload=payload)
    try:
        updated = await repo.update_prospecto(
            usuario_token=user_token,
            prospecto_id=prospecto_id,
            payload=updates,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "prospecto": updated}


@router.delete("/prospeccion/prospectos/{prospecto_id}")
async def eliminar_prospecto(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    prospecto_id: UUID,
) -> dict[str, Any]:
    """Elimina un prospecto manual o importado y registra auditoría vía trigger."""

    await _get_prospecto_or_404(
        repo=repo,
        user_token=user_token,
        prospecto_id=prospecto_id,
    )
    try:
        await repo.delete_prospecto(
            usuario_token=user_token,
            prospecto_id=prospecto_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "prospecto_id": str(prospecto_id)}


@router.post("/prospeccion/prospectos/verificar-telefonos")
async def verificar_prospectos(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ProspectoLookupPayload,
) -> dict[str, Any]:
    """Verifica los teléfonos de prospectos con Twilio Lookup."""

    try:
        prospectos = await repo.list_prospectos_by_ids(
            usuario_token=user_token,
            prospecto_ids=payload.prospecto_ids,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not prospectos:
        raise HTTPException(status_code=404, detail="prospectos_not_found")

    try:
        processed = await _run_prospecto_lookup(
            repo=repo,
            user_token=user_token,
            prospectos=prospectos,
            country_code=payload.country_code,
            reintentar=payload.reintentar,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "procesados": len(processed), "detalles": processed}


@router.post("/prospeccion/prospectos/checklist/lookup")
async def prospeccion_checklist_lookup(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    payload: ProspectoChecklistLookupPayload,
) -> dict[str, Any]:
    """Acción automática: ejecuta Twilio Lookup sobre los pendientes detectados en el checklist."""

    try:
        prospectos = await repo.list_lookup_pending_prospectos(
            usuario_token=user_token,
            limit=payload.limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not prospectos:
        return {"ok": True, "procesados": 0, "detalles": [], "prospecto_ids": []}

    try:
        processed = await _run_prospecto_lookup(
            repo=repo,
            user_token=user_token,
            prospectos=prospectos,
            country_code=payload.country_code,
            reintentar=payload.reintentar,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "ok": True,
        "procesados": len(processed),
        "detalles": processed,
        "prospecto_ids": [item["prospecto_id"] for item in processed],
    }


@router.post("/prospeccion/prospectos/checklist/scraper")
async def prospeccion_checklist_scraper(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: ProspectoChecklistScraperPayload,
) -> dict[str, Any]:
    """Dispara jobs del buscador web para prospectos sin correo pero con sitio web."""

    candidatos: list[dict[str, Any]] = []
    if payload.prospecto_ids:
        try:
            candidatos = await repo.list_prospectos_by_ids(
                usuario_token=user_token,
                prospecto_ids=payload.prospecto_ids,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    else:
        fetch_limit = max(payload.limit * 3, payload.limit)
        try:
            candidatos = await repo.list_scraper_pending_prospectos(
                usuario_token=user_token,
                limit=fetch_limit,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    jobs: list[BuscadorJobResponse] = []
    seen_hosts: set[str] = set()
    job_cap = payload.limit if payload.limit else 1

    for candidato in candidatos:
        if len(jobs) >= job_cap:
            break
        target = _normalize_scraper_target(candidato.get("website"))
        if not target:
            continue
        url, host = target
        if host in seen_hosts:
            continue
        seen_hosts.add(host)

        params = BuscadorParams(
            sitio="domain",
            url=url,
            mode=payload.mode,
            max_pages=payload.max_pages,
            max_depth=payload.max_depth,
            max_runtime=payload.max_runtime,
        )

        metadata = {
            "prospecto_id": str(candidato.get("id")),
            "fuente": "checklist_scraper",
        }
        segmento = _clean_text(candidato.get("segmento"))
        if segmento:
            metadata["segmento"] = segmento

        job_payload: dict[str, Any] = {
            "status": "pending",
            "params": _params_to_dict(params),
            "metadata": metadata,
        }
        if usuario_id:
            job_payload["creado_por"] = str(usuario_id)

        try:
            job_row = await repo.create_buscador_job(usuario_token=user_token, payload=job_payload)
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        BUSCADOR_JOB_MANAGER.schedule_job(repo=repo, job_row=job_row, params=params)
        jobs.append(_job_row_to_response(job_row))

    return {"ok": True, "jobs": jobs, "programados": len(jobs)}


@router.post("/prospeccion/prospectos/contactar")
async def contactar_prospectos(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: ProspectoContactarPayload,
) -> dict[str, Any]:
    """Envía correos, WhatsApps o llamadas registrando lotes y envíos individuales."""

    template_map: dict[str, dict[str, Any]] = {}
    if payload.canales:
        template_ids = {config.template_id for config in payload.canales if config.template_id}
        if template_ids:
            template_map = await _fetch_contact_templates(
                repo=repo,
                user_token=user_token,
                template_ids=template_ids,
            )

    canales_config, programacion = _resolve_contact_channels(
        payload,
        template_map=template_map,
    )
    if not canales_config:
        raise HTTPException(status_code=400, detail="contact_channels_required")

    selector_filtros: dict[str, Any] = {}
    metadata_extra: dict[str, Any] = {"canales_config": canales_config}
    if programacion:
        metadata_extra["programacion"] = programacion

    filtros_fuente: ProspectoFiltroPayload | None = None
    lista_nombre: str | None = None
    omitidos: list[dict[str, Any]] = []
    if payload.lista_id:
        try:
            lista_row = await repo.get_contact_list(usuario_token=user_token, lista_id=payload.lista_id)
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not lista_row:
            raise HTTPException(status_code=404, detail="contact_list_not_found")
        filtros_data = _ensure_dict(lista_row.get("filtros"), default={})
        try:
            filtros_fuente = ProspectoFiltroPayload.model_validate(filtros_data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Lista con filtros inválidos %s: %s", payload.lista_id, exc)
            raise HTTPException(status_code=400, detail="contact_list_invalid_filters") from exc
        selector_filtros = filtros_data
        lista_nombre = _clean_text(lista_row.get("nombre"))
        if lista_nombre:
            metadata_extra["lista_nombre"] = lista_nombre
    elif payload.filtros:
        filtros_fuente = payload.filtros
        selector_filtros = payload.filtros.model_dump(exclude_none=True)

    prospectos: list[dict[str, Any]] = []
    total_prospectos = 0

    if payload.prospecto_ids:
        try:
            prospectos = await repo.list_prospectos_by_ids(
                usuario_token=user_token,
                prospecto_ids=payload.prospecto_ids,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not prospectos:
            raise HTTPException(status_code=404, detail="prospectos_not_found")
        total_prospectos = len(prospectos)
        selector_filtros = selector_filtros or {"prospecto_ids": [str(value) for value in payload.prospecto_ids]}
    else:
        if not filtros_fuente:
            raise HTTPException(status_code=400, detail="prospecto_selector_required")
        try:
            repo_kwargs = _prospecto_filters_to_kwargs(filtros_fuente)
            prospectos, total = await repo.list_prospectos(
                usuario_token=user_token,
                limit=MAX_PROSPECCION_BATCH,
                offset=0,
                order="creado_en.desc",
                **repo_kwargs,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not prospectos:
            raise HTTPException(status_code=404, detail="prospectos_not_found")
        if total > MAX_PROSPECCION_BATCH:
            raise HTTPException(status_code=400, detail="prospecto_batch_limit_exceeded")
        total_prospectos = total
        selector_filtros = selector_filtros or filtros_fuente.model_dump(exclude_none=True)

    prospectos, bloqueados = _split_recontact_blocked_prospectos(prospectos)
    if not prospectos:
        raise HTTPException(status_code=400, detail="prospectos_recontact_blocked")
    total_prospectos = len(prospectos)
    if bloqueados:
        omitidos.append(
            {
                "motivo": "convertido_contacto",
                "prospecto_ids": bloqueados,
                "total": len(bloqueados),
            }
        )
        metadata_extra["recontacto_bloqueados"] = {"total": len(bloqueados)}

    try:
        batch = await repo.create_contact_batch(
            usuario_token=user_token,
            payload=_build_contact_batch_payload(
                canales=list(canales_config.keys()),
                total=total_prospectos,
                payload=payload,
                usuario_id=usuario_id,
                filtros=selector_filtros,
                programacion=programacion,
                metadata_extra=metadata_extra,
            ),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    batch_id = batch.get("id")
    if not batch_id:
        raise HTTPException(status_code=502, detail="contact_batch_invalid")

    envios_entries = _build_contact_envios_entries(
        batch_id=batch_id,
        prospectos=prospectos,
        canales=canales_config,
        programacion=programacion,
    )
    try:
        envios = await repo.insert_contact_envios(
            usuario_token=user_token,
            entries=envios_entries,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    resumen = _build_contact_resumen(envios)
    contact_sender.notify_new_envios()

    response: dict[str, Any] = {"ok": True, "batch_id": str(batch_id), "contactos": resumen}
    if omitidos:
        response["omitidos"] = omitidos
    return response


@router.get("/prospeccion/contacto/batches/{batch_id}")
async def obtener_contacto_batch(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    batch_id: UUID,
) -> dict[str, Any]:
    """Devuelve un lote específico con resumen de sus envíos."""

    batch = await repo.get_contact_batch(usuario_token=user_token, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="contact_batch_not_found")

    resumen_rows = await repo.summarize_contact_batch(usuario_token=user_token, batch_id=batch_id)
    totales: dict[str, int] = {}
    total_envios = 0
    for row in resumen_rows:
        estado_key = _clean_text(row.get("estado")) or "desconocido"
        count_value = row.get("count") if isinstance(row, dict) else None
        try:
            count_int = int(count_value)
        except (TypeError, ValueError):
            count_int = 0
        totales[estado_key] = count_int
        total_envios += count_int

    return {
        "ok": True,
        "batch": batch,
        "totales": totales,
        "total_envios": total_envios,
    }


@router.post("/prospeccion/contacto/envios/{envio_id}/reintentar")
async def reintentar_contacto_envio(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    envio_id: UUID,
) -> dict[str, Any]:
    """Reprograma un envío fallido/omitido para que el worker lo procese nuevamente."""

    envio = await repo.get_contact_envio(usuario_token=user_token, envio_id=envio_id)
    if not envio:
        raise HTTPException(status_code=404, detail="contact_envio_not_found")
    estado_actual = _clean_text(envio.get("estado")) or ""
    if estado_actual in {"pendiente", "procesando"}:
        raise HTTPException(status_code=400, detail="contact_envio_busy")

    reprogramado_en = datetime.now(timezone.utc).isoformat()
    payload = {
        "estado": "pendiente",
        "intento_actual": 0,
        "error": None,
        "procesado_en": None,
        "programado_en": reprogramado_en,
    }
    updated = await repo.update_contact_envio(
        usuario_token=user_token,
        envio_id=envio_id,
        payload=payload,
    )

    log_entry = _build_contact_log_entry(
        prospecto_id=envio.get("prospecto_id"),
        canal=str(envio.get("canal")),
        estado="pendiente",
        detalle={
            "action": "manual_retry",
            "previous_estado": estado_actual,
        },
        batch_id=envio.get("batch_id"),
        envio_id=envio_id,
    )
    await repo.insert_prospecto_logs(usuario_token=user_token, entries=[log_entry])
    contact_sender.notify_new_envios()
    batch_id_value = envio.get("batch_id")
    if batch_id_value:
        await progress_hub.publish(
            str(batch_id_value),
            {
                "type": "envio",
                "batch_id": batch_id_value,
                "envio_id": str(envio_id),
                "estado": "pendiente",
            },
        )

    return {"ok": True, "envio": updated}


@router.get("/prospeccion/contacto/batches/{batch_id}/stream")
async def stream_contacto_batch(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    batch_id: UUID,
) -> StreamingResponse:
    """Stream SSE con actualizaciones del lote."""

    batch = await repo.get_contact_batch(usuario_token=user_token, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="contact_batch_not_found")

    queue = await progress_hub.subscribe(str(batch_id))

    async def event_generator() -> Any:
        try:
            yield _sse_payload({"type": "connected", "batch_id": str(batch_id)})
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    yield _sse_payload({"type": "ping"})
                    continue
                yield _sse_payload(event)
        finally:
            await progress_hub.unsubscribe(str(batch_id), queue)

    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@router.post("/prospeccion/contacto/batches/{batch_id}/cancelar")
async def cancelar_contacto_batch(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    batch_id: UUID,
) -> dict[str, Any]:
    """Cancela un lote y los envíos pendientes."""

    batch = await repo.get_contact_batch(usuario_token=user_token, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="contact_batch_not_found")
    estado_actual = _clean_text(batch.get("estado")) or ""
    if estado_actual in {"completado", "cancelado"}:
        raise HTTPException(status_code=400, detail="contact_batch_not_cancellable")

    motivo = "cancelado_manual"
    cancelled_envios = await repo.cancel_pending_envios(
        usuario_token=user_token,
        batch_id=batch_id,
        motivo=motivo,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    updated_batch = await repo.update_contact_batch(
        usuario_token=user_token,
        batch_id=batch_id,
        payload={"estado": "cancelado", "finalizado_en": now_iso},
    )

    if cancelled_envios:
        logs = [
            _build_contact_log_entry(
                prospecto_id=envio.get("prospecto_id"),
                canal=_clean_text(envio.get("canal")) or "canal",
                estado="cancelado",
                detalle={"reason": motivo},
                error=motivo,
                batch_id=batch_id,
                envio_id=envio.get("id"),
            )
            for envio in cancelled_envios
        ]
        await repo.insert_prospecto_logs(usuario_token=user_token, entries=logs)
        for envio in cancelled_envios:
            await progress_hub.publish(
                str(batch_id),
                {
                    "type": "envio",
                    "batch_id": str(batch_id),
                    "envio_id": envio.get("id"),
                    "estado": "cancelado",
                },
            )

    await progress_hub.publish(
        str(batch_id),
        {
            "type": "batch",
            "batch_id": str(batch_id),
            "estado": "cancelado",
        },
    )

    return {
        "ok": True,
        "batch": updated_batch,
        "envios_cancelados": len(cancelled_envios),
    }


@router.get("/prospeccion/contacto/metrics")
async def obtener_metrics_contacto() -> dict[str, Any]:
    """Snapshot simple de envíos por canal y estado."""

    snapshot = contact_metrics.snapshot()
    transformado = {
        canal: {"totales": sum(counter.values()), "por_estado": dict(counter)}
        for canal, counter in snapshot.por_canal.items()
    }
    return {"ok": True, "canales": transformado}


@router.post("/prospeccion/contacto/brevo/webhook", include_in_schema=False)
async def prospeccion_contacto_brevo_webhook(
    *,
    repo: CRMRepository = Depends(get_repository),
    payload: Any = Body(...),
) -> dict[str, Any]:
    """Recibe eventos desde Brevo y sincroniza los envíos."""

    events: list[dict[str, Any]] = []
    if isinstance(payload, list):
        events = [event for event in payload if isinstance(event, dict)]
    elif isinstance(payload, dict):
        events = [payload]
    if not events:
        raise HTTPException(status_code=400, detail="payload_invalid")
    processed = await process_brevo_events(repo=repo, events=events)
    return {"ok": True, "procesados": processed}


@router.get("/visitas/kpis")
async def get_visits_kpis(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    try:
        data = await repo.visitas_dashboard_kpis(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return data


@router.get("/visitas/estados")
async def get_visits_states(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    try:
        data = await repo.visitas_estados(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return data


@router.get("/visitas/detalle")
async def get_visits_detail(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
    order_by: str = Query(default="primera"),
    order_dir: Literal["asc", "desc"] = Query(default="asc"),
    with_contacts_only: bool = Query(default=False),
) -> list[dict[str, Any]]:
    if order_dir not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="order_dir_invalid")
    effective_order_by = (order_by or "primera").strip() or "primera"
    try:
        rows = await repo.visitas_detalle(
            usuario_token=user_token,
            limit=limit,
            offset=offset,
            order_by=effective_order_by,
            order_dir=order_dir,
            with_contacts_only=with_contacts_only,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [_map_visit_detail_row(row) if isinstance(row, dict) else row for row in rows]


@router.get("/visitas/whatsapp/total")
async def get_visits_whatsapp_total(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, int]:
    try:
        total = await repo.visitas_whatsapp_total(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"total": total}


@router.get("/visitas/whatsapp/conversaciones")
async def get_visits_whatsapp_conversations(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[dict[str, Any]]:
    try:
        rows = await repo.visitas_whatsapp_conversaciones(
            usuario_token=user_token,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return rows


@router.get("/actividades", response_model=CRMActivitiesResponse)
async def list_activities(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID | None = Query(default=None),
    cuenta_id: UUID | None = Query(default=None),
    contacto_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMActivitiesResponse:
    try:
        rows = await repo.list_activities(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            cuenta_id=cuenta_id,
            contacto_id=contacto_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMActivity.model_validate(row) for row in rows]
    return CRMActivitiesResponse(items=items, limit=limit, offset=offset)


@router.post("/actividades", response_model=CRMActivity, status_code=status.HTTP_201_CREATED)
async def create_activity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMActivityCreate,
) -> CRMActivity:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if "creado_por_usuario_id" not in body and usuario_id:
        body["creado_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_activity(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMActivity.model_validate(row)


@router.get("/actividades/{actividad_id}", response_model=CRMActivity)
async def get_activity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    actividad_id: UUID,
) -> CRMActivity:
    try:
        row = await repo.get_activity(organizacion_id=organizacion_id, activity_id=actividad_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="actividad_no_encontrada")
    return CRMActivity.model_validate(row)


@router.get("/tickets", response_model=CRMTicketsResponse)
async def list_tickets(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    estado: str | None = Query(default=None),
    prioridad: str | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMTicketsResponse:
    try:
        rows = await repo.list_tickets(
            organizacion_id=organizacion_id,
            estado=estado,
            prioridad=prioridad,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMTicket.model_validate(row) for row in rows]
    return CRMTicketsResponse(items=items, limit=limit, offset=offset)


@router.post("/tickets", response_model=CRMTicket, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTicketCreate,
) -> CRMTicket:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_ticket(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTicket.model_validate(row)


@router.get("/tickets/{ticket_id}", response_model=CRMTicket)
async def get_ticket(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    ticket_id: UUID,
) -> CRMTicket:
    try:
        row = await repo.get_ticket(organizacion_id=organizacion_id, ticket_id=ticket_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_no_encontrado")
    return CRMTicket.model_validate(row)


@router.get(
    "/tickets/{ticket_id}/comentarios",
    response_model=list[CRMTicketComment],
)
async def list_ticket_comments(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    ticket_id: UUID,
) -> list[CRMTicketComment]:
    try:
        rows = await repo.list_ticket_comments(
            organizacion_id=organizacion_id,
            ticket_id=ticket_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMTicketComment.model_validate(row) for row in rows]


@router.post(
    "/tickets/{ticket_id}/comentarios",
    response_model=CRMTicketComment,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket_comment(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    ticket_id: UUID,
    payload: CRMTicketCommentCreate,
) -> CRMTicketComment:
    if payload.ticket_id != ticket_id:
        raise HTTPException(status_code=400, detail="ticket_id_mismatch")
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("autor_usuario_id") and usuario_id:
        body["autor_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_ticket_comment(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTicketComment.model_validate(row)


@router.get("/archivos", response_model=list[CRMFile])
async def list_files(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    relacion_tipo: str | None = Query(default=None),
    relacion_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[CRMFile]:
    try:
        rows = await repo.list_files(
            organizacion_id=organizacion_id,
            relacion_tipo=relacion_tipo,
            relacion_id=relacion_id,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMFile.model_validate(row) for row in rows]


@router.post("/archivos", response_model=CRMFile, status_code=status.HTTP_201_CREATED)
async def create_file(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMFileCreate,
) -> CRMFile:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("subido_por_usuario_id") and usuario_id:
        body["subido_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_file(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMFile.model_validate(row)


@router.get("/tags", response_model=list[CRMTag])
async def list_tags(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMTag]:
    try:
        rows = await repo.list_tags(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMTag.model_validate(row) for row in rows]


@router.post("/tags", response_model=CRMTag, status_code=status.HTTP_201_CREATED)
async def create_tag(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTagCreate,
) -> CRMTag:
    try:
        row = await repo.create_tag(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTag.model_validate(row)


@router.post("/taggings", response_model=CRMTagging, status_code=status.HTTP_201_CREATED)
async def create_tagging(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTaggingCreate,
) -> CRMTagging:
    try:
        row = await repo.create_tagging(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTagging.model_validate(row)


@router.delete(
    "/taggings/{tagging_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tagging(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    tagging_id: UUID,
) -> Response:
    try:
        await repo.delete_tagging(organizacion_id=organizacion_id, tagging_id=tagging_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/productos", response_model=list[CRMProduct])
async def list_products(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    activos: bool | None = Query(default=None),
) -> list[CRMProduct]:
    try:
        rows = await repo.list_products(organizacion_id=organizacion_id, activos=activos)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMProduct.model_validate(row) for row in rows]


@router.post("/productos", response_model=CRMProduct, status_code=status.HTTP_201_CREATED)
async def create_product(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMProductCreate,
) -> CRMProduct:
    try:
        row = await repo.create_product(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMProduct.model_validate(row)


@router.get("/cotizaciones", response_model=list[CRMQuote])
async def list_quotes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID | None = Query(default=None),
) -> list[CRMQuote]:
    try:
        rows = await repo.list_quotes(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMQuote.model_validate(row) for row in rows]


@router.post("/cotizaciones", response_model=CRMQuote, status_code=status.HTTP_201_CREATED)
async def create_quote(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMQuoteCreate,
) -> CRMQuote:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("creada_por_usuario_id") and usuario_id:
        body["creada_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_quote(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMQuote.model_validate(row)


@router.get("/cotizaciones/{cotizacion_id}/items", response_model=list[CRMQuoteItem])
async def list_quote_items(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cotizacion_id: UUID,
) -> list[CRMQuoteItem]:
    try:
        rows = await repo.list_quote_items(
            organizacion_id=organizacion_id,
            cotizacion_id=cotizacion_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMQuoteItem.model_validate(row) for row in rows]


@router.post(
    "/cotizaciones/{cotizacion_id}/items",
    response_model=CRMQuoteItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_quote_item(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cotizacion_id: UUID,
    payload: CRMQuoteItemCreate,
) -> CRMQuoteItem:
    if payload.cotizacion_id != cotizacion_id:
        raise HTTPException(status_code=400, detail="cotizacion_id_mismatch")
    try:
        row = await repo.add_quote_item(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMQuoteItem.model_validate(row)


@router.get("/campanas", response_model=list[CRMCampaign])
async def list_campaigns(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMCampaign]:
    try:
        rows = await repo.list_campaigns(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMCampaign.model_validate(row) for row in rows]


@router.post("/campanas", response_model=CRMCampaign, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMCampaignCreate,
) -> CRMCampaign:
    try:
        row = await repo.create_campaign(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMCampaign.model_validate(row)


@router.get("/leads", response_model=list[CRMLead])
async def list_leads(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    estado: str | None = Query(default=None),
) -> list[CRMLead]:
    try:
        rows = await repo.list_leads(organizacion_id=organizacion_id, estado=estado)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMLead.model_validate(row) for row in rows]


@router.post("/leads", response_model=CRMLead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMLeadCreate,
) -> CRMLead:
    try:
        row = await repo.create_lead(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMLead.model_validate(row)


@router.get("/leads/{lead_id}/eventos", response_model=list[CRMLeadEvent])
async def list_lead_events(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    lead_id: UUID,
) -> list[CRMLeadEvent]:
    try:
        rows = await repo.list_lead_events(
            organizacion_id=organizacion_id,
            lead_id=lead_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMLeadEvent.model_validate(row) for row in rows]


@router.post(
    "/leads/{lead_id}/eventos",
    response_model=CRMLeadEvent,
    status_code=status.HTTP_201_CREATED,
)
async def create_lead_event(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    lead_id: UUID,
    payload: CRMLeadEventCreate,
) -> CRMLeadEvent:
    if payload.lead_id != lead_id:
        raise HTTPException(status_code=400, detail="lead_id_mismatch")
    try:
        row = await repo.create_lead_event(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMLeadEvent.model_validate(row)


@router.get("/leads/restarts", response_model=list[CRMContactRestartStat])
async def list_lead_restart_stats(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    min_restart_sequence: Annotated[int, Query(ge=1, le=100)] = 2,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[CRMContactRestartStat]:
    try:
        rows = await repo.contact_restart_stats(
            organizacion_id=organizacion_id,
            min_restart_sequence=min_restart_sequence,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMContactRestartStat.model_validate(row) for row in rows]


@router.get("/notas", response_model=list[CRMNote])
async def list_notes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    relacion_tipo: str | None = Query(default=None),
    relacion_id: UUID | None = Query(default=None),
) -> list[CRMNote]:
    try:
        rows = await repo.list_notes(
            organizacion_id=organizacion_id,
            relacion_tipo=relacion_tipo,
            relacion_id=relacion_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMNote.model_validate(row) for row in rows]


@router.post("/notas", response_model=CRMNote, status_code=status.HTTP_201_CREATED)
async def create_note(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMNoteCreate,
) -> CRMNote:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("creado_por_usuario_id") and usuario_id:
        body["creado_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_note(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMNote.model_validate(row)


@router.get("/audit_logs", response_model=list[CRMAuditLog])
async def list_audit_logs(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMAuditLog]:
    try:
        rows = await repo.list_audit_logs(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMAuditLog.model_validate(row) for row in rows]


@router.get(
    "/whatsapp/asignaciones",
    response_model=WhatsAppSalesAssignmentsResponse,
)
async def list_whatsapp_sales_assignments(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WhatsAppSalesAssignmentsResponse:
    try:
        rows = await repo.list_whatsapp_sales_assignments(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [WhatsAppSalesAssignment.model_validate(row) for row in rows]
    return WhatsAppSalesAssignmentsResponse(items=items, limit=limit, offset=offset)


@router.get("/pipeline/overview", response_model=CRMPipelineOverview)
async def pipeline_overview(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=10, le=500)] = 200,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> CRMPipelineOverview:
    created_from = datetime.now(timezone.utc) - timedelta(days=days)
    fetch_limit = max(limit, 500)
    try:
        rows, total_rows = await repo.list_pipeline_opportunities(
            organizacion_id=organizacion_id,
            limit=fetch_limit,
            created_from=created_from,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    overview = _build_pipeline_overview(rows, total_rows, limit, days)
    return overview


@router.get("/pipeline/board", response_model=CRMPipelineBoard)
async def pipeline_board(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(ge=50, le=1000)] = 400,
    tablero_id: UUID | None = Query(default=None),
) -> CRMPipelineBoard:
    """Construir el board del pipeline filtrando opcionalmente por tablero."""

    try:
        try:
            await repo.ensure_prospeccion_stage(organizacion_id=organizacion_id)
        except CRMRepositoryError as stage_exc:
            logger.warning("crm.ensure_prospeccion_stage_failed", extra={"error": str(stage_exc)})

        stages = await repo.list_pipelines(organizacion_id=organizacion_id, tablero_id=tablero_id)
        rows, _ = await repo.list_pipeline_opportunities(
            organizacion_id=organizacion_id,
            limit=limit,
            tablero_id=tablero_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    visitors = 0
    try:
        kpis_payload = await repo.visitas_dashboard_kpis(usuario_token=user_token)
        visitors = _extract_visitas_sin_chat(kpis_payload)
    except CRMRepositoryError:
        visitors = 0

    board = _build_pipeline_board(stages, rows, tablero_id)
    return CRMPipelineBoard(
        stages=board.stages,
        sin_conversacion=board.sin_conversacion,
        visitantes_sin_chat=visitors,
    )


@router.get("/analytics/catalog/ventas")
async def analytics_catalog_sales(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    mes_desde: Annotated[str | None, Query(description="YYYY-MM-01")] = None,
    mes_hasta: Annotated[str | None, Query(description="YYYY-MM-01")] = None,
    moneda: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
) -> dict[str, Any]:
    try:
        rows = await repo.analytics_catalog_sales(
            usuario_token=user_token,
            mes_desde=mes_desde,
            mes_hasta=mes_hasta,
            moneda=moneda,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "rows": rows}


@router.get("/analytics/catalog/embudo")
async def analytics_catalog_pipeline(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    tablero_id: UUID | None = Query(default=None),
    etapa_id: UUID | None = Query(default=None),
) -> dict[str, Any]:
    try:
        rows = await repo.analytics_catalog_pipeline(
            usuario_token=user_token,
            tablero_id=tablero_id,
            etapa_id=etapa_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "rows": rows}


@router.get("/analytics/catalog/ventas/export")
async def analytics_catalog_sales_export(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    mes_desde: Annotated[str | None, Query(description="YYYY-MM-01")] = None,
    mes_hasta: Annotated[str | None, Query(description="YYYY-MM-01")] = None,
    moneda: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
) -> Response:
    try:
        rows = await repo.analytics_catalog_sales(
            usuario_token=user_token,
            mes_desde=mes_desde,
            mes_hasta=mes_hasta,
            moneda=moneda,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    csv_content = _render_catalog_sales_csv(rows)
    filename = _catalog_sales_filename(mes_desde, mes_hasta, moneda)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/dashboard/kpis")
async def dashboard_kpis(
    *,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
) -> dict[str, Any]:
    date_from, date_to = _resolve_date_range(rango, desde, hasta)
    try:
        payload = await repo.visitas_dashboard_kpis(
            usuario_token=user_token,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "kpis": payload,
        "range": {
            "preset": (rango or "").strip().lower() or None,
            "from": _format_utc(date_from) if date_from else None,
            "to": _format_utc(date_to) if date_to else None,
        },
    }


@router.get("/demografia/resumen")
async def demografia_resumen(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    user_token: str = Depends(require_user_token),
    nivel: Annotated[str, Query(pattern="^(pais|estado|municipio)$")] = "estado",
    canales: str | None = Query(default=None),
    etapas: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
) -> dict[str, Any]:
    nivel_normalizado = (nivel or "estado").strip().lower() or "estado"
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
            jwt=user_token,
        )
        visitantes_payload = await demografia_service.fetch_visitantes_resumen(
            nivel=nivel_normalizado,
            date_from=date_from,
            date_to=date_to,
        )
    except DemografiaServiceError as exc:
        logger.exception("crm.demografia.resumen_failed")
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


@router.get("/demografia/mapa")
async def demografia_mapa(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    user_token: str = Depends(require_user_token),
    nivel: Annotated[str, Query(pattern="^(pais|estado|municipio)$")] = "estado",
    estado: str | None = Query(default=None),
    canales: str | None = Query(default=None),
    etapas: str | None = Query(default=None),
    rango: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
) -> dict[str, Any]:
    nivel_normalizado = (nivel or "estado").strip().lower() or "estado"
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
            jwt=user_token,
        )
        fallback_leads_payload = None
        if nivel_normalizado == "municipio":
            fallback_leads_payload = await demografia_service.fetch_leads_resumen(
                nivel="estado",
                channels=channel_values,
                stages=stage_values,
                date_from=date_from,
                date_to=date_to,
                jwt=user_token,
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
    except DemografiaServiceError as exc:
        logger.exception("crm.demografia.mapa_failed")
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
    except FileNotFoundError as exc:  # pragma: no cover - depende del despliegue
        logger.exception("crm.demografia.geo_missing")
        raise HTTPException(status_code=500, detail="geojson_missing") from exc
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


@router.get("/demografia/geo/estados")
async def demografia_geo_estados(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
) -> dict[str, Any]:
    try:
        geojson = leads_geo.load_states_geojson()
    except FileNotFoundError as exc:  # pragma: no cover - depende del despliegue
        logger.exception("crm.demografia.geo.states_missing")
        raise HTTPException(status_code=500, detail="geojson_missing") from exc
    return {"ok": True, "geojson": geojson}


@router.get("/demografia/geo/municipios/{estado}")
async def demografia_geo_municipios(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
    estado: str,
) -> dict[str, Any]:
    code = _ensure_state_code(estado)
    try:
        geojson = leads_geo.load_state_municipalities_geojson(code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="estado_not_found") from exc
    return {"ok": True, "geojson": geojson}


@router.get("/demografia/geo/paises")
async def demografia_geo_paises(
    *,
    organizacion_id: UUID = Depends(require_organizacion_id),  # noqa: ARG001
) -> dict[str, Any]:
    try:
        geojson = leads_geo.load_world_countries_geojson()
    except FileNotFoundError as exc:  # pragma: no cover - depende del despliegue
        logger.exception("crm.demografia.geo.world_missing")
        raise HTTPException(status_code=500, detail="geojson_missing") from exc
    return {"ok": True, "geojson": geojson}


def _build_pipeline_overview(
    rows: list[dict[str, Any]],
    total_rows: int,
    table_limit: int,
    days_range: int,
) -> CRMPipelineOverview:
    cards = _build_pipeline_cards(rows)
    chart = _build_pipeline_chart(rows, days_range)
    table = _build_pipeline_table(rows, table_limit)
    return CRMPipelineOverview(cards=cards, chart=chart, table=table, total_rows=total_rows)


def _extract_visitas_sin_chat(payload: dict[str, Any] | None) -> int:
    if not isinstance(payload, dict):
        return 0
    webchat = payload.get("webchat")
    if isinstance(webchat, dict):
        for key in (
            "visitas_sin_chat",
            "visitantes_sin_chat",
            "sin_chat",
            "sin_conversacion",
        ):
            value = webchat.get(key)
            if isinstance(value, (int, float)):
                return int(value)
    for key in ("visitantes", "visitantes_sin_chat", "visitas_sin_chat", "total"):
        value = payload.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return 0


def _render_catalog_sales_csv(rows: Sequence[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "mes",
            "producto",
            "moneda",
            "total_vendido",
            "unidades_vendidas",
            "leads_ganados",
        ]
    )
    for row in rows:
        if not isinstance(row, dict):
            continue
        writer.writerow(
            [
                row.get("mes") or "",
                row.get("item_nombre") or "",
                (row.get("moneda") or "MXN").upper(),
                row.get("total_vendido") or 0,
                row.get("unidades_vendidas") or 0,
                row.get("leads_ganados") or 0,
            ]
        )
    return output.getvalue()


def _catalog_sales_filename(
    mes_desde: str | None, mes_hasta: str | None, moneda: str | None
) -> str:
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


def _build_pipeline_cards(rows: list[dict[str, Any]]) -> CRMPipelineCards:
    now = datetime.now(timezone.utc)
    nuevas_threshold = now - timedelta(days=1)
    abiertas = ganadas = perdidas = nuevas = 0
    monto_total = 0.0
    top_counter: Counter[str] = Counter()
    top_names: dict[str, str] = {}

    for row in rows:
        estado = (row.get("estado") or "").lower()
        if estado == "ganada":
            ganadas += 1
        elif estado == "perdida":
            perdidas += 1
        else:
            abiertas += 1
        monto = row.get("monto_estimado")
        if isinstance(monto, (int, float)):
            monto_total += float(monto)
        created_at = _parse_datetime(row.get("creado_en"))
        if created_at and created_at >= nuevas_threshold:
            nuevas += 1
        asignado = row.get("asignado") or {}
        user_id = asignado.get("id") or row.get("asignado_a_usuario_id")
        display_name = asignado.get("nombre_completo") or asignado.get("correo")
        if user_id:
            key = str(user_id)
            top_counter[key] += 1
            if display_name:
                top_names[key] = display_name

    top_vendedor = None
    if top_counter:
        user_key, total = top_counter.most_common(1)[0]
        top_vendedor = CRMPipelineTopSeller(
            id=_safe_uuid(user_key),
            nombre=top_names.get(user_key),
            total=total,
        )

    return CRMPipelineCards(
        total=len(rows),
        abiertas=abiertas,
        ganadas=ganadas,
        perdidas=perdidas,
        nuevas=nuevas,
        monto_total=monto_total,
        top_vendedor=top_vendedor,
    )


def _build_pipeline_chart(
    rows: list[dict[str, Any]], days_range: int
) -> list[CRMPipelineChartPoint]:
    if days_range < 1:
        days_range = 1
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days_range - 1)
    buckets: dict[date, CRMPipelineChartPoint] = {}
    for offset in range(days_range):
        bucket_date = start_date + timedelta(days=offset)
        buckets[bucket_date] = CRMPipelineChartPoint(
            date=bucket_date.isoformat(),
            nuevos=0,
            ganados=0,
            perdidos=0,
        )

    for row in rows:
        created_at = _parse_datetime(row.get("creado_en"))
        if created_at:
            bucket = buckets.get(created_at.date())
            if bucket:
                bucket.nuevos += 1
        estado = (row.get("estado") or "").lower()
        cerrado_at = _parse_datetime(row.get("cerrado_en"))
        if not cerrado_at:
            continue
        bucket = buckets.get(cerrado_at.date())
        if not bucket:
            continue
        if estado == "ganada":
            bucket.ganados += 1
        elif estado == "perdida":
            bucket.perdidos += 1

    return [buckets[bucket_date] for bucket_date in sorted(buckets)]


def _build_pipeline_table(
    rows: list[dict[str, Any]], table_limit: int
) -> list[CRMPipelineTableRow]:
    sorted_rows = sorted(
        rows,
        key=lambda r: _parse_datetime(r.get("creado_en"))
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    table: list[CRMPipelineTableRow] = []
    for index, row in enumerate(sorted_rows[:table_limit], start=1):
        etapa = row.get("etapa") or {}
        contacto = row.get("contacto") or {}
        asignado = row.get("asignado") or {}
        propietario = row.get("propietario") or {}
        cuenta = row.get("cuenta") or {}
        categoria = (etapa.get("categoria") or row.get("estado") or "abierta").lower()
        cerrado_dt = _parse_datetime(row.get("cerrado_en"))
        monto_estimado = row.get("monto_estimado")
        moneda = row.get("moneda") or "MXN"
        metric_meta = {
            "value": monto_estimado,
            "currency": moneda,
            "formatted": _format_currency(monto_estimado, moneda),
        }
        status_meta = _build_status_meta(categoria, cerrado_dt)
        header = (
            row.get("titulo")
            or contacto.get("nombre_completo")
            or cuenta.get("nombre")
            or "Oportunidad sin nombre"
        )
        reviewer = asignado.get("nombre_completo") or "Sin asignar"
        table.append(
            CRMPipelineTableRow(
                id=index,
                header=header,
                type=etapa.get("nombre") or "Sin etapa",
                status=categoria,
                target=str(monto_estimado or 0),
                limit=contacto.get("correo") or "—",
                reviewer=reviewer,
                raw={
                    "lead_id": row.get("id"),
                    "contacto_id": contacto.get("id"),
                    "etapa_id": row.get("etapa_id"),
                    "etapa_nombre": etapa.get("nombre"),
                    "etapa_codigo": etapa.get("codigo"),
                    "etapa_metadatos": etapa.get("metadata"),
                    "categoria": categoria,
                    "canal": (row.get("metadata") or {}).get("canal"),
                    "creado_en": row.get("creado_en"),
                    "actualizado_en": row.get("actualizado_en"),
                    "cerrado_en": row.get("cerrado_en"),
                    "monto_estimado": monto_estimado,
                    "moneda": moneda,
                    "probabilidad": row.get("probabilidad"),
                    "proyecto_nombre": row.get("descripcion"),
                    "lead_score": (row.get("metadata") or {}).get("lead_score"),
                    "asignado_id": row.get("asignado_a_usuario_id"),
                    "asignado_nombre": reviewer,
                    "propietario_id": row.get("propietario_usuario_id"),
                    "propietario_nombre": propietario.get("nombre_completo"),
                    "contacto_correo": contacto.get("correo"),
                    "contacto_telefono": contacto.get("telefono_e164"),
                    "contacto_empresa": contacto.get("company_name"),
                    "contacto_notas": contacto.get("notes"),
                    "contacto_estado": contacto.get("estado") or contacto.get("captura_estado"),
                    "motivo_cierre": row.get("motivo_perdida"),
                    "tags": (row.get("metadata") or {}).get("tags"),
                    "metadata": row.get("metadata"),
                    "status_meta": status_meta,
                    "metric_meta": metric_meta,
                },
            )
        )
    return table


def _build_status_meta(categoria: str, cerrado_en: datetime | None) -> dict[str, str]:
    if categoria == "ganada":
        return {"label": "Ganado", "variant": "default"}
    if categoria == "perdida":
        return {"label": "Perdido", "variant": "destructive"}
    if cerrado_en:
        return {"label": "Cerrado", "variant": "secondary"}
    return {"label": "En proceso", "variant": "outline"}


def _format_currency(value: Any, currency: str) -> str:
    if not isinstance(value, (int, float)):
        return "—"
    formatted = f"{value:,.0f}"
    return f"{formatted} {currency}".strip()


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _safe_uuid(value: str | UUID | None) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except ValueError:
            return None
    return None


def _build_pipeline_board(
    stage_rows: list[dict[str, Any]],
    opportunity_rows: list[dict[str, Any]],
    tablero_id: UUID | None = None,
) -> CRMPipelineBoard:
    """Construye el board filtrando etapas y tarjetas por tablero."""

    tablero_filter = str(tablero_id) if tablero_id else None
    if tablero_filter is None:
        tablero_filter = _infer_tablero_id(stage_rows, opportunity_rows)
    stage_map: dict[UUID, CRMPipelineBoardStage] = {}
    for stage_row in stage_rows:
        stage = _stage_from_row(stage_row)
        if not stage:
            continue
        if (
            tablero_filter
            and not stage.tablero_id
            and (stage.codigo or "").lower() == "prospeccion_primer_contacto"
        ):
            stage = CRMPipelineBoardStage(
                **{
                    **stage.model_dump(),
                    "tablero_id": tablero_filter,
                }
            )
        if tablero_filter and stage.tablero_id != tablero_filter:
            continue
        stage_map[stage.id] = stage

    sin_conversacion: list[CRMPipelineBoardCard] = []

    for row in opportunity_rows:
        card = _card_from_opportunity(row)
        if card is None:
            continue
        card_tablero_id = _tablero_id_from_metadata(card.metadata)
        stage = stage_map.get(card.etapa_id)
        stage_tablero_id = stage.tablero_id if stage else _tablero_id_from_row(row)
        if tablero_filter:
            if card_tablero_id and card_tablero_id != tablero_filter:
                continue
            if stage_tablero_id and stage_tablero_id != tablero_filter:
                continue
            if not card_tablero_id and not stage_tablero_id:
                continue
        if stage is None:
            stage = _stage_from_opportunity(row)
            if stage and (not tablero_filter or stage.tablero_id == tablero_filter):
                stage_map[stage.id] = stage
        if stage:
            stage.tarjetas.append(card)
        if not card.conversacion_id and not _is_manual_card(card.metadata):
            sin_conversacion.append(card)

    for stage in stage_map.values():
        stage.tarjetas.sort(
            key=lambda card: card.actualizado_en or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

    ordered_stages = sorted(
        stage_map.values(),
        key=lambda stage: (stage.orden, stage.nombre.lower()),
    )

    sin_conversacion.sort(
        key=lambda card: card.actualizado_en or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )

    return CRMPipelineBoard(
        stages=ordered_stages,
        sin_conversacion=sin_conversacion,
        visitantes_sin_chat=0,
    )


def _infer_tablero_id(
    stage_rows: list[dict[str, Any]], opportunity_rows: list[dict[str, Any]]
) -> str | None:
    """Determina el tablero más representativo cuando no se especifica."""

    stage_order: list[str] = []
    for row in stage_rows:
        tablero_from_metadata = _tablero_id_from_metadata(
            _ensure_dict(row.get("metadata") or row.get("metadatos"), default={})
        )
        tablero_from_column = _tablero_id_from_metadata({"tablero_id": row.get("tablero_id")})
        candidate = tablero_from_metadata or tablero_from_column
        if candidate and candidate not in stage_order:
            stage_order.append(candidate)

    tablero_counts: dict[str, int] = {}
    for row in opportunity_rows:
        candidates = {
            _tablero_id_from_metadata(_ensure_dict(row.get("metadata"), default={})),
            _tablero_id_from_metadata({"tablero_id": row.get("tablero_id")}),
            _tablero_id_from_row(row),
        }
        candidates.discard(None)
        for candidate in candidates:
            tablero_counts[candidate] = tablero_counts.get(candidate, 0) + 1

    if tablero_counts:
        best_tablero = max(
            tablero_counts.items(),
            key=lambda item: (
                item[1],
                (-stage_order.index(item[0]) if item[0] in stage_order else -len(stage_order)),
            ),
        )[0]
        return best_tablero

    if len(stage_order) == 1:
        return stage_order[0]
    return None


async def _build_pipeline_card_response(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    oportunidad_id: UUID,
) -> CRMPipelineCardResponse:
    row = await repo.get_pipeline_opportunity(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="opportunity_not_found")
    stage = _stage_from_opportunity(row)
    card = _card_from_opportunity(row)
    if stage is None or card is None:
        raise HTTPException(status_code=404, detail="pipeline_card_unavailable")
    return CRMPipelineCardResponse(stage=stage, card=card)


def _history_item_from_row(row: dict[str, Any]) -> CRMPipelineHistoryItem:
    history_id = _safe_uuid(row.get("id"))
    if history_id is None:
        raise HTTPException(status_code=502, detail="history_entry_missing_id")
    opportunity_id = _safe_uuid(row.get("oportunidad_id"))
    if opportunity_id is None:
        raise HTTPException(status_code=502, detail="history_entry_missing_opportunity")
    metadata = _ensure_dict(row.get("metadata"), default={})
    tipo = metadata.get("tipo") or "movimiento"
    nota = metadata.get("nota")
    cambiado_por = _ensure_dict(row.get("cambiado_por"), default={})
    etapa_origen = _ensure_dict(row.get("etapa_origen"), default={})
    etapa_destino = _ensure_dict(row.get("etapa_destino"), default={})
    return CRMPipelineHistoryItem(
        id=history_id,
        oportunidad_id=opportunity_id,
        tipo=str(tipo),
        cambiado_en=_parse_datetime(row.get("cambiado_en")),
        cambiado_por_id=_safe_uuid(row.get("cambiado_por_usuario_id")),
        cambiado_por_nombre=cambiado_por.get("nombre_completo"),
        fuente=row.get("fuente"),
        etapa_origen_id=_safe_uuid(row.get("etapa_origen_id")),
        etapa_origen_nombre=etapa_origen.get("nombre"),
        etapa_destino_id=_safe_uuid(row.get("etapa_destino_id")),
        etapa_destino_nombre=etapa_destino.get("nombre"),
        motivo=row.get("motivo"),
        nota=nota if isinstance(nota, str) and nota.strip() else None,
        metadata=metadata or None,
    )


def _stage_from_row(row: dict[str, Any]) -> CRMPipelineBoardStage | None:
    stage_id = _safe_uuid(row.get("id"))
    if not stage_id:
        return None
    metadata = _ensure_dict(row.get("metadata") or row.get("metadatos"), default={})
    tablero_id = _tablero_id_from_metadata(metadata)
    tablero_from_column = _tablero_id_from_metadata({"tablero_id": row.get("tablero_id")})
    tablero_value = tablero_id or tablero_from_column
    return CRMPipelineBoardStage(
        id=stage_id,
        nombre=row.get("nombre") or "Sin etapa",
        codigo=row.get("codigo") or "",
        categoria=row.get("categoria") or "abierta",
        orden=int(row.get("orden") or 0),
        tablero_id=tablero_value,
        metadatos=metadata,
        tarjetas=[],
    )


def _stage_from_opportunity(row: dict[str, Any]) -> CRMPipelineBoardStage | None:
    etapa = row.get("etapa") or {}
    etapa_id = _safe_uuid(row.get("etapa_id") or etapa.get("id"))
    if not etapa_id:
        return None
    metadata = _ensure_dict(etapa.get("metadata") or etapa.get("metadatos"), default={})
    tablero_id = _tablero_id_from_metadata(metadata)
    tablero_from_column = _tablero_id_from_metadata({"tablero_id": etapa.get("tablero_id")})
    tablero_value = tablero_id or tablero_from_column
    return CRMPipelineBoardStage(
        id=etapa_id,
        nombre=etapa.get("nombre") or "Sin etapa",
        codigo=etapa.get("codigo") or "",
        categoria=etapa.get("categoria") or row.get("estado") or "abierta",
        orden=int(etapa.get("orden") or 0),
        tablero_id=tablero_value,
        metadatos=metadata,
        tarjetas=[],
    )


def _card_from_opportunity(row: dict[str, Any]) -> CRMPipelineBoardCard | None:
    oportunidad_id = _safe_uuid(row.get("id"))
    etapa_id = _safe_uuid(row.get("etapa_id"))
    if not oportunidad_id or not etapa_id:
        return None
    metadata = _ensure_dict(row.get("metadata"), default={})
    contacto = _ensure_dict(row.get("contacto"), default={})
    cuenta = _ensure_dict(row.get("cuenta"), default={})
    asignado = _ensure_dict(row.get("asignado"), default={})
    stored_project_name = metadata.get("project_name")
    raw_title = None
    if isinstance(stored_project_name, str) and stored_project_name.strip():
        raw_title = stored_project_name.strip()
    else:
        title_value = row.get("titulo")
        if isinstance(title_value, str) and title_value.strip():
            raw_title = title_value.strip()
    titulo_value = raw_title or cuenta.get("nombre") or "Oportunidad sin nombre"

    contacto_nombre = contacto.get("nombre_completo")
    if isinstance(contacto_nombre, str):
        contacto_nombre = contacto_nombre.strip()
    else:
        contacto_nombre = None
    nombre = contacto_nombre or titulo_value or cuenta.get("nombre") or "Oportunidad sin nombre"
    conversacion_id = _safe_uuid(metadata.get("conversacion_id"))
    asignado_nombre = asignado.get("nombre_completo") or asignado.get("correo")
    prioridad = metadata.get("lead_score")
    tags_value = metadata.get("tags")
    etiquetas = (
        [str(tag) for tag in tags_value if isinstance(tag, str)]
        if isinstance(tags_value, list)
        else None
    )
    actualizado_en = _parse_datetime(row.get("actualizado_en"))
    canal = metadata.get("canal") or metadata.get("channel")

    return CRMPipelineBoardCard(
        tarjeta_id=oportunidad_id,
        contacto_id=_safe_uuid(contacto.get("id")),
        conversacion_id=conversacion_id,
        titulo=titulo_value,
        nombre=nombre,
        correo=contacto.get("correo"),
        telefono=contacto.get("telefono_e164"),
        empresa=contacto.get("company_name"),
        notas=contacto.get("notes"),
        necesidad_proposito=contacto.get("necesidad_proposito"),
        canal=canal,
        estado=contacto.get("estado") or contacto.get("captura_estado"),
        etapa_id=etapa_id,
        etapa_nombre=(row.get("etapa") or {}).get("nombre") or "Sin etapa",
        etapa_codigo=(row.get("etapa") or {}).get("codigo"),
        monto=row.get("monto_estimado"),
        moneda=row.get("moneda"),
        probabilidad=row.get("probabilidad"),
        proyecto_nombre=row.get("descripcion"),
        proyecto_necesidades=metadata.get("proyecto_necesidades"),
        asignado_id=_safe_uuid(row.get("asignado_a_usuario_id")),
        asignado_nombre=asignado_nombre,
        prioridad=float(prioridad) if isinstance(prioridad, (int, float)) else None,
        actualizado_en=actualizado_en,
        etiquetas=etiquetas,
        metadata=metadata,
    )


# ---------------------------------------------------------------------------
# Prospección · Buscador web
# ---------------------------------------------------------------------------


class BuscadorTopDomain(BaseModel):
    domain: str
    count: int


class BuscadorTopSource(BaseModel):
    host: str
    count: int


class BuscadorStats(BaseModel):
    emails_total: int
    unique_email_domains: int
    unique_source_hosts: int
    top_email_domains: list[BuscadorTopDomain] = Field(default_factory=list)
    top_source_hosts: list[BuscadorTopSource] = Field(default_factory=list)


class BuscadorResultItem(BaseModel):
    id: UUID | None = None
    source_url: str
    email: str
    name: str | None = None
    position: str | None = None
    phone: str | None = None
    extension: str | None = None
    address: str | None = None


class BuscadorRunPayload(BaseModel):
    sitio: Literal["demo", "simple", "domain"] = "domain"
    url: HttpUrl | None = None
    mode: Literal["generic", "government", "intelligent", "auto", "stealth"] = "generic"
    max_pages: int = Field(default=200, ge=1, le=5000)
    max_depth: int = Field(default=3, ge=1, le=50)
    max_runtime: int | None = Field(default=None, ge=10, le=7200)
    max_queue_size: int | None = Field(default=None, ge=10, le=20000)
    max_no_new_emails: int | None = Field(default=None, ge=1, le=1000)
    max_memory_mb: int | None = Field(default=None, ge=64, le=8192)

    @model_validator(mode="after")
    def validate_url(self) -> BuscadorRunPayload:
        if self.sitio in {"simple", "domain"} and not self.url:
            raise ValueError("Debes proporcionar una URL para este tipo de scraper.")
        return self


class BuscadorJobParamsResponse(BaseModel):
    sitio: Literal["demo", "simple", "domain"]
    url: HttpUrl | None = None
    mode: Literal["generic", "government", "intelligent", "auto", "stealth"]
    max_pages: int
    max_depth: int
    max_runtime: int | None = None
    max_queue_size: int | None = None
    max_no_new_emails: int | None = None
    max_memory_mb: int | None = None


class BuscadorJobResponse(BaseModel):
    id: UUID
    status: Literal[
        "pending",
        "running",
        "pausing",
        "canceling",
        "completed",
        "failed",
        "paused",
        "canceled",
    ]
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    total: int | None = None
    stats: BuscadorStats | None = None
    error: str | None = None
    params: BuscadorJobParamsResponse


class BuscadorJobsListResponse(BaseModel):
    items: list[BuscadorJobResponse]
    total: int
    limit: int
    offset: int


class GuardarBuscadorProspectosPayload(BaseModel):
    result_ids: list[UUID] | None = None
    segmento: str | None = None
    save_all: bool = False


@router.post(
    "/prospeccion/buscador/run",
    response_model=BuscadorJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def prospeccion_buscador_run(
    payload: BuscadorRunPayload,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    usuario_id: UUID | None = Depends(optional_usuario_id),
) -> BuscadorJobResponse:
    """Agenda la ejecución del Buscador y devuelve el identificador del job."""

    params = BuscadorParams(
        sitio=payload.sitio,
        url=str(payload.url) if payload.url else None,
        mode=payload.mode,
        max_pages=payload.max_pages,
        max_depth=payload.max_depth,
        max_runtime=payload.max_runtime,
        max_queue_size=payload.max_queue_size,
        max_no_new_emails=payload.max_no_new_emails,
        max_memory_mb=payload.max_memory_mb,
    )

    job_payload: dict[str, Any] = {
        "status": "pending",
        "params": _params_to_dict(params),
    }
    if usuario_id:
        job_payload["creado_por"] = str(usuario_id)

    try:
        job_row = await repo.create_buscador_job(usuario_token=user_token, payload=job_payload)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    BUSCADOR_JOB_MANAGER.schedule_job(repo=repo, job_row=job_row, params=params)
    return _job_row_to_response(job_row)


@router.get(
    "/prospeccion/buscador/jobs",
    response_model=BuscadorJobsListResponse,
)
async def prospeccion_buscador_jobs(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> BuscadorJobsListResponse:
    try:
        rows, total = await repo.list_buscador_jobs(
            usuario_token=user_token,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return BuscadorJobsListResponse(
        items=[_job_row_to_response(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/prospeccion/buscador/jobs/{job_id}",
    response_model=BuscadorJobResponse,
)
async def prospeccion_buscador_job_detail(
    job_id: UUID,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> BuscadorJobResponse:
    try:
        job_row = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not job_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Buscador job no encontrado"
        )
    return _job_row_to_response(job_row)


@router.delete(
    "/prospeccion/buscador/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def prospeccion_buscador_job_delete(
    job_id: UUID,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> Response:
    try:
        deleted = await repo.delete_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if deleted <= 0:
        raise HTTPException(status_code=404, detail="Buscador job no encontrado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/prospeccion/buscador/jobs/{job_id}/pause",
    response_model=BuscadorJobResponse,
)
async def prospeccion_buscador_job_pause(
    job_id: UUID,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> BuscadorJobResponse:
    try:
        job_row = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not job_row:
        raise HTTPException(status_code=404, detail="Buscador job no encontrado")
    status_value = str(job_row.get("status") or "pending")
    if status_value != "running":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El job no está en ejecución",
        )
    if not BUSCADOR_JOB_MANAGER.request_pause(job_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El job ya finalizó",
        )
    try:
        updated_row = await repo.worker_update_buscador_job(
            job_id=job_id,
            payload={"status": "pausing"},
            strict=False,
            extra_filters={"status": "eq.running"},
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not updated_row:
        refreshed = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
        if not refreshed:
            raise HTTPException(status_code=404, detail="Buscador job no encontrado")
        return _job_row_to_response(refreshed)
    return _job_row_to_response(updated_row)


@router.post(
    "/prospeccion/buscador/jobs/{job_id}/cancel",
    response_model=BuscadorJobResponse,
)
async def prospeccion_buscador_job_cancel(
    job_id: UUID,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> BuscadorJobResponse:
    try:
        job_row = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not job_row:
        raise HTTPException(status_code=404, detail="Buscador job no encontrado")
    status_value = str(job_row.get("status") or "pending")
    if status_value not in {"running", "pending"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El job no puede cancelarse en su estado actual",
        )
    if not BUSCADOR_JOB_MANAGER.request_cancel(job_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El job ya finalizó",
        )
    filters = {"or": "(status.eq.running,status.eq.pending)"}
    try:
        updated_row = await repo.worker_update_buscador_job(
            job_id=job_id,
            payload={"status": "canceling"},
            strict=False,
            extra_filters=filters,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not updated_row:
        refreshed = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
        if not refreshed:
            raise HTTPException(status_code=404, detail="Buscador job no encontrado")
        return _job_row_to_response(refreshed)
    return _job_row_to_response(updated_row)


@router.get("/prospeccion/buscador/jobs/{job_id}/results")
async def prospeccion_buscador_job_results(
    job_id: UUID,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
    limit: Annotated[int, Query(gt=0, le=2000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> JSONResponse:
    try:
        job_row = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not job_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Buscador job no encontrado"
        )
    status_value = str(job_row.get("status") or "pending")
    if status_value not in {"completed", "paused", "canceled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El job aún no ha finalizado",
        )
    effective_limit = min(limit, 2000)
    try:
        rows = await repo.list_buscador_resultados(
            usuario_token=user_token, job_id=job_id, limit=effective_limit, offset=offset
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stats_value = job_row.get("stats")
    stats = BuscadorStats(**stats_value).model_dump(mode="json") if isinstance(stats_value, dict) else None
    items = [_buscador_result_row_to_item(row).model_dump(mode="json") for row in rows]
    total_value = job_row.get("total")
    if not total_value and isinstance(stats_value, dict):
        total_value = stats_value.get("emails_total")
    total = total_value or len(items)
    return JSONResponse(
        {
            "items": items,
            "total": total,
            "stats": stats,
        }
    )


@router.post("/prospeccion/buscador/jobs/{job_id}/prospectos")
async def prospeccion_buscador_guardar_prospectos(
    job_id: UUID,
    payload: GuardarBuscadorProspectosPayload,
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    BATCH_SIZE = 200
    FETCH_ALL_LIMIT = 1000
    save_all = payload.save_all
    result_id_list = list(payload.result_ids or [])
    if not save_all and not result_id_list:
        raise HTTPException(status_code=400, detail="result_ids_required")
    try:
        job_row = await repo.get_buscador_job(job_id=job_id, usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not job_row:
        raise HTTPException(status_code=404, detail="Buscador job no encontrado")
    try:
        existing_result_ids = await repo.list_buscador_prospecto_result_ids(
            usuario_token=user_token,
            job_id=job_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    requested_total = len(result_id_list)
    if save_all:
        requested_total = int(job_row.get("total") or 0) or requested_total
    logger.info(
        "buscador.prospectos.save_start",
        extra={
            "job_id": str(job_id),
            "segmento": payload.segmento,
            "result_ids_count": requested_total,
            "save_all": save_all,
            "existing_result_ids": len(existing_result_ids),
        },
    )

    rows: list[dict[str, Any]] = []
    fetched_ids: set[str] = set(existing_result_ids)
    if save_all:
        offset = 0
        while True:
            try:
                chunk_rows = await repo.list_buscador_resultados(
                    usuario_token=user_token,
                    job_id=job_id,
                    limit=FETCH_ALL_LIMIT,
                    offset=offset,
                )
            except CRMRepositoryError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            if not chunk_rows:
                break
            for row in chunk_rows:
                row_id = row.get("id")
                if not row_id:
                    continue
                row_id_str = str(row_id)
                if row_id_str in fetched_ids:
                    continue
                fetched_ids.add(row_id_str)
                rows.append(row)
            offset += len(chunk_rows)
            if len(chunk_rows) < FETCH_ALL_LIMIT:
                break
    else:
        for start in range(0, len(result_id_list), BATCH_SIZE):
            chunk_ids = result_id_list[start : start + BATCH_SIZE]
            try:
                chunk_rows = await repo.list_buscador_resultados_by_ids(
                    usuario_token=user_token,
                    job_id=job_id,
                    result_ids=chunk_ids,
                )
            except CRMRepositoryError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            for row in chunk_rows:
                row_id = row.get("id")
                if not row_id:
                    continue
                row_id_str = str(row_id)
                if row_id_str in fetched_ids:
                    continue
                fetched_ids.add(row_id_str)
                rows.append(row)
    if not rows:
        logger.info(
            "buscador.prospectos.no_new_rows",
            extra={
                "job_id": str(job_id),
                "result_ids_count": requested_total,
                "save_all": save_all,
            },
        )
        return {"ok": True, "prospectos": [], "total": 0}

    segmento_value = (payload.segmento or "").strip() or None
    prospectos: list[dict[str, Any]] = []
    for row in rows:
        prospecto_payload = _buscador_result_to_prospecto(
            row=row,
            job_id=job_id,
            segmento=segmento_value,
        )
        if prospecto_payload:
            prospectos.append(prospecto_payload)

    if not prospectos:
        logger.info(
            "buscador.prospectos.no_payload_after_filter",
            extra={"job_id": str(job_id), "rows_considered": len(rows)},
        )
        return {"ok": True, "prospectos": [], "total": 0}

    try:
        created = await repo.bulk_insert_prospectos(usuario_token=user_token, items=prospectos)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    logger.info(
        "buscador.prospectos.save_completed",
        extra={
            "job_id": str(job_id),
            "result_ids_count": requested_total,
            "rows_considered": len(rows),
            "save_all": save_all,
            "prospectos_created": len(created),
        },
    )

    return {"ok": True, "prospectos": created, "total": len(created)}


@router.get("/prospeccion/stage-resumen")
async def prospeccion_stage_resumen(
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    try:
        summary = await repo.get_prospeccion_stage_summary(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"stages": summary}


@router.get("/prospeccion/prospectos/checklist")
async def prospeccion_prospectos_checklist(
    repo: CRMRepository = Depends(get_repository),
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    try:
        resumen = await repo.get_prospeccion_enriquecimiento_resumen(usuario_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"checklist": resumen}


def _ensure_dict(value: Any, default: dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return dict(default)


def _params_to_dict(params: BuscadorParams) -> dict[str, Any]:
    return {
        "sitio": params.sitio,
        "url": params.url,
        "mode": params.mode,
        "max_pages": params.max_pages,
        "max_depth": params.max_depth,
        "max_runtime": params.max_runtime,
        "max_queue_size": params.max_queue_size,
        "max_no_new_emails": params.max_no_new_emails,
        "max_memory_mb": params.max_memory_mb,
    }


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        if trimmed.endswith("Z"):
            trimmed = trimmed[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(trimmed)
        except ValueError:
            return None
    return None


def _job_row_to_response(row: Mapping[str, Any]) -> BuscadorJobResponse:
    try:
        job_id = UUID(str(row.get("id")))
    except (TypeError, ValueError) as exc:  # pragma: no cover - datos corruptos
        raise HTTPException(status_code=500, detail="buscador_job_invalid_id") from exc

    stats_value = row.get("stats")
    stats = BuscadorStats(**stats_value) if isinstance(stats_value, dict) else None

    params_dict = _ensure_dict(row.get("params"), default={})
    params = BuscadorJobParamsResponse(
        sitio=params_dict.get("sitio", "domain"),
        url=params_dict.get("url"),
        mode=params_dict.get("mode", "generic"),
        max_pages=int(params_dict.get("max_pages") or 0) or 200,
        max_depth=int(params_dict.get("max_depth") or 0) or 3,
        max_runtime=params_dict.get("max_runtime"),
        max_queue_size=params_dict.get("max_queue_size"),
        max_no_new_emails=params_dict.get("max_no_new_emails"),
        max_memory_mb=params_dict.get("max_memory_mb"),
    )

    return BuscadorJobResponse(
        id=job_id,
        status=row.get("status") or "pending",
        created_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
        started_at=_parse_datetime(row.get("started_at")),
        finished_at=_parse_datetime(row.get("finished_at")),
        duration_ms=row.get("duration_ms"),
        total=row.get("total"),
        stats=stats,
        error=row.get("error"),
        params=params,
    )


def _buscador_result_row_to_item(row: Mapping[str, Any]) -> BuscadorResultItem:
    contacto = row.get("contacto")
    contacto_dict = contacto if isinstance(contacto, dict) else {}

    def pick(*keys: str) -> Any:
        for key in keys:
            if key in row and row[key]:
                return row[key]
            if key in contacto_dict and contacto_dict[key]:
                return contacto_dict[key]
        return None

    source_url = pick("url", "source_url") or ""
    email = pick("correo", "email") or ""
    return BuscadorResultItem(
        id=str(row.get("id")) if row.get("id") else None,
        source_url=source_url,
        email=email,
        name=pick("name"),
        position=pick("position"),
        phone=pick("telefono", "phone"),
        extension=pick("extension"),
        address=pick("address"),
    )


def _buscador_result_to_prospecto(
    *,
    row: Mapping[str, Any],
    job_id: UUID,
    segmento: str | None,
) -> dict[str, Any] | None:
    contacto = row.get("contacto")
    contacto_dict = contacto if isinstance(contacto, dict) else {}

    def pick(*keys: str) -> str | None:
        for key in keys:
            value = row.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            value = contacto_dict.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    email = pick("correo", "email")
    display_name = pick("name") or email or row.get("dominio") or pick("url", "source_url")
    if not display_name:
        display_name = "Contacto web"

    metadata = _ensure_dict(row.get("metadata"), default={})
    metadata.update(
        {
            "buscador_job_id": str(job_id),
            "buscador_result_id": row.get("id"),
            "buscador_contacto": contacto_dict,
            "buscador_url": row.get("url"),
        }
    )

    payload: dict[str, Any] = {
        "fuente": "usuario",
        "fuente_busqueda": "buscador",
        "display_name": display_name,
        "actividad": contacto_dict.get("position"),
        "phone": pick("telefono", "phone"),
        "email": email,
        "website": pick("url", "source_url"),
        "address": pick("address"),
        "segmento": segmento,
        "metadata": metadata,
    }
    return payload


async def _send_manual_whatsapp_message(
    *,
    conversation_id: str,
    contact_id: str,
    content: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    phone, wa_id, contact = await _resolve_whatsapp_identity(contact_id)
    if not phone:
        raise HTTPException(status_code=400, detail="contact_phone_missing")

    send_result = await whatsapp_service.send_manual_message(to_number=phone, body=content)
    if send_result.error:
        logger.error(
            "panel.inbox.whatsapp_manual_send_failed",
            extra={"conversation_id": conversation_id, "error": send_result.error},
        )
        raise HTTPException(status_code=502, detail="No se pudo enviar el mensaje por WhatsApp")

    metadata_payload = dict(metadata or {})
    metadata_payload.setdefault("manual_mode", True)
    metadata_payload.setdefault("sender_type", "human")
    metadata_payload.setdefault("author_type", "human")
    metadata_payload["channel"] = "whatsapp"
    metadata_payload["delivery_status"] = send_result.status

    try:
        await storage.register_whatsapp_message(
            direction="saliente",
            wa_id=wa_id,
            phone_e164=phone,
            body=content,
            message_sid=send_result.sid,
            conversation_id=conversation_id,
            contact_id=contact_id,
            metadata=metadata_payload,
            organizacion_id=whatsapp_service.resolve_whatsapp_organizacion(contact=contact),
        )
    except StorageError as exc:
        logger.exception(
            "panel.inbox.manual_whatsapp_register_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="No se pudo registrar el mensaje") from exc

    response_metadata = {
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "manual_mode": True,
        "channel": "whatsapp",
        "delivery_status": send_result.status,
    }
    for key in ("manual_author", "manual_email", "agent_name", "agent_email", "origin", "source"):
        value = metadata_payload.get(key)
        if isinstance(value, str) and value.strip():
            response_metadata[key] = value
    return response_metadata


async def _resolve_whatsapp_identity(contact_id: str) -> tuple[str | None, str | None, dict[str, Any] | None]:
    phone: str | None = None
    wa_id: str | None = None
    contact: dict[str, Any] | None = None
    try:
        contact = await storage.fetch_contact(contact_id)
        phone = _clean_phone(contact.get("telefono_e164"))
    except StorageError:
        phone = None

    try:
        identities = await storage.fetch_contact_identities(contact_id)
    except StorageError:
        identities = []

    for identity in identities:
        if (identity.get("canal") or "").lower() != "whatsapp":
            continue
        candidate_phone = _clean_phone(identity.get("id_externo"))
        if candidate_phone and not phone:
            phone = candidate_phone
        metadata = _ensure_dict(identity.get("metadatos") or {}, default={})
        candidate_wa = metadata.get("wa_id") or metadata.get("whatsapp_id")
        if isinstance(candidate_wa, str) and candidate_wa.strip():
            wa_id = candidate_wa.strip()
        if phone and wa_id:
            break
    return phone, wa_id, contact


def _clean_phone(raw: Any) -> str | None:
    if isinstance(raw, str):
        trimmed = raw.strip()
        return trimmed or None
    return None


def _is_manual_card(metadata: dict[str, Any] | None) -> bool:
    if not metadata:
        return False
    created_via = metadata.get("created_via")
    return isinstance(created_via, str) and created_via == "embudo_manual"


def _tablero_id_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    """Extrae un identificador de tablero consistente (UUID o slug normalizado)."""

    if not metadata:
        return None
    id_keys = (
        "tablero_id",
        "tableroId",
        "legacy_tablero_id",
        "legacy_tableroId",
        "pipeline_id",
        "pipelineId",
        "board_id",
        "boardId",
    )
    slug_keys = (
        "tablero_slug",
        "tableroSlug",
        "tablero",
        "tablero_nombre",
        "tableroNombre",
        "pipeline_slug",
        "pipelineSlug",
        "pipeline",
        "board_slug",
        "boardSlug",
    )
    for key in id_keys:
        candidate = _normalize_tablero_value(metadata.get(key))
        if candidate:
            return candidate
    for key in slug_keys:
        candidate = _normalize_tablero_value(metadata.get(key))
        if candidate:
            return candidate
    return None


def _normalize_tablero_value(raw: Any) -> str | None:
    """Convierte distintos formatos (UUID, dict, slug) en un identificador estable."""

    if raw is None:
        return None
    if isinstance(raw, dict):
        candidate = _normalize_tablero_value(raw.get("id"))
        if candidate:
            return candidate
        return _normalize_tablero_slug(raw.get("slug") or raw.get("nombre"))
    candidate = _safe_uuid(raw) if not isinstance(raw, dict) else None
    if candidate:
        return str(candidate)
    if isinstance(raw, str):
        return _normalize_tablero_slug(raw)
    return None


def _normalize_tablero_slug(raw: Any) -> str | None:
    """Normaliza etiquetas o slugs para usarlos como pseudo ID cuando no hay UUID."""

    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    lowered = trimmed.lower()
    if lowered.startswith("slug:"):
        lowered = lowered[5:]
    return f"slug:{lowered}"


def _tablero_id_from_row(row: dict[str, Any]) -> str | None:
    """Obtiene el tablero_id desde la etapa anidada de una oportunidad."""

    etapa = _ensure_dict(row.get("etapa"), default={})
    tablero_id = _tablero_id_from_metadata(_ensure_dict(etapa.get("metadata"), default={}))
    if tablero_id:
        return tablero_id
    tablero_from_column = _tablero_id_from_metadata({"tablero_id": etapa.get("tablero_id")})
    if tablero_from_column:
        return tablero_from_column
    return _tablero_id_from_metadata({"tablero_id": row.get("tablero_id")})
