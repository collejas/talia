"""Rutas del CRM multi-tenant para entidades polimórficas y núcleo comercial."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.supabase_client import (
    ensure_bearer_token,
    supabase_error,
    supabase_request,
)

router = APIRouter(prefix="/crm", tags=["crm"])

ALLOWED_RELATION_TYPES = {
    "cuentas",
    "contactos",
    "oportunidades",
    "tickets",
    "actividades",
    "leads",
}


class CuentaCreatePayload(BaseModel):
    """Payload para registrar una cuenta nueva."""

    nombre: str = Field(..., min_length=1, max_length=255)
    tipo: str | None = Field(default=None, max_length=100)
    industria: str | None = Field(default=None, max_length=150)
    tamano: str | None = Field(default=None, max_length=100)
    sitio_web: str | None = Field(default=None, max_length=500)
    direccion: dict[str, Any] | None = None
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class CuentaUpdatePayload(BaseModel):
    """Campos permitidos para actualizar una cuenta."""

    nombre: str | None = Field(default=None, min_length=1, max_length=255)
    tipo: str | None = Field(default=None, max_length=100)
    industria: str | None = Field(default=None, max_length=150)
    tamano: str | None = Field(default=None, max_length=100)
    sitio_web: str | None = Field(default=None, max_length=500)
    direccion: dict[str, Any] | None = None
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class ContactoCreatePayload(BaseModel):
    """Payload para registrar un contacto asociado a una cuenta."""

    nombre: str = Field(..., min_length=1, max_length=255)
    apellido: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=50)
    cargo: str | None = Field(default=None, max_length=150)
    canal_preferido: str | None = Field(default=None, max_length=100)
    cuenta_id: UUID | None = None
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class ContactoUpdatePayload(BaseModel):
    """Campos de actualización para un contacto existente."""

    nombre: str | None = Field(default=None, min_length=1, max_length=255)
    apellido: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=50)
    cargo: str | None = Field(default=None, max_length=150)
    canal_preferido: str | None = Field(default=None, max_length=100)
    cuenta_id: UUID | None = None
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class EtapaPipelinePayload(BaseModel):
    """Definición de una etapa de pipeline por tenant."""

    nombre: str = Field(..., min_length=1, max_length=200)
    orden: int = Field(..., ge=0)
    probabilidad_default: float | None = Field(default=None, ge=0, le=100)
    color: str | None = Field(default=None, max_length=50)

    model_config = ConfigDict(extra="forbid")


class OportunidadCreatePayload(BaseModel):
    """Payload para crear una oportunidad en el pipeline."""

    titulo: str = Field(..., min_length=1, max_length=255)
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    etapa_id: UUID | None = None
    monto_estimado: float | None = None
    moneda: str | None = Field(default="MXN", max_length=10)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = Field(default=None, description="YYYY-MM-DD")
    estado: str | None = Field(default="abierta", max_length=50)
    motivo_perdida: str | None = Field(default=None, max_length=255)
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class OportunidadUpdatePayload(BaseModel):
    """Campos para modificar una oportunidad existente."""

    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    etapa_id: UUID | None = None
    monto_estimado: float | None = None
    moneda: str | None = Field(default=None, max_length=10)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = Field(default=None, description="YYYY-MM-DD")
    estado: str | None = Field(default=None, max_length=50)
    motivo_perdida: str | None = Field(default=None, max_length=255)
    propietario_usuario_id: UUID | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class OportunidadHistorialPayload(BaseModel):
    """Payload para registrar el cambio de etapa en una oportunidad."""

    etapa_id: UUID
    comentario: str | None = Field(default=None, max_length=500)
    cambiado_por_usuario_id: UUID | None = None

    model_config = ConfigDict(extra="forbid")


class ActividadCreatePayload(BaseModel):
    """Payload para crear actividades/tareas con SLA."""

    tipo: str = Field(..., description="llamada/reunion/email/whatsapp/nota/tarea")
    asunto: str = Field(..., min_length=1, max_length=255)
    descripcion: str | None = None
    canal: str | None = Field(default=None, max_length=100)
    estado: str | None = Field(default="pendiente", max_length=50)
    inicio_en: str | None = Field(default=None, description="ISO datetime")
    fin_en: str | None = Field(default=None, description="ISO datetime")
    prioridad: str | None = Field(default="media", max_length=20)
    fecha_vencimiento: str | None = Field(default=None, description="YYYY-MM-DD")
    sla_horas: int | None = Field(default=None, ge=0)
    recordatorio_en: str | None = Field(default=None, description="ISO datetime")
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class ActividadUpdatePayload(BaseModel):
    """Campos para actualizar una actividad existente."""

    tipo: str | None = Field(
        default=None, description="llamada/reunion/email/whatsapp/nota/tarea"
    )
    asunto: str | None = Field(default=None, min_length=1, max_length=255)
    descripcion: str | None = None
    canal: str | None = Field(default=None, max_length=100)
    estado: str | None = Field(default=None, max_length=50)
    inicio_en: str | None = Field(default=None, description="ISO datetime")
    fin_en: str | None = Field(default=None, description="ISO datetime")
    prioridad: str | None = Field(default=None, max_length=20)
    fecha_vencimiento: str | None = Field(default=None, description="YYYY-MM-DD")
    sla_horas: int | None = Field(default=None, ge=0)
    recordatorio_en: str | None = Field(default=None, description="ISO datetime")
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


@router.get("/cuentas")
async def listar_cuentas(
    search: str | None = Query(
        default=None, description="Filtro por nombre o industria"
    ),
    propietario_usuario_id: UUID | None = Query(default=None),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Obtiene cuentas del tenant con filtros de texto y propietario."""

    token = ensure_bearer_token(authorization)
    params: dict[str, str] = {"select": "*", "order": "actualizado_en.desc"}
    if search:
        like = f"*{search}*"
        params["or"] = f"(nombre.ilike.{like},industria.ilike.{like})"
    if propietario_usuario_id:
        params["propietario_usuario_id"] = f"eq.{propietario_usuario_id}"

    resp = await supabase_request("GET", "/rest/v1/cuentas", token=token, params=params)
    if resp.is_error:
        raise supabase_error(resp, "Error listando cuentas")
    return resp.json()


@router.post("/cuentas", status_code=201)
async def crear_cuenta(
    payload: CuentaCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea una cuenta asociada al tenant actual."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/cuentas",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando cuenta")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.patch("/cuentas/{cuenta_id}")
async def actualizar_cuenta(
    cuenta_id: UUID,
    payload: CuentaUpdatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza campos de una cuenta existente."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params = {"id": f"eq.{cuenta_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/cuentas",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando cuenta")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.get("/contactos")
async def listar_contactos(
    cuenta_id: UUID | None = Query(default=None),
    propietario_usuario_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, description="Filtro por nombre o email"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Lista contactos del tenant con filtros por cuenta, propietario o búsqueda."""

    token = ensure_bearer_token(authorization)
    params: dict[str, str] = {"select": "*", "order": "actualizado_en.desc"}
    if cuenta_id:
        params["cuenta_id"] = f"eq.{cuenta_id}"
    if propietario_usuario_id:
        params["propietario_usuario_id"] = f"eq.{propietario_usuario_id}"
    if search:
        like = f"*{search}*"
        params["or"] = f"(nombre.ilike.{like},email.ilike.{like},apellido.ilike.{like})"

    resp = await supabase_request(
        "GET", "/rest/v1/contactos", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando contactos")
    return resp.json()


@router.post("/contactos", status_code=201)
async def crear_contacto(
    payload: ContactoCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea un contacto y lo asocia opcionalmente a una cuenta."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/contactos",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando contacto")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.patch("/contactos/{contacto_id}")
async def actualizar_contacto(
    contacto_id: UUID,
    payload: ContactoUpdatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza datos de contacto o su relación con una cuenta."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params = {"id": f"eq.{contacto_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/contactos",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando contacto")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.get("/etapas-pipeline")
async def listar_etapas_pipeline(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Lista etapas del pipeline ordenadas por su posición."""

    token = ensure_bearer_token(authorization)
    params = {"select": "*", "order": "orden.asc"}
    resp = await supabase_request(
        "GET", "/rest/v1/etapas_pipeline", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando etapas del pipeline")
    return resp.json()


@router.post("/etapas-pipeline", status_code=201)
async def crear_etapa_pipeline(
    payload: EtapaPipelinePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea una etapa del pipeline para el tenant actual."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/etapas_pipeline",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando etapa")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.patch("/etapas-pipeline/{etapa_id}")
async def actualizar_etapa_pipeline(
    etapa_id: UUID,
    payload: EtapaPipelinePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza nombre, orden o color de una etapa existente."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    params = {"id": f"eq.{etapa_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/etapas_pipeline",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando etapa")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.get("/oportunidades")
async def listar_oportunidades(
    cuenta_id: UUID | None = Query(default=None),
    contacto_id: UUID | None = Query(default=None),
    etapa_id: UUID | None = Query(default=None),
    estado: str | None = Query(default=None),
    propietario_usuario_id: UUID | None = Query(default=None),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Lista oportunidades del pipeline con filtros comunes."""

    token = ensure_bearer_token(authorization)
    params: dict[str, str] = {"select": "*", "order": "actualizado_en.desc"}
    if cuenta_id:
        params["cuenta_id"] = f"eq.{cuenta_id}"
    if contacto_id:
        params["contacto_id"] = f"eq.{contacto_id}"
    if etapa_id:
        params["etapa_id"] = f"eq.{etapa_id}"
    if estado:
        params["estado"] = f"eq.{estado}"
    if propietario_usuario_id:
        params["propietario_usuario_id"] = f"eq.{propietario_usuario_id}"

    resp = await supabase_request(
        "GET", "/rest/v1/oportunidades", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando oportunidades")
    return resp.json()


@router.post("/oportunidades", status_code=201)
async def crear_oportunidad(
    payload: OportunidadCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea una oportunidad en la organización actual."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/oportunidades",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando oportunidad")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.patch("/oportunidades/{oportunidad_id}")
async def actualizar_oportunidad(
    oportunidad_id: UUID,
    payload: OportunidadUpdatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza etapa, estado o montos de una oportunidad."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params = {"id": f"eq.{oportunidad_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/oportunidades",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando oportunidad")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.post("/oportunidades/{oportunidad_id}/historial", status_code=201)
async def agregar_historial_oportunidad(
    oportunidad_id: UUID,
    payload: OportunidadHistorialPayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Registra el cambio de etapa de una oportunidad."""

    token = ensure_bearer_token(authorization)
    body = payload.model_dump()
    body["oportunidad_id"] = str(oportunidad_id)
    resp = await supabase_request(
        "POST",
        "/rest/v1/oportunidad_etapas_historial",
        token=token,
        json=body,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error registrando historial de etapa")
    data = resp.json()
    return data[0] if isinstance(data, list) and data else data


@router.get("/actividades")
async def listar_actividades(
    cuenta_id: UUID | None = Query(default=None),
    contacto_id: UUID | None = Query(default=None),
    oportunidad_id: UUID | None = Query(default=None),
    asignado_a_usuario_id: UUID | None = Query(default=None),
    estado: str | None = Query(default=None),
    prioridad: str | None = Query(default=None),
    tipo: str | None = Query(default=None),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Lista actividades/tareas con filtros por relación, estado y prioridad."""

    token = ensure_bearer_token(authorization)
    params: dict[str, str] = {
        "select": "*",
        "order": "coalesce(inicio_en, creado_en).desc",
    }
    if cuenta_id:
        params["cuenta_id"] = f"eq.{cuenta_id}"
    if contacto_id:
        params["contacto_id"] = f"eq.{contacto_id}"
    if oportunidad_id:
        params["oportunidad_id"] = f"eq.{oportunidad_id}"
    if asignado_a_usuario_id:
        params["asignado_a_usuario_id"] = f"eq.{asignado_a_usuario_id}"
    if estado:
        params["estado"] = f"eq.{estado}"
    if prioridad:
        params["prioridad"] = f"eq.{prioridad}"
    if tipo:
        params["tipo"] = f"eq.{tipo}"

    resp = await supabase_request(
        "GET", "/rest/v1/actividades", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando actividades")
    return resp.json()


@router.post("/actividades", status_code=201)
async def crear_actividad(
    payload: ActividadCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea una actividad/tarea con SLA y recordatorio opcional."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/actividades",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando actividad")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


@router.patch("/actividades/{actividad_id}")
async def actualizar_actividad(
    actividad_id: UUID,
    payload: ActividadUpdatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza estado, SLA o asignación de una actividad."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params = {"id": f"eq.{actividad_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/actividades",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando actividad")
    body = resp.json()
    return body[0] if isinstance(body, list) and body else body


def _validate_relation_type(relacion_tipo: str) -> str:
    """Ensure the relation type belongs to the allowed catalog."""

    if relacion_tipo not in ALLOWED_RELATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"relacion_tipo debe ser uno de: {', '.join(sorted(ALLOWED_RELATION_TYPES))}",
        )
    return relacion_tipo


class NotaCreatePayload(BaseModel):
    """Payload para crear una nota polimórfica ligada a una entidad."""

    relacion_tipo: str = Field(..., description="Catálogo de entidades soportadas")
    relacion_id: UUID = Field(..., description="Identificador de la entidad destino")
    texto: str = Field(..., min_length=1, max_length=4000)
    tipo: str = Field(default="interna", description="interna, publica o sistema")
    visible_para_cliente: bool = Field(default=False)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")

    @field_validator("relacion_tipo")
    @classmethod
    def validate_relacion_tipo(cls, value: str) -> str:
        return _validate_relation_type(value)


class NotaUpdatePayload(BaseModel):
    """Campos permitidos para actualizar una nota existente."""

    texto: str | None = Field(default=None, min_length=1, max_length=4000)
    visible_para_cliente: bool | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class TaggingCreatePayload(BaseModel):
    """Payload para asociar un tag a cualquier entidad polimórfica."""

    tag_id: UUID = Field(..., description="Identificador del tag existente")
    relacion_tipo: str = Field(..., description="Entidad a etiquetar")
    relacion_id: UUID = Field(..., description="Identificador de la entidad")

    model_config = ConfigDict(extra="forbid")

    @field_validator("relacion_tipo")
    @classmethod
    def validate_relacion_tipo(cls, value: str) -> str:
        return _validate_relation_type(value)


class ArchivoRegisterPayload(BaseModel):
    """Metadatos mínimos para registrar un archivo subido externamente."""

    relacion_tipo: str = Field(..., description="Entidad a la que se adjunta")
    relacion_id: UUID = Field(..., description="Identificador de la entidad")
    nombre_original: str = Field(..., min_length=1, max_length=500)
    storage_path: str = Field(..., min_length=1, max_length=1000)
    content_type: str | None = Field(default=None, max_length=200)
    tamano_bytes: int | None = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")

    @field_validator("relacion_tipo")
    @classmethod
    def validate_relacion_tipo(cls, value: str) -> str:
        return _validate_relation_type(value)


@router.get("/notas")
async def listar_notas(
    relacion_tipo: str = Query(..., description="Entidad de referencia"),
    relacion_id: UUID = Query(..., description="Identificador de la entidad"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Obtiene notas filtradas por entidad polimórfica con RLS por tenant."""

    token = ensure_bearer_token(authorization)
    _validate_relation_type(relacion_tipo)

    params = {
        "select": "*",
        "relacion_tipo": f"eq.{relacion_tipo}",
        "relacion_id": f"eq.{relacion_id}",
        "order": "creado_en.desc",
    }
    resp = await supabase_request("GET", "/rest/v1/notas", token=token, params=params)
    if resp.is_error:
        raise supabase_error(resp, "Error listando notas")
    return resp.json()


@router.post("/notas", status_code=201)
async def crear_nota(
    payload: NotaCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea una nueva nota polimórfica respetando el aislamiento por tenant."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/notas",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando nota")
    body = resp.json()
    if isinstance(body, list) and body:
        return body[0]
    return body


@router.patch("/notas/{nota_id}")
async def actualizar_nota(
    nota_id: UUID,
    payload: NotaUpdatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Actualiza texto o visibilidad de una nota existente."""

    token = ensure_bearer_token(authorization)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    params = {"id": f"eq.{nota_id}"}
    resp = await supabase_request(
        "PATCH",
        "/rest/v1/notas",
        token=token,
        params=params,
        json=update_data,
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error actualizando nota")
    body = resp.json()
    if isinstance(body, list) and body:
        return body[0]
    return body


@router.get("/taggings")
async def listar_taggings(
    relacion_tipo: str = Query(..., description="Entidad etiquetada"),
    relacion_id: UUID = Query(..., description="Identificador de la entidad"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Lista tags asociados a una entidad específica."""

    token = ensure_bearer_token(authorization)
    _validate_relation_type(relacion_tipo)

    params = {
        "select": "*",
        "relacion_tipo": f"eq.{relacion_tipo}",
        "relacion_id": f"eq.{relacion_id}",
    }
    resp = await supabase_request(
        "GET", "/rest/v1/taggings", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando taggings")
    return resp.json()


@router.post("/taggings", status_code=201)
async def crear_tagging(
    payload: TaggingCreatePayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Crea la relación entre un tag existente y una entidad polimórfica."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/taggings",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error creando tagging")
    body = resp.json()
    if isinstance(body, list) and body:
        return body[0]
    return body


@router.delete("/taggings/{tagging_id}", status_code=204)
async def eliminar_tagging(
    tagging_id: UUID,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> Response:
    """Elimina un tagging por identificador."""

    token = ensure_bearer_token(authorization)
    params = {"id": f"eq.{tagging_id}"}
    resp = await supabase_request(
        "DELETE", "/rest/v1/taggings", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error eliminando tagging")
    return Response(status_code=204)


@router.get("/archivos")
async def listar_archivos(
    relacion_tipo: str = Query(..., description="Entidad a consultar"),
    relacion_id: UUID = Query(..., description="Identificador de la entidad"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> list[dict[str, Any]]:
    """Obtiene archivos adjuntos asociados a una entidad polimórfica."""

    token = ensure_bearer_token(authorization)
    _validate_relation_type(relacion_tipo)

    params = {
        "select": "*",
        "relacion_tipo": f"eq.{relacion_tipo}",
        "relacion_id": f"eq.{relacion_id}",
        "order": "subido_en.desc",
    }
    resp = await supabase_request(
        "GET", "/rest/v1/archivos", token=token, params=params
    )
    if resp.is_error:
        raise supabase_error(resp, "Error listando archivos")
    return resp.json()


@router.post("/archivos", status_code=201)
async def registrar_archivo(
    payload: ArchivoRegisterPayload,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    """Registra metadatos de un archivo previamente subido al storage."""

    token = ensure_bearer_token(authorization)
    resp = await supabase_request(
        "POST",
        "/rest/v1/archivos",
        token=token,
        json=payload.model_dump(),
        prefer="return=representation",
    )
    if resp.is_error:
        raise supabase_error(resp, "Error registrando archivo")
    body = resp.json()
    if isinstance(body, list) and body:
        return body[0]
    return body
