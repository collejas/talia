"""Repositorio para interactuar con las tablas CRM en Supabase."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal, Sequence
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger


class CRMRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase CRM."""


QUOTE_WITH_ITEMS_SELECT = "*,items:lead_cotizacion_items(*,catalog_item:catalog_items(id,slug,nombre,tipo,unidad,precio_base,moneda,impuestos,activo,descripcion_corta))"


def _coerce_uuid(value: Any, *, field: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise CRMRepositoryError(f"{field}_invalid") from exc


def _ensure_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _coerce_positive_int(value: Any, default: int = 1) -> int:
    try:
        number = int(value)
        if number > 0:
            return number
    except (TypeError, ValueError):
        pass
    return default


def _build_conversation_history(
    previous_metadata: dict[str, Any],
    new_conversation_id: str,
) -> list[str]:
    """Combina el historial previo de conversaciones con la conversación actual."""
    history: list[str] = []
    prev_history = previous_metadata.get("conversation_history")
    if isinstance(prev_history, list):
        for item in prev_history:
            if isinstance(item, str):
                trimmed = item.strip()
                if trimmed:
                    history.append(trimmed)
    prev_conversation_id = previous_metadata.get("conversation_id")
    if isinstance(prev_conversation_id, str):
        trimmed = prev_conversation_id.strip()
        if trimmed:
            history.append(trimmed)
    history.append(new_conversation_id)
    deduped: list[str] = []
    seen: set[str] = set()
    for item in history:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped


def _is_jwt_expired_error(error: Exception) -> bool:
    return "JWT expired" in str(error)


class CRMRepository:
    """Cliente ligero contra Supabase REST usando service role."""

    _PIPELINE_SELECT = ",".join(
        [
            "id",
            "organizacion_id",
            "cuenta_id",
            "contacto_principal_id",
            "etapa_id",
            "titulo",
            "descripcion",
            "monto_estimado",
            "moneda",
            "probabilidad",
            "fecha_cierre_probable",
            "estado",
            "motivo_perdida",
            "propietario_usuario_id",
            "asignado_a_usuario_id",
            "metadata",
            "creado_en",
            "actualizado_en",
            "cerrado_en",
            "asignado:usuarios!oportunidades_asignado_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "propietario:usuarios!oportunidades_propietario_usuario_org_fkey(id,nombre_completo,correo,telefono_e164)",
            "etapa:etapas_pipeline!oportunidades_etapa_org_fkey(id,nombre,codigo,categoria,orden,metadata)",
            "contacto:contactos!oportunidades_contacto_principal_org_fkey(id,nombre_completo,correo,telefono_e164,company_name,notes,necesidad_proposito,estado,captura_estado)",
            "cuenta:cuentas!oportunidades_cuenta_org_fkey(id,nombre,telefono,correo)",
        ]
    )

    _stage_cache: dict[str, UUID] = {}
    _stage_code_cache: dict[tuple[str, str], dict[str, Any]] = {}

    _CLIENTE_SELECT = (
        "id,organizacion_id,contacto_id,cuenta_id,oportunidad_id,legacy_lead_id,"
        "estado_onboarding,rfc,razon_social,domicilio_fiscal,domicilio_fisico,regimen_fiscal,"
        "datos_facturacion,fuente,monto_estimado,moneda,metadatos,ganado_en,creado_en,actualizado_en,"
        "contacto:contactos!clientes_contacto_org_fkey(id,nombre_completo,correo,telefono_e164,company_name),"
        "documentos:cliente_documentos!cliente_documentos_cliente_org_fkey(id,tipo,estado,descripcion,storage_url,"
        "storage_path,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id),"
        "responsables:cliente_responsables!cliente_responsables_cliente_org_fkey(id,nombre,correo,telefono_e164,rol,"
        "es_responsable_principal,metadatos,creado_en,actualizado_en,cuenta_id,oportunidad_id)"
    )

    _PORTAL_TOKEN_SELECT = (
        "id,cliente_id,organizacion_id,cuenta_id,oportunidad_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        f"cliente:clientes!cliente_portal_tokens_cliente_org_fkey({_CLIENTE_SELECT})"
    )

    _PORTAL_TOKEN_MIN_SELECT = (
        "id,cliente_id,organizacion_id,cuenta_id,oportunidad_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        "cliente:clientes!cliente_portal_tokens_cliente_org_fkey(id)"
    )

    _HISTORY_SELECT = ",".join(
        [
            "id",
            "oportunidad_id",
            "cambiado_en",
            "fuente",
            "motivo",
            "metadata",
            "etapa_origen_id",
            "etapa_destino_id",
            "cambiado_por_usuario_id",
            "etapa_origen:etapas_pipeline!oportunidad_historial_etapa_origen_org_fkey(id,nombre)",
            "etapa_destino:etapas_pipeline!oportunidad_historial_etapa_destino_org_fkey(id,nombre)",
            "cambiado_por:usuarios!oportunidad_historial_cambiado_por_usuario_org_fkey(id,nombre_completo,correo)",
        ]
    )

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise CRMRepositoryError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def list_accounts(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": order,
            "limit": str(limit),
            "offset": str(offset),
        }
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cuentas: {data!r}")
        return data

    async def create_account(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cuentas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cuenta creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear cuenta: {row!r}")
        return row

    async def list_pipelines(
        self,
        *,
        organizacion_id: UUID,
        tablero_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Listar etapas de pipeline, opcionalmente filtradas por tablero."""

        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
        }
        if tablero_id:
            tablero_filter = str(tablero_id)
            params["or"] = (
                f"(tablero_id.eq.{tablero_filter},"
                f"metadata->>tablero_id.eq.{tablero_filter},"
                f"metadatos->>tablero_id.eq.{tablero_filter})"
            )
            params["order"] = "tablero_id.asc,orden.asc"
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar etapas: {data!r}")
        return data

    async def list_opportunities(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        contacto_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if contacto_id:
            params["contacto_principal_id"] = f"eq.{contacto_id}"
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar oportunidades: {data!r}")
        return data

    async def create_opportunity(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/oportunidades",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la oportunidad creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear oportunidad: {row!r}")
        return row

    async def get_opportunity(
        self,
        *,
        organizacion_id: UUID,
        opportunity_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{opportunity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener oportunidad: {row!r}")
        return row

    async def list_activities(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None = None,
        cuenta_id: UUID | None = None,
        contacto_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "inicio_en.desc.nullslast",
            "limit": str(limit),
            "offset": str(offset),
        }
        if oportunidad_id:
            params["oportunidad_id"] = f"eq.{oportunidad_id}"
        if cuenta_id:
            params["cuenta_id"] = f"eq.{cuenta_id}"
        if contacto_id:
            params["contacto_id"] = f"eq.{contacto_id}"
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar actividades: {data!r}")
        return data

    async def create_activity(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/actividades",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la actividad creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear actividad: {row!r}")
        return row

    async def get_activity(
        self,
        *,
        organizacion_id: UUID,
        activity_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{activity_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/actividades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener actividad: {row!r}")
        return row

    async def list_tickets(
        self,
        *,
        organizacion_id: UUID,
        estado: str | None = None,
        prioridad: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        if prioridad:
            params["prioridad"] = f"eq.{prioridad}"
        resp = await self._request("GET", "/rest/v1/tickets", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar tickets: {data!r}")
        return data

    async def create_ticket(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/tickets",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el ticket creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear ticket: {row!r}")
        return row

    async def get_ticket(
        self,
        *,
        organizacion_id: UUID,
        ticket_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{ticket_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/tickets", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener ticket: {row!r}")
        return row

    async def list_ticket_comments(
        self,
        *,
        organizacion_id: UUID,
        ticket_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "ticket_id": f"eq.{ticket_id}",
            "order": "creado_en.asc",
        }
        resp = await self._request("GET", "/rest/v1/ticket_comentarios", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar comentarios de ticket: {data!r}"
            )
        return data

    async def create_ticket_comment(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/ticket_comentarios",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el comentario del ticket")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear comentario: {row!r}")
        return row

    async def list_files(
        self,
        *,
        organizacion_id: UUID,
        relacion_tipo: str | None = None,
        relacion_id: UUID | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "subido_en.desc",
            "limit": str(limit),
        }
        if relacion_tipo:
            params["relacion_tipo"] = f"eq.{relacion_tipo}"
        if relacion_id:
            params["relacion_id"] = f"eq.{relacion_id}"
        resp = await self._request("GET", "/rest/v1/archivos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar archivos: {data!r}")
        return data

    async def create_file(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/archivos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el archivo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear archivo: {row!r}")
        return row

    async def list_tags(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
        }
        resp = await self._request("GET", "/rest/v1/tags", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar tags: {data!r}")
        return data

    async def create_tag(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/tags",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el tag creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear tag: {row!r}")
        return row

    async def create_tagging(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/taggings",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el tagging creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear tagging: {row!r}")
        return row

    async def delete_tagging(
        self,
        *,
        organizacion_id: UUID,
        tagging_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{tagging_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/taggings",
            params=params,
            prefer="return=minimal",
        )
        if resp.status_code not in (200, 204):
            raise CRMRepositoryError(
                f"Supabase respondió error al eliminar tagging: {resp.status_code} {resp.text}"
            )

    async def list_products(
        self,
        *,
        organizacion_id: UUID,
        activos: bool | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "nombre.asc",
        }
        if activos is not None:
            params["activo"] = f"eq.{str(activos).lower()}"
        resp = await self._request("GET", "/rest/v1/productos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar productos: {data!r}")
        return data

    async def create_product(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/productos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el producto creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear producto: {row!r}")
        return row

    async def list_logos(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,descripcion,file_path,file_url,metadata,uploaded_by,created_at,updated_at",
            "order": "created_at.desc",
        }
        resp = await self._request("GET", "/rest/v1/logos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar logos: {data!r}")
        return data

    async def create_logo(self, payload: dict[str, Any]) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/logos",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el logo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear logo: {row!r}")
        return row

    async def list_quotes(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if oportunidad_id:
            params["oportunidad_id"] = f"eq.{oportunidad_id}"
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cotizaciones: {data!r}")
        return data

    async def create_quote(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cotizaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cotización creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear cotización: {row!r}")
        return row

    async def list_quote_items(
        self,
        *,
        organizacion_id: UUID,
        cotizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "cotizacion_id": f"eq.{cotizacion_id}",
            "order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizacion_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar items de cotización: {data!r}"
            )
        return data

    async def add_quote_item(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cotizacion_items",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el item de cotización creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear item de cotización: {row!r}")
        return row

    async def list_quote_entries(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "order": "creado_en.desc",
            "select": "id,organizacion_id,oportunidad_id,cuenta_id,contacto_id,estatus,total,moneda,valida_hasta,creada_por_usuario_id,metadata,creado_en,actualizado_en,items:cotizacion_items(*,catalog_item:productos(id,nombre,codigo))",
            "items.order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cotizaciones: {data!r}")
        return data

    async def get_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{quote_id}",
            "limit": "1",
            "select": "id,organizacion_id,oportunidad_id,cuenta_id,contacto_id,estatus,total,moneda,valida_hasta,creada_por_usuario_id,metadata,creado_en,actualizado_en,items:cotizacion_items(*,catalog_item:productos(id,nombre,codigo))",
            "items.order": "id.asc",
        }
        resp = await self._request("GET", "/rest/v1/cotizaciones", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        raise CRMRepositoryError("quote_not_found")

    async def create_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        cuenta_id: UUID | None,
        contacto_id: UUID | None,
        estatus: str,
        total: float | None,
        moneda: str,
        valida_hasta: str | None,
        metadata: dict[str, Any],
        items: list[dict[str, Any]],
        usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "oportunidad_id": str(oportunidad_id),
            "cuenta_id": str(cuenta_id) if cuenta_id else None,
            "contacto_id": str(contacto_id) if contacto_id else None,
            "estatus": estatus,
            "total": total,
            "moneda": moneda,
            "valida_hasta": valida_hasta,
            "metadata": metadata,
        }
        if usuario_id:
            body["creada_por_usuario_id"] = str(usuario_id)
        resp = await self._request(
            "POST",
            "/rest/v1/cotizaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cotización creada")
        row = data[0]
        quote_id = row.get("id")
        if not quote_id:
            raise CRMRepositoryError("quote_create_missing_id")
        if items:
            await self._insert_quote_items(quote_id=UUID(str(quote_id)), items=items)
        return await self.get_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=UUID(str(quote_id)),
        )

    async def _insert_quote_items(
        self,
        *,
        quote_id: UUID,
        items: list[dict[str, Any]],
    ) -> None:
        rows = []
        for item in items:
            payload = dict(item)
            payload["cotizacion_id"] = str(quote_id)
            rows.append(payload)
        if not rows:
            return
        resp = await self._request(
            "POST",
            "/rest/v1/cotizacion_items",
            json=rows,
            prefer="return=representation",
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Error creando items de cotización: {resp.status_code} {resp.text}"
            )

    async def mark_quote_entry(
        self,
        *,
        organizacion_id: UUID,
        quote_id: UUID,
        estatus: str | None = None,
        metadata_patch: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        current = await self.get_quote_entry(
            organizacion_id=organizacion_id,
            quote_id=quote_id,
        )
        payload: dict[str, Any] = {}
        if estatus:
            payload["estatus"] = estatus
        if metadata_patch:
            existing = _ensure_metadata(current.get("metadata"))
            existing.update(metadata_patch)
            payload["metadata"] = existing
        resp = await self._request(
            "PATCH",
            "/rest/v1/cotizaciones",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "id": f"eq.{quote_id}",
                "limit": "1",
            },
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        raise CRMRepositoryError("quote_mark_failed")

    async def get_opportunity_with_contact(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{oportunidad_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        return None

    async def list_campaigns(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        resp = await self._request("GET", "/rest/v1/campanas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar campañas: {data!r}")
        return data

    async def create_campaign(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/campanas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la campaña creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear campaña: {row!r}")
        return row

    async def get_campaign(
        self,
        *,
        organizacion_id: UUID,
        campana_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{campana_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/campanas", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"campaign_get_invalid:{row!r}")
        return row

    async def list_leads(
        self,
        *,
        organizacion_id: UUID,
        estado: str | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        resp = await self._request("GET", "/rest/v1/leads", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar leads: {data!r}")
        return data

    async def create_lead(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/leads",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el lead creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear lead: {row!r}")
        return row

    async def list_lead_events(
        self,
        *,
        organizacion_id: UUID,
        lead_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "lead_id": f"eq.{lead_id}",
            "order": "registrado_en.asc",
        }
        resp = await self._request("GET", "/rest/v1/lead_eventos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar eventos de lead: {data!r}")
        return data

    async def contact_restart_stats(
        self,
        *,
        organizacion_id: UUID,
        min_restart_sequence: int = 2,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        payload = {
            "p_organizacion_id": str(organizacion_id),
            "p_min_restart_sequence": max(1, min_restart_sequence),
            "p_limit": max(1, min(limit, 500)),
        }
        data = await self._rpc("crm_contact_restart_stats", payload)
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada al obtener reinicios de contactos: {data!r}"
        )

    async def ensure_conversation_opportunity(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        conversation_id: str,
        canal: str | None = None,
        contacto_nombre: str | None = None,
        contacto_empresa: str | None = None,
        force_new_opportunity_on_restart: bool = False,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> tuple[UUID, bool, int]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")

        base_metadata = {
            "conversation_id": conversation_key,
            "channel": canal,
            "canal": canal,
            "source": "assistant",
            "origin": "assistant",
        }

        def _merged_metadata(raw: Any) -> dict[str, Any]:
            metadata = _ensure_metadata(raw)
            for key, value in base_metadata.items():
                if value is None:
                    continue
                current = metadata.get(key)
                if isinstance(current, str) and current.strip():
                    continue
                metadata[key] = value
            return metadata

        async def _patch_metadata(opportunity_id: UUID, metadata: dict[str, Any]) -> UUID:
            params = {
                "id": f"eq.{opportunity_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            }
            await self._request(
                "PATCH",
                "/rest/v1/oportunidades",
                params=params,
                json={"metadata": metadata},
                prefer="return=representation",
            )
            return opportunity_id

        select_columns = (
            "id,metadata,asignado_a_usuario_id,etapa_id,titulo,descripcion,"
            "monto_estimado,moneda,probabilidad"
        )

        # Buscar por metadata->>conversation_id
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>conversation_id": f"eq.{conversation_key}",
            "select": select_columns,
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        rows = resp.json() or []
        if isinstance(rows, list) and rows:
            row = rows[0]
            opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
            metadata = _merged_metadata(row.get("metadata"))
            current_assignee = row.get("asignado_a_usuario_id")
            assignee_uuid = (
                _coerce_uuid(current_assignee, field="asignado_a_usuario_id")
                if current_assignee
                else None
            )
            result_id = await _patch_metadata(opportunity_id, metadata)
            restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
            await self._set_conversation_restart_sequence(
                conversation_id=conversation_key,
                restart_sequence=restart_sequence,
            )
            await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                current_assignee=assignee_uuid,
                conversation_id=conversation_id,
                contact_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
            )
            return result_id, False, restart_sequence

        # Buscar por contacto principal
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_principal_id": f"eq.{contacto_id}",
            "select": select_columns,
            "order": "creado_en.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        rows = resp.json() or []
        if isinstance(rows, list) and rows:
            row = rows[0]
            opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
            metadata = _merged_metadata(row.get("metadata"))
            current_assignee = row.get("asignado_a_usuario_id")
            assignee_uuid = (
                _coerce_uuid(current_assignee, field="asignado_a_usuario_id")
                if current_assignee
                else None
            )
            existing_conversation = ""
            metadata_conversation = metadata.get("conversation_id")
            if isinstance(metadata_conversation, str):
                existing_conversation = metadata_conversation.strip()
            should_restart = (
                force_new_opportunity_on_restart
                and existing_conversation
                and existing_conversation != conversation_key
            )
            if should_restart:
                return await self._create_opportunity_from_contact(
                organizacion_id=organizacion_id,
                contacto_id=contacto_id,
                conversation_id=conversation_key,
                canal=canal,
                contacto_nombre=contacto_nombre,
                contacto_empresa=contacto_empresa,
                base_metadata=base_metadata,
                parent_row=row,
                parent_metadata=metadata,
                parent_assignee=assignee_uuid,
                is_restart=True,
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
            )

            result_id = await _patch_metadata(opportunity_id, metadata)
            restart_sequence = _coerce_positive_int(metadata.get("restart_sequence"), default=1)
            await self._set_conversation_restart_sequence(
                conversation_id=conversation_key,
                restart_sequence=restart_sequence,
            )
            await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                current_assignee=assignee_uuid,
                conversation_id=conversation_id,
                contact_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
            )
            return result_id, False, restart_sequence

        # Crear oportunidad mínima (no había registros previos)
        return await self._create_opportunity_from_contact(
            organizacion_id=organizacion_id,
            contacto_id=contacto_id,
            conversation_id=conversation_key,
            canal=canal,
            contacto_nombre=contacto_nombre,
            contacto_empresa=contacto_empresa,
            base_metadata=base_metadata,
            is_restart=False,
            contact_ready=contact_ready,
            require_contact_ready=require_contact_ready,
        )

    async def _create_opportunity_from_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        conversation_id: str,
        canal: str | None,
        contacto_nombre: str | None,
        contacto_empresa: str | None,
        base_metadata: dict[str, Any],
        parent_row: dict[str, Any] | None = None,
        parent_metadata: dict[str, Any] | None = None,
        parent_assignee: UUID | None = None,
        is_restart: bool = False,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> tuple[UUID, bool, int]:
        stage_id_value = parent_row.get("etapa_id") if parent_row else None
        stage_id: UUID | None = None
        if stage_id_value:
            try:
                stage_id = UUID(str(stage_id_value))
            except (TypeError, ValueError):
                stage_id = None
        if stage_id is None:
            stage_id = await self._get_default_stage_id(organizacion_id=organizacion_id)

        base_title = (contacto_nombre or "").strip() or (contacto_empresa or "").strip()
        if parent_row and isinstance(parent_row.get("titulo"), str):
            parent_title = parent_row["titulo"].strip()
        else:
            parent_title = ""
        titulo = parent_title or base_title or f"Conversación {conversation_id[:8]}"

        metadata = {k: v for k, v in base_metadata.items() if v is not None}
        conversation_history = [conversation_id]
        restart_sequence = 1
        parent_id: UUID | None = None
        if parent_row:
            parent_id = _coerce_uuid(parent_row.get("id"), field="parent_opportunity_id")
            metadata["parent_opportunity_id"] = str(parent_id)
            parent_meta = parent_metadata or {}
            restart_sequence = _coerce_positive_int(parent_meta.get("restart_sequence"), default=1) + 1
            conversation_history = _build_conversation_history(parent_meta, conversation_id)
        metadata["restart_sequence"] = restart_sequence
        metadata["conversation_history"] = conversation_history

        moneda_value = parent_row.get("moneda") if parent_row else None

        create_body: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "contacto_principal_id": str(contacto_id),
            "etapa_id": str(stage_id),
            "titulo": titulo,
            "moneda": moneda_value or "MXN",
            "metadata": metadata,
        }
        if parent_row:
            for field in ("monto_estimado", "descripcion", "probabilidad"):
                value = parent_row.get(field)
                if value not in (None, ""):
                    create_body[field] = value

        resp = await self._request(
            "POST",
            "/rest/v1/oportunidades",
            json=create_body,
            prefer="return=representation",
        )
        data = resp.json() or []
        row: dict[str, Any]
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict) and data:
            row = data
        else:
            raise CRMRepositoryError("Respuesta inesperada al crear oportunidad")

        opportunity_id = _coerce_uuid(row.get("id"), field="opportunity_id")
        assigned_user_id = parent_assignee

        if parent_assignee:
            await self._set_opportunity_assignee(
                organizacion_id=organizacion_id,
                oportunidad_id=opportunity_id,
                usuario_id=parent_assignee,
            )
        else:
            assigned_user_id = await self._assign_sales_rep_if_needed(
                oportunidad_id=opportunity_id,
                organizacion_id=organizacion_id,
                conversation_id=conversation_id,
                contact_id=str(contacto_id),
                contact_ready=contact_ready,
                require_contact_ready=require_contact_ready,
            )

        if parent_row and assigned_user_id:
            audit_metadata: dict[str, Any] = {"source": "restart"}
            if parent_id:
                audit_metadata["parent_opportunity_id"] = str(parent_id)
            await self._insert_assignment_audit(
                organizacion_id=organizacion_id,
                oportunidad_id=opportunity_id,
                vendedor_id=assigned_user_id,
                conversation_id=conversation_id,
                contact_id=str(contacto_id),
                trigger="restart_conversation",
                metadata=audit_metadata,
            )

        await self._set_conversation_restart_sequence(
            conversation_id=conversation_id,
            restart_sequence=restart_sequence,
        )

        return opportunity_id, bool(parent_row) or is_restart, restart_sequence

    async def _set_opportunity_assignee(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json={"asignado_a_usuario_id": str(usuario_id)},
            prefer="return=minimal",
        )

    async def get_pipeline_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener oportunidad del pipeline: {row!r}"
            )
        return row

    async def get_pipeline_opportunity_by_id(
        self,
        *,
        oportunidad_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene una oportunidad del pipeline usando únicamente su ID."""
        params = {
            "id": f"eq.{oportunidad_id}",
            "limit": "1",
            "select": self._PIPELINE_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidades", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener oportunidad por id: {row!r}")
        return row

    async def assign_next_sales_rep(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        """Invoca la RPC que selecciona al siguiente vendedor disponible."""
        payload = {"p_organizacion_id": str(organizacion_id)}
        data = await self._rpc("asignar_vendedor_round_robin", payload)
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict) and data:
            row = data
        else:
            return None
        usuario_value = row.get("usuario_id")
        if not usuario_value:
            return None
        usuario_id = _coerce_uuid(usuario_value, field="usuario_id")
        return {
            "usuario_id": usuario_id,
            "nombre": row.get("nombre"),
            "correo": row.get("correo"),
            "telefono_e164": row.get("telefono_e164"),
        }

    async def _assign_sales_rep_if_needed(
        self,
        *,
        oportunidad_id: UUID,
        organizacion_id: UUID,
        current_assignee: UUID | None = None,
        conversation_id: str | None = None,
        contact_id: str | None = None,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> UUID | None:
        """Asigna un vendedor round-robin cuando la oportunidad aún no tiene dueño."""
        if current_assignee:
            return current_assignee
        if require_contact_ready and not bool(contact_ready):
            logger.info(
                "crm.sales_assignment.skipped_contact_not_ready",
                extra={
                    "oportunidad_id": str(oportunidad_id),
                    "organizacion_id": str(organizacion_id),
                    "contact_id": contact_id,
                },
            )
            return None
        candidate = await self.assign_next_sales_rep(organizacion_id=organizacion_id)
        if not candidate:
            logger.info(
                "crm.sales_assignment.skipped",
                extra={
                    "oportunidad_id": str(oportunidad_id),
                    "organizacion_id": str(organizacion_id),
                },
            )
            return None
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json={"asignado_a_usuario_id": str(candidate["usuario_id"])},
            prefer="return=minimal",
        )
        logger.info(
            "crm.sales_assignment.completed",
            extra={
                "oportunidad_id": str(oportunidad_id),
                "organizacion_id": str(organizacion_id),
                "usuario_id": str(candidate["usuario_id"]),
            },
        )
        await self._insert_assignment_audit(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            vendedor_id=candidate["usuario_id"],
            conversation_id=conversation_id,
            contact_id=contact_id,
            trigger="auto_assign",
            metadata={"source": "round_robin"},
        )
        return candidate["usuario_id"]

    async def _set_conversation_restart_sequence(
        self,
        *,
        conversation_id: str,
        restart_sequence: int,
    ) -> None:
        conversation_key = (conversation_id or "").strip()
        if not conversation_key:
            return
        params = {
            "id": f"eq.{conversation_key}",
            "limit": "1",
        }
        payload = {"restart_sequence": max(1, restart_sequence)}
        try:
            await self._request(
                "PATCH",
                "/rest/v1/conversaciones",
                params=params,
                json=payload,
                prefer="return=minimal",
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "crm.conversation.restart_sequence_update_failed",
                extra={"conversation_id": conversation_key, "error": str(exc)},
            )

    async def insert_sales_assignment_audit(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None,
        vendedor_id: UUID,
        conversation_id: str | None,
        contact_id: str | None,
        trigger: str,
        metadata: dict[str, Any] | None = None,
        notification_sid: str | None = None,
    ) -> None:
        await self._insert_assignment_audit(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            vendedor_id=vendedor_id,
            conversation_id=conversation_id,
            contact_id=contact_id,
            trigger=trigger,
            metadata=metadata,
            notification_sid=notification_sid,
        )

    async def _insert_assignment_audit(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID | None,
        vendedor_id: UUID,
        conversation_id: str | None,
        contact_id: str | None,
        trigger: str,
        metadata: dict[str, Any] | None,
        notification_sid: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "vendedor_usuario_id": str(vendedor_id),
            "trigger_event": trigger,
            "metadata": metadata or {},
        }
        if oportunidad_id:
            payload["oportunidad_id"] = str(oportunidad_id)
        if conversation_id:
            payload["conversacion_id"] = str(conversation_id)
        if contact_id:
            payload["contacto_id"] = str(contact_id)
        if notification_sid:
            payload["notificacion_message_sid"] = notification_sid
        await self._request(
            "POST",
            "/rest/v1/asignaciones_vendedores_whatsapp",
            json=payload,
            prefer="return=minimal",
        )

    async def find_sales_rep_by_phone(self, *, phone_e164: str) -> dict[str, Any] | None:
        """Localiza a un usuario/empleado usando su número de WhatsApp."""
        normalized = (phone_e164 or "").strip()
        if not normalized:
            return None
        params = {
            "telefono_e164": f"eq.{normalized}",
            "select": "id,nombre_completo,correo",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/usuarios", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        try:
            usuario_id = UUID(str(row.get("id")))
        except (TypeError, ValueError):
            return None
        empleados_params = {
            "usuario_id": f"eq.{usuario_id}",
            "es_vendedor": "is.true",
            "select": "organizacion_id",
        }
        resp = await self._request("GET", "/rest/v1/empleados", params=empleados_params)
        empleados = resp.json() or []
        organizacion_ids: list[UUID] = []
        if isinstance(empleados, list):
            for item in empleados:
                try:
                    org_id = UUID(str(item.get("organizacion_id")))
                except (TypeError, ValueError):
                    continue
                organizacion_ids.append(org_id)
        if not organizacion_ids:
            return None
        return {
            "usuario_id": usuario_id,
            "nombre": row.get("nombre_completo") or row.get("correo"),
            "correo": row.get("correo"),
            "organizacion_ids": organizacion_ids,
        }

    async def find_pending_sales_assignment(
        self,
        *,
        vendedor_id: UUID,
        organizacion_ids: Sequence[UUID] | None = None,
    ) -> dict[str, Any] | None:
        """Obtiene la última notificación pendiente de acuse para el vendedor."""
        params: dict[str, Any] = {
            "vendedor_usuario_id": f"eq.{vendedor_id}",
            "aceptado_en": "is.null",
            "trigger_event": "like.notify_%",
            "order": "creado_en.desc",
            "limit": "1",
            "select": "id,organizacion_id,oportunidad_id,contacto_id,conversacion_id,metadata",
        }
        if organizacion_ids:
            org_values = ",".join(f'"{org_id}"' for org_id in organizacion_ids)
            params["organizacion_id"] = f"in.({org_values})"
        resp = await self._request(
            "GET",
            "/rest/v1/asignaciones_vendedores_whatsapp",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def update_sales_assignment_ack(
        self,
        *,
        assignment_id: UUID,
        ack_user_id: UUID,
        ack_time: datetime,
        ack_via: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Marca el registro de auditoría como aceptado por el vendedor."""
        params = {
            "id": f"eq.{assignment_id}",
            "limit": "1",
        }
        payload: dict[str, Any] = {
            "aceptado_en": ack_time.isoformat(),
            "aceptado_por_usuario_id": str(ack_user_id),
            "aceptado_via": ack_via,
        }
        if metadata is not None:
            payload["metadata"] = metadata
        await self._request(
            "PATCH",
            "/rest/v1/asignaciones_vendedores_whatsapp",
            params=params,
            json=payload,
            prefer="return=minimal",
        )

    async def get_contact_opportunity(
        self,
        *,
        contact_id: UUID,
        conversation_id: str | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "select": self._PIPELINE_SELECT,
            "order": "creado_en.desc",
            "limit": "1",
        }
        if conversation_id:
            params["metadata->>conversation_id"] = f"eq.{conversation_id}"
        else:
            params["contacto_principal_id"] = f"eq.{contact_id}"
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def update_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/oportunidades",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la oportunidad actualizada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar oportunidad: {row!r}")
        return row

    async def delete_opportunity(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
    ) -> None:
        params = {
            "id": f"eq.{oportunidad_id}",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/oportunidades",
            params=params,
            prefer="return=representation",
        )
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al eliminar oportunidad: {resp.text}"
            )

    async def register_webchat_message(
        self,
        *,
        session_id: str,
        author: str,
        content: str,
        response_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, str | None]:
        payload: dict[str, Any] = {
            "p_session_id": session_id,
            "p_author": author,
            "p_content": content,
        }
        if response_id:
            payload["p_response_id"] = response_id
        if metadata:
            payload["p_metadata"] = metadata
        if inactivity_hours is not None:
            payload["p_inactivity_hours"] = inactivity_hours
        if attachments:
            payload["p_attachments"] = attachments
        if organizacion_id:
            try:
                payload["p_organizacion_id"] = str(UUID(str(organizacion_id)))
            except (ValueError, TypeError) as exc:
                raise CRMRepositoryError(f"organizacion_id inválido: {organizacion_id}") from exc
        data = await self._rpc("registrar_mensaje_webchat", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_webchat: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_webchat: {row!r}")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "contact_id": row.get("contacto_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def register_whatsapp_message(
        self,
        *,
        direction: Literal["entrante", "saliente"],
        wa_id: str | None,
        phone_e164: str | None,
        body: str | None,
        message_sid: str | None,
        profile_name: str | None = None,
        conversation_id: str | None = None,
        contact_id: str | None = None,
        response_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        inactivity_minutes: int | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        webhook_payload: dict[str, Any] | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "p_direction": direction,
            "p_whatsapp_id": wa_id,
            "p_phone_e164": phone_e164,
            "p_body": body,
            "p_metadata": metadata or {},
            "p_message_sid": message_sid,
            "p_profile_name": profile_name,
            "p_conversation_id": conversation_id,
            "p_contact_id": contact_id,
            "p_response_id": response_id,
        }
        minutes = (
            inactivity_minutes
            if inactivity_minutes is not None
            else (inactivity_hours * 60 if inactivity_hours is not None else None)
        )
        if minutes is not None:
            payload["p_inactivity_minutes"] = minutes
        if attachments:
            payload["p_attachments"] = attachments
        if webhook_payload is not None:
            payload["p_webhook_payload"] = webhook_payload
        if organizacion_id:
            payload["p_organizacion_id"] = organizacion_id
        data = await self._rpc("registrar_mensaje_whatsapp", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_whatsapp: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_whatsapp: {row!r}")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "contact_id": row.get("contacto_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def register_messenger_message(
        self,
        *,
        sender_id: str,
        recipient_id: str | None = None,
        message_id: str | None = None,
        content: str | None = None,
        direction: Literal["entrante", "saliente"] = "entrante",
        metadata: dict[str, Any] | None = None,
        inactivity_hours: int | None = None,
        attachments: list[dict[str, Any]] | None = None,
        response_id: str | None = None,
        organizacion_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "p_sender_id": sender_id,
            "p_recipient_id": recipient_id,
            "p_message_id": message_id,
            "p_content": content,
            "p_direction": direction,
            "p_metadata": metadata or {},
            "p_inactivity_hours": inactivity_hours,
            "p_attachments": attachments or [],
            "p_response_id": response_id,
        }
        if organizacion_id:
            try:
                payload["p_organizacion_id"] = str(UUID(str(organizacion_id)))
            except (TypeError, ValueError) as exc:
                raise CRMRepositoryError(f"organizacion_id inválido: {organizacion_id}") from exc
        data = await self._rpc("registrar_mensaje_messenger", payload)
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(f"Respuesta inesperada registrar_mensaje_messenger: {data!r}")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida registrar_mensaje_messenger: {row!r}")
        return {
            "conversation_id": row.get("conversacion_id"),
            "message_id": row.get("mensaje_id"),
            "contact_id": row.get("contacto_id"),
            "openai_conversation_id": row.get("conversacion_openai_id"),
        }

    async def get_message_by_twilio_sid(self, *, message_sid: str) -> dict[str, Any] | None:
        """Obtiene el mensaje guardado con un SID de Twilio específico."""
        sid = str(message_sid or "").strip()
        if not sid:
            return None
        params = {
            "twilio_message_sid": f"eq.{sid}",
            "select": "id,direccion,twilio_message_sid,creado_en",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/mensajes", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if isinstance(row, dict):
            return row
        return None

    async def list_whatsapp_conversations_for_followup(
        self,
        *,
        inactive_since: datetime,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Lista conversaciones WhatsApp que superaron el umbral de inactividad."""
        cutoff = inactive_since.astimezone(timezone.utc).isoformat()
        params = {
            "select": (
                "id,contacto_id,organizacion_id,estado,ultimo_saliente_en,ultimo_entrante_en,"
                "conversaciones_controles(manual_override)"
            ),
            "canal": "eq.whatsapp",
            "ultimo_saliente_en": f"lte.{cutoff}",
            "order": "ultimo_saliente_en.asc",
            "limit": str(max(1, limit)),
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return []
        return data  # type: ignore[return-value]

    async def list_webchat_conversations_for_followup(
        self,
        *,
        inactive_since: datetime,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Lista conversaciones Webchat candidatas para reenganche."""
        cutoff = inactive_since.astimezone(timezone.utc).isoformat()
        params = {
            "select": (
                "id,contacto_id,organizacion_id,estado,ultimo_saliente_en,ultimo_entrante_en,"
                "conversaciones_controles(manual_override)"
            ),
            "canal": "eq.webchat",
            "estado": "in.(abierta,pendiente)",
            "ultimo_saliente_en": f"lte.{cutoff}",
            "order": "ultimo_saliente_en.asc",
            "limit": str(max(1, limit)),
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        return data if isinstance(data, list) else []

    async def get_conversation_with_controls(self, *, conversation_id: str) -> dict[str, Any]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        params = {
            "id": f"eq.{conversation_key}",
            "select": "id,contacto_id,canal,conversacion_openai_id,last_response_id,"
            "conversaciones_controles(manual_override)",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_not_found")
        return row

    async def get_latest_conversation_for_contact(
        self,
        *,
        contacto_id: UUID,
        canal: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "contacto_id": f"eq.{contacto_id}",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def create_conversation(
        self,
        *,
        contacto_id: UUID,
        canal: str,
        estado: str | None = None,
        asignado_a_usuario_id: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "contacto_id": str(contacto_id),
            "canal": canal,
        }
        if estado:
            body["estado"] = estado
        if asignado_a_usuario_id:
            body["asignado_a_usuario_id"] = str(asignado_a_usuario_id)
        resp = await self._request(
            "POST",
            "/rest/v1/conversaciones",
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_create_failed")
        return row

    async def get_webchat_contact_id_by_session(self, *, session_id: str) -> str | None:
        session_key = session_id.strip()
        if not session_key:
            return None
        params = {
            "select": "contacto_id",
            "canal": "eq.webchat",
            "id_externo": f"eq.{session_key}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        contact_id = row.get("contacto_id")
        return str(contact_id) if contact_id else None

    async def get_webchat_session_by_contact(self, *, contact_id: str) -> str | None:
        contact_key = contact_id.strip()
        if not contact_key:
            return None
        params = {
            "select": "id_externo",
            "contacto_id": f"eq.{contact_key}",
            "canal": "eq.webchat",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        session_id = row.get("id_externo")
        return str(session_id) if session_id else None

    async def get_latest_webchat_conversation(self, *, contact_id: str) -> dict[str, Any] | None:
        contact_key = contact_id.strip()
        if not contact_key:
            return None
        params = {
            "select": (
                "id,contacto_id,canal,conversacion_openai_id,last_response_id,"
                "conversaciones_controles(manual_override)"
            ),
            "contacto_id": f"eq.{contact_key}",
            "canal": "eq.webchat",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if not isinstance(row, dict):
            return None
        return row

    async def get_latest_whatsapp_conversation(self, *, contact_id: str) -> dict[str, Any] | None:
        contact_key = contact_id.strip()
        if not contact_key:
            return None
        params = {
            "select": "id,contacto_id,canal,estado",
            "contacto_id": f"eq.{contact_key}",
            "canal": "eq.whatsapp",
            "order": "iniciada_en.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        if not isinstance(row, dict):
            return None
        if str(row.get("estado") or "").lower() == "cerrada":
            return None
        return row

    async def upsert_conversation_insights(
        self,
        *,
        conversation_id: str,
        resumen: str | None = None,
        intencion: str | None = None,
        siguiente_accion: str | None = None,
    ) -> None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        payload: dict[str, Any] = {"conversacion_id": conversation_key}
        if resumen is not None:
            payload["resumen"] = resumen
        if intencion is not None:
            payload["intencion"] = intencion
        if siguiente_accion is not None:
            payload["siguiente_accion"] = siguiente_accion
        await self._request(
            "POST",
            "/rest/v1/conversaciones_insights",
            json=payload,
            params={"on_conflict": "conversacion_id"},
            prefer="resolution=merge-duplicates",
        )

    async def get_manual_override(self, *, conversation_id: str) -> bool:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return False
        params = {
            "select": "manual_override",
            "conversacion_id": f"eq.{conversation_key}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones_controles", params=params)
        data = resp.json() or []
        row: Any
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return False
        return bool(row.get("manual_override"))

    async def fetch_manual_overrides(self, *, conversation_ids: Sequence[str]) -> dict[str, bool]:
        cleaned = [cid.strip() for cid in conversation_ids if cid and cid.strip()]
        if not cleaned:
            return {}
        params = {
            "select": "conversacion_id,manual_override",
            "conversacion_id": f"in.({','.join(cleaned)})",
        }
        resp = await self._request("GET", "/rest/v1/conversaciones_controles", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return {}
        result: dict[str, bool] = {}
        for row in data:
            if isinstance(row, dict):
                cid = row.get("conversacion_id")
                if cid:
                    result[str(cid)] = bool(row.get("manual_override"))
        return result

    async def set_manual_override(self, *, conversation_id: str, manual: bool) -> None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        update_params = {"conversacion_id": f"eq.{conversation_key}"}
        update_payload = {"manual_override": manual}
        resp = await self._request(
            "PATCH",
            "/rest/v1/conversaciones_controles",
            params=update_params,
            json=update_payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            return
        insert_payload = {"conversacion_id": conversation_key, "manual_override": manual}
        try:
            await self._request(
                "POST",
                "/rest/v1/conversaciones_controles",
                json=insert_payload,
                prefer="return=representation",
            )
        except CRMRepositoryError as exc:
            message = str(exc).lower()
            if "duplicate key" not in message and "duplic" not in message:
                raise
            await self._request(
                "PATCH",
                "/rest/v1/conversaciones_controles",
                params=update_params,
                json=update_payload,
                prefer="return=representation",
            )

    async def fetch_recent_messages(
        self, *, conversation_id: str, limit: int = 8
    ) -> list[dict[str, Any]]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return []
        params = {
            "select": "id,direccion,texto,creado_en,datos,"
            "attachments:adjuntos(id,url,mime,tamano_bytes,size_bytes,proveedor_id,nombre,path)",
            "conversacion_id": f"eq.{conversation_key}",
            "order": "creado_en.asc",
            "limit": str(max(1, limit)),
        }
        resp = await self._request("GET", "/rest/v1/mensajes", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            return []
        return data  # type: ignore[return-value]

    async def create_conversation_summary(
        self,
        *,
        conversacion_id: str,
        resumen: str,
        contacto_id: str | None = None,
        organizacion_id: str | None = None,
        tipo: str | None = None,
        metadatos: dict[str, Any] | None = None,
        creado_por_usuario_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "conversacion_id": conversacion_id,
            "resumen": resumen,
            "metadatos": metadatos or {},
        }
        if contacto_id:
            payload["contacto_id"] = contacto_id
        if organizacion_id:
            payload["organizacion_id"] = organizacion_id
        if tipo:
            payload["tipo"] = tipo
        if creado_por_usuario_id:
            payload["creado_por_usuario_id"] = creado_por_usuario_id
        resp = await self._request(
            "POST",
            "/rest/v1/conversation_summaries",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el resumen de conversación creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear resumen: {row!r}")
        return row

    async def record_delivery_event(
        self,
        *,
        provider: str,
        message_sid: str,
        event: str,
        raw_payload: dict[str, Any] | None = None,
        error_code: str | None = None,
        provider_timestamp: str | None = None,
    ) -> dict[str, Any]:
        message_id: str | None = None
        if message_sid:
            params = {
                "select": "id",
                "twilio_message_sid": f"eq.{message_sid}",
                "limit": "1",
            }
            resp = await self._request("GET", "/rest/v1/mensajes", params=params)
            data = resp.json() or []
            row: dict[str, Any] | None
            if isinstance(data, list) and data:
                row = data[0]
            elif isinstance(data, dict):
                row = data
            else:
                row = None
            if isinstance(row, dict):
                message_id = row.get("id")
        payload: dict[str, Any] = {
            "proveedor": provider,
            "evento": event,
            "codigo_error": error_code,
            "payload_crudo": raw_payload or {},
        }
        if message_id:
            payload["mensaje_id"] = message_id
        if provider_timestamp:
            payload["proveedor_ts"] = provider_timestamp

        resp = await self._request(
            "POST",
            "/rest/v1/eventos_entrega",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            raise CRMRepositoryError(
                f"Respuesta inesperada al registrar evento de entrega: {data!r}"
            )
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al registrar evento: {row!r}")
        return row

    async def fetch_latest_conversation_summary(
        self,
        *,
        conversation_id: str,
        tipo: str | None = None,
    ) -> dict[str, Any] | None:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            return None
        params: dict[str, Any] = {
            "conversacion_id": f"eq.{conversation_key}",
            "order": "creado_en.desc",
            "limit": "1",
        }
        if tipo:
            params["tipo"] = f"eq.{tipo}"
        resp = await self._request("GET", "/rest/v1/conversation_summaries", params=params)
        data = resp.json() or []
        row: dict[str, Any] | None
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def upload_webchat_object(
        self,
        *,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        return await self.upload_storage_object(
            bucket="webchat",
            object_key=object_key,
            content=content,
            content_type=content_type,
        )

    async def upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        return await self._upload_storage_object(
            bucket=bucket,
            object_key=object_key,
            content=content,
            content_type=content_type,
        )

    async def record_webchat_session_closure(self, *, session_id: str) -> None:
        session_key = session_id.strip()
        if not session_key:
            raise CRMRepositoryError("session_id_required")
        await self._request(
            "POST",
            "/rest/v1/webchat_session_closures",
            json={"session_id": session_key},
            prefer="resolution=merge-duplicates",
        )

    async def get_latest_webchat_session_closure(self, *, session_id: str) -> dict[str, Any] | None:
        session_key = session_id.strip()
        if not session_key:
            return None
        params = {
            "select": "session_id,closed_at,contacto_id,organizacion_id",
            "session_id": f"eq.{session_key}",
            "order": "closed_at.desc",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/webchat_session_closures", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            return None
        return row if isinstance(row, dict) else None

    async def record_webchat_visit(
        self,
        *,
        session_id: str,
        payload: dict[str, Any],
    ) -> None:
        session_key = session_id.strip()
        if not session_key:
            raise CRMRepositoryError("session_id_required")
        body = {"p_session_id": session_key, **payload}
        await self._rpc("record_webchat_visitante", body)

    async def update_conversation(
        self, *, conversation_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        conversation_key = conversation_id.strip()
        if not conversation_key:
            raise CRMRepositoryError("conversation_id_required")
        params = {"id": f"eq.{conversation_key}", "limit": "1"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/conversaciones",
            params=params,
            json=patch,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("conversation_not_found")
        return row

    async def _get_default_stage_id(self, *, organizacion_id: UUID) -> UUID:
        cache_key = str(organizacion_id)
        cached = self._stage_cache.get(cache_key)
        if cached:
            return cached
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
            "select": "id",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("No se encontraron etapas de pipeline para la organización")
        stage_id = _coerce_uuid(data[0].get("id"), field="etapa_id")
        self._stage_cache[cache_key] = stage_id
        return stage_id

    async def get_default_stage_id(self, *, organizacion_id: UUID) -> UUID:
        """Expone el ID de la primera etapa del pipeline para una organización."""

        return await self._get_default_stage_id(organizacion_id=organizacion_id)

    async def _get_first_stage_row(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
            "select": "id,codigo,nombre,orden,categoria,metadata,tablero_id,tablero_slug,tablero_nombre",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        return row

    async def ensure_prospeccion_stage(self, *, organizacion_id: UUID) -> dict[str, Any]:
        """Garantiza que exista la etapa 'Prospección · Primer contacto'."""

        target_code = "prospeccion_primer_contacto"
        existing = await self.get_stage_by_code(
            organizacion_id=organizacion_id,
            codigo=target_code,
        )
        if existing:
            return existing

        base_stage = await self._get_first_stage_row(organizacion_id=organizacion_id)
        base_metadata = _ensure_metadata(base_stage.get("metadata")) if base_stage else {}
        base_metadatos = _ensure_metadata(base_metadata.get("metadatos"))

        tablero_id = (
            (base_stage.get("tablero_id") if base_stage else None)
            or base_metadata.get("tablero_id")
            or base_metadata.get("tableroId")
        )
        tablero_nombre = (
            (base_stage.get("tablero_nombre") if base_stage else None)
            or base_metadata.get("tablero_nombre")
        )
        tablero_slug = (
            (base_stage.get("tablero_slug") if base_stage else None)
            or base_metadata.get("tablero_slug")
        )

        stage_metadatos = dict(base_metadatos)
        stage_metadatos.update(
            {
                "color": stage_metadatos.get("color") or "indigo",
                "etiqueta": stage_metadatos.get("etiqueta") or "Prospección",
                "descripcion": stage_metadatos.get("descripcion")
                or "Primer contacto originado desde búsquedas y campañas de prospección.",
                "is_counter_only": False,
            }
        )

        stage_metadata: dict[str, Any] = {
            "seed": "prospeccion_stage",
            "legacy_codigo": target_code,
            "metadatos": stage_metadatos,
        }
        if tablero_id:
            stage_metadata["tablero_id"] = tablero_id
        if tablero_nombre:
            stage_metadata["tablero_nombre"] = tablero_nombre
        if tablero_slug:
            stage_metadata["tablero_slug"] = tablero_slug

        base_order_value = base_stage.get("orden") if base_stage else None
        try:
            base_order = int(base_order_value) if base_order_value is not None else 10
        except (TypeError, ValueError):
            base_order = 10
        stage_order = max(1, base_order - 5)

        body = {
            "organizacion_id": str(organizacion_id),
            "codigo": target_code,
            "nombre": "Prospección · Primer contacto",
            "orden": stage_order,
            "probabilidad": "5.00",
            "categoria": "abierta",
            "metadata": stage_metadata,
        }
        resp = await self._request(
            "POST",
            "/rest/v1/etapas_pipeline",
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospeccion_stage_not_created")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError("prospeccion_stage_invalid_response")

        stage_payload = {
            "id": _coerce_uuid(row.get("id"), field="etapa_id"),
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "orden": row.get("orden"),
            "categoria": row.get("categoria"),
            "metadata": row.get("metadata"),
        }
        cache_key = (str(organizacion_id), target_code)
        self._stage_code_cache[cache_key] = stage_payload
        self._stage_cache.pop(str(organizacion_id), None)
        return stage_payload

    async def get_stage_by_code(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
    ) -> dict[str, Any] | None:
        normalized = (codigo or "").strip().lower()
        if not normalized:
            return None
        cache_key = (str(organizacion_id), normalized)
        cached = self._stage_code_cache.get(cache_key)
        if cached:
            return cached
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,codigo,nombre,orden,categoria,metadata",
            "order": "orden.asc",
            "limit": "1",
            "or": f"(codigo.eq.{normalized},metadata->>legacy_codigo.eq.{normalized})",
        }
        resp = await self._request("GET", "/rest/v1/etapas_pipeline", params=params)
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        stage_id = _coerce_uuid(row.get("id"), field="etapa_id")
        stage_payload = {
            "id": stage_id,
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "orden": row.get("orden"),
            "categoria": row.get("categoria"),
            "metadata": row.get("metadata"),
        }
        self._stage_code_cache[cache_key] = stage_payload
        return stage_payload

    async def create_lead_event(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/lead_eventos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el evento del lead")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear evento de lead: {row!r}")
        return row

    async def list_notes(
        self,
        *,
        organizacion_id: UUID,
        relacion_tipo: str | None = None,
        relacion_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        if relacion_tipo:
            params["relacion_tipo"] = f"eq.{relacion_tipo}"
        if relacion_id:
            params["relacion_id"] = f"eq.{relacion_id}"
        resp = await self._request("GET", "/rest/v1/notas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar notas: {data!r}")
        return data

    async def create_note(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/notas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la nota creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear nota: {row!r}")
        return row

    async def list_audit_logs(
        self,
        *,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": "200",
        }
        resp = await self._request("GET", "/rest/v1/audit_logs", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar audit logs: {data!r}")
        return data

    async def append_stage_history(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/oportunidad_etapas_historial",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el historial de etapa")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al registrar historial: {row!r}")
        return row

    async def get_account(
        self,
        *,
        organizacion_id: UUID,
        account_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{account_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener cuenta: {row!r}")
        return row

    async def list_pipeline_opportunities(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 500,
        created_from: datetime | None = None,
        tablero_id: UUID | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Listar oportunidades de pipeline con filtros opcionales y conteo total."""

        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "select": self._PIPELINE_SELECT,
        }
        if created_from:
            params["creado_en"] = f"gte.{created_from.isoformat()}"
        if tablero_id:
            tablero_filter = str(tablero_id)
            params["or"] = (
                f"(tablero_id.eq.{tablero_filter},"
                f"metadata->>tablero_id.eq.{tablero_filter},"
                f"etapa.metadata->>tablero_id.eq.{tablero_filter})"
            )
            params["order"] = "etapa.orden.asc,creado_en.desc"
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
            prefer="count=exact",
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar pipeline de oportunidades: {data!r}"
            )
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def search_contacts(
        self,
        *,
        organizacion_id: UUID,
        query: str,
        limit: int = 8,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        sanitized = query.strip()
        if not sanitized:
            return []
        # Evitamos caracteres que rompan el or-filter de Supabase
        for char in ("(", ")", ","):
            sanitized = sanitized.replace(char, " ")
        sanitized = sanitized.replace("*", "")
        pattern = f"*{sanitized}*"
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": "id,organizacion_id,nombre_completo,correo,telefono_e164,company_name,notes,necesidad_proposito,estado,metadata",
            "order": "actualizado_en.desc.nullslast",
            "limit": str(limit),
            "offset": str(offset),
            "or": f"(nombre_completo.ilike.*{pattern}*,correo.ilike.*{pattern}*,telefono_e164.ilike.*{pattern}*,company_name.ilike.*{pattern}*)",
        }
        resp = await self._request("GET", "/rest/v1/contactos", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al buscar contactos: {data!r}")
        return data

    async def get_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{contacto_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/contactos", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener contacto: {row!r}")
        return row

    async def update_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not payload:
            existing = await self.get_contact(
                organizacion_id=organizacion_id,
                contacto_id=contacto_id,
            )
            if existing is None:
                raise CRMRepositoryError("contacto_no_encontrado")
            return existing
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{contacto_id}",
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/contactos",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el contacto actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar contacto: {row!r}")
        return row

    async def get_contact_by_id(self, *, contact_id: str) -> dict[str, Any] | None:
        contact_key = contact_id.strip()
        if not contact_key:
            return None
        params = {
            "id": f"eq.{contact_key}",
            "limit": "1",
            "select": (
                "id,organizacion_id,nombre_completo,correo,telefono_e164,company_name,notes,"
                "necesidad_proposito,contacto_datos"
            ),
        }
        resp = await self._request("GET", "/rest/v1/contactos", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def list_contact_identities(self, *, contact_id: str) -> list[dict[str, Any]]:
        contact_key = contact_id.strip()
        if not contact_key:
            return []
        params = {
            "select": "canal,id_externo,metadatos",
            "contacto_id": f"eq.{contact_key}",
        }
        resp = await self._request("GET", "/rest/v1/identidades_canal", params=params)
        data = resp.json() or []
        return data if isinstance(data, list) else []

    async def update_contact_by_id(
        self, *, contact_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        if not patch:
            raise CRMRepositoryError("contact_patch_empty")
        record = await self.get_contact_by_id(contact_id=contact_id)
        if not record:
            raise CRMRepositoryError("contact_not_found")
        org_value = record.get("organizacion_id")
        if not org_value:
            raise CRMRepositoryError("contact_missing_org")
        try:
            org_uuid = UUID(str(org_value))
            contact_uuid = UUID(str(record.get("id") or contact_id))
        except (TypeError, ValueError) as exc:
            raise CRMRepositoryError("contact_invalid_uuid") from exc
        return await self.update_contact(
            organizacion_id=org_uuid,
            contacto_id=contact_uuid,
            payload=patch,
        )

    async def create_contact(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/contactos",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el contacto creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear contacto: {row!r}")
        return row

    async def fetch_user_profile(self, usuario_id: UUID) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{usuario_id}",
            "select": "id,nombre_completo,correo",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/usuarios", params=params)
        data = resp.json()
        if isinstance(data, list) and data:
            row = data[0]
            if isinstance(row, dict):
                return row
        return None

    async def delete_contact(
        self,
        *,
        organizacion_id: UUID,
        contacto_id: UUID,
    ) -> None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{contacto_id}",
        }
        await self._request(
            "DELETE",
            "/rest/v1/contactos",
            params=params,
            prefer="return=representation",
        )

    async def list_opportunity_stage_history(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "order": "cambiado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
            "select": self._HISTORY_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidad_etapas_historial", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar historial de oportunidad: {data!r}"
            )
        return data

    async def get_opportunity_history_entry(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        history_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "id": f"eq.{history_id}",
            "limit": "1",
            "select": self._HISTORY_SELECT,
        }
        resp = await self._request("GET", "/rest/v1/oportunidad_etapas_historial", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener historial: {row!r}")
        return row

    async def append_note_history(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        etapa_id: UUID,
        usuario_id: UUID | None,
        texto: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "oportunidad_id": str(oportunidad_id),
            "etapa_origen_id": str(etapa_id),
            "etapa_destino_id": str(etapa_id),
            "cambiado_por_usuario_id": str(usuario_id) if usuario_id else None,
            "motivo": None,
            "fuente": "humano",
            "metadata": {
                "tipo": "nota",
                "nota": texto,
                **(metadata or {}),
            },
        }
        return await self.append_stage_history(
            organizacion_id=organizacion_id,
            payload={k: v for k, v in payload.items() if v is not None},
        )

    async def list_catalog_items(
        self,
        *,
        include_inactive: bool = False,
        tipo: str | None = None,
        search: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 500))),
        }
        if not include_inactive:
            params["activo"] = "eq.true"
        if tipo:
            params["tipo"] = f"eq.{tipo}"
        if search:
            pattern = search.strip()
            if pattern:
                sanitized = pattern.replace("%", "").replace("*", "")
                params["or"] = (
                    f"(nombre.ilike.*{sanitized}*,slug.ilike.*{sanitized}*,"
                    f"descripcion_corta.ilike.*{sanitized}*)"
                )
        resp = await self._request("GET", "/rest/v1/catalog_items", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar catálogo: {data!r}")
        return data

    async def create_catalog_item(
        self,
        *,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "/rest/v1/catalog_items",
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el catálogo creado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear catálogo: {row!r}")
        return row

    async def update_catalog_item(
        self,
        *,
        item_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/catalog_items",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al actualizar catálogo: {row!r}")
        return row

    async def delete_catalog_item(
        self,
        *,
        item_id: UUID,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "DELETE",
            "/rest/v1/catalog_items",
            params=params,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al eliminar catálogo: {row!r}")
        return row

    async def soft_delete_catalog_item(
        self,
        *,
        item_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        params = {"id": f"eq.{item_id}"}
        resp = await self._request(
            "PATCH",
            "/rest/v1/catalog_items",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("catalog_item_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al archivar catálogo: {row!r}")
        return row

    async def contactos_resumen(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_contactos_resumen",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        raise CRMRepositoryError(f"Respuesta inesperada en contactos_resumen: {data!r}")

    async def contactos_timeline(
        self,
        *,
        usuario_token: str,
    ) -> list[dict[str, Any]]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_contactos_timeline",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en contactos_timeline: {data!r}")
        return data

    async def contactos_list(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        body = {
            "p_limit": max(1, min(limit, 500)),
            "p_offset": 0,
            "p_order_by": "creado_en",
            "p_order_dir": "desc",
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_contactos_list",
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en contactos_list: {data!r}")
        return data

    async def inbox_summary(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_resumen",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_resumen: {data!r}")

    async def inbox_threads(
        self,
        *,
        usuario_token: str,
        estado: str | None = None,
        asignado_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
        message_limit: int = 20,
    ) -> list[dict[str, Any]]:
        body = {
            "p_estado": estado,
            "p_asignado": str(asignado_id) if asignado_id else None,
            "p_limit": max(1, min(limit, 200)),
            "p_offset": max(0, offset),
            "p_message_limit": max(1, min(message_limit, 50)),
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_threads",
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_threads: {data!r}")
        return data

    async def inbox_messages(
        self,
        *,
        usuario_token: str,
        conversacion_id: UUID,
        limit: int = 100,
        before: str | None = None,
    ) -> list[dict[str, Any]]:
        body: dict[str, Any] = {
            "p_conversacion_id": str(conversacion_id),
            "p_limit": max(1, min(limit, 500)),
        }
        if before:
            body["p_before"] = before
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_inbox_messages",
            token=usuario_token,
            json=body,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en panel_inbox_messages: {data!r}")
        return data

    async def visitas_dashboard_kpis(
        self,
        *,
        usuario_token: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if date_from:
            body["p_from"] = date_from.isoformat()
        if date_to:
            body["p_to"] = date_to.isoformat()
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/dashboard_kpis",
            token=usuario_token,
            json=body or None,
            prefer="return=representation",
        )
        data = resp.json()
        if isinstance(data, dict):
            return data
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        raise CRMRepositoryError(f"Respuesta inesperada en dashboard_kpis: {data!r}")

    async def visitas_estados(
        self,
        *,
        usuario_token: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_estados",
                token=usuario_token,
                json=payload or None,
                prefer="return=representation",
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_estados",
                json=payload or None,
                prefer="return=representation",
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada en panel_visitantes_sin_chat_estados: {data!r}"
        )

    async def visitas_municipios(
        self,
        *,
        state_code: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_estado": state_code}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_municipios",
                token=usuario_token,
                json=payload,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_sin_chat_municipios",
                json=payload,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada en panel_visitantes_sin_chat_municipios: {data!r}"
        )

    async def visitas_paises(
        self,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_visitantes_world_paises",
                token=usuario_token,
                json=payload or None,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_visitantes_world_paises",
                json=payload or None,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_visitantes_world_paises: {data!r}")

    async def leads_estados(
        self,
        *,
        channels: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if channels:
            payload["p_canales"] = ",".join(channels)
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_estados",
                token=usuario_token,
                json=payload or None,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_estados",
                json=payload or None,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_leads_geo_estados: {data!r}")

    async def leads_municipios(
        self,
        *,
        state_code: str,
        channels: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"p_estado": state_code}
        if channels:
            payload["p_canales"] = ",".join(channels)
        if date_from:
            payload["p_from"] = date_from.isoformat()
        if date_to:
            payload["p_to"] = date_to.isoformat()
        if usuario_token:
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_municipios",
                token=usuario_token,
                json=payload,
            )
        else:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/panel_leads_geo_municipios",
                json=payload,
            )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_leads_geo_municipios: {data!r}")

    async def analytics_catalog_sales(
        self,
        *,
        usuario_token: str,
        mes_desde: str | None = None,
        mes_hasta: str | None = None,
        moneda: str | None = None,
    ) -> list[dict[str, Any]]:
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
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/ventas_por_producto_mes",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en ventas_por_producto_mes: {data!r}")

    async def analytics_catalog_pipeline(
        self,
        *,
        usuario_token: str,
        tablero_id: UUID | None = None,
        etapa_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "tablero_id,etapa_id,catalog_item_id,item_nombre,moneda,monto_estimado,leads_con_cotizacion",
        }
        if tablero_id:
            params["tablero_id"] = f"eq.{tablero_id}"
        if etapa_id:
            params["etapa_id"] = f"eq.{etapa_id}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/embudo_por_producto",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en embudo_por_producto: {data!r}")

    async def visitas_detalle(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        order_by: str = "primera",
        order_dir: Literal["asc", "desc"] = "asc",
        with_contacts_only: bool = False,
    ) -> list[dict[str, Any]]:
        body = {
            "p_limit": max(1, min(limit, 500)),
            "p_offset": max(0, offset),
            "p_order_by": order_by,
            "p_order_dir": order_dir,
        }
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_webchat_visitas_detalle",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada en panel_webchat_visitas_detalle: {data!r}"
            )
        if with_contacts_only:
            data = [row for row in data if isinstance(row, dict) and row.get("contacto_id")]
        return data

    async def visitas_detalle_custom(
        self,
        *,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        resp = await self._request(
            "POST",
            "/rest/v1/rpc/panel_webchat_visitas_detalle",
            json=payload,
        )
        data = resp.json() or []
        if isinstance(data, list):
            return data
        raise CRMRepositoryError(f"Respuesta inesperada en panel_webchat_visitas_detalle: {data!r}")

    async def visitas_whatsapp_total(
        self,
        *,
        usuario_token: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> int:
        body: dict[str, Any] = {}
        if date_from:
            body["p_from"] = date_from.isoformat()
        if date_to:
            body["p_to"] = date_to.isoformat()
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/embudo_visitantes_whatsapp",
            token=usuario_token,
            json=body or None,
            prefer="return=representation",
        )
        data = resp.json()
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict) and "total" in first:
                try:
                    return int(first["total"] or 0)
                except (TypeError, ValueError):
                    pass
            if isinstance(first, (int, float)):
                return int(first)
        if isinstance(data, dict) and "total" in data:
            try:
                return int(data["total"] or 0)
            except (TypeError, ValueError):
                pass
        if isinstance(data, (int, float)):
            return int(data)
        raise CRMRepositoryError(f"Respuesta inesperada en embudo_visitantes_whatsapp: {data!r}")

    async def visitas_whatsapp_conversaciones(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params = {
            "select": (
                "id,canal,iniciada_en,ultimo_mensaje_en,"
                "contacto:contactos(nombre_completo,correo,telefono_e164)"
            ),
            "canal": "eq.whatsapp",
            "order": "iniciada_en.desc",
            "limit": str(max(1, min(limit, 500))),
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/conversaciones",
            token=usuario_token,
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada en conversaciones: {data!r}")
        return data

    async def list_whatsapp_sales_assignments(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": str(limit),
            "offset": str(offset),
            "order": order,
        }
        resp = await self._request(
            "GET",
            "/rest/v1/v_asignaciones_vendedores_whatsapp",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(
                f"Respuesta inesperada al listar asignaciones WhatsApp: {data!r}"
            )
        return data

    async def list_agenda_bookings(
        self,
        *,
        usuario_token: str,
        params: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], int | None]:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/panel_calendar_bookings",
            token=usuario_token,
            params=params,
            prefer="count=planned",
        )
        raw = resp.json() or []
        if not isinstance(raw, list):
            raw = []
        total = self._extract_total_count(resp.headers.get("content-range"))
        return raw, total

    async def get_calendar_booking(
        self,
        *,
        usuario_token: str,
        booking_id: UUID,
    ) -> dict[str, Any]:
        params = {
            "id": f"eq.{booking_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/calendar_bookings",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            raise CRMRepositoryError("booking_not_found")
        return row

    async def get_calendar_booking_by_id(
        self,
        *,
        booking_id: UUID,
    ) -> dict[str, Any] | None:
        """Recupera una cita del calendario usando service role."""
        params = {
            "id": f"eq.{booking_id}",
            "select": "id,resource_id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/calendar_bookings", params=params)
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        elif isinstance(data, dict):
            row = data
        else:
            row = None
        if not isinstance(row, dict):
            return None
        return row

    async def update_calendar_booking_metadata(
        self,
        *,
        booking_id: str,
        metadata: dict[str, Any],
    ) -> None:
        booking_key = booking_id.strip()
        if not booking_key:
            raise CRMRepositoryError("booking_id_required")
        params = {"id": f"eq.{booking_key}", "limit": "1"}
        await self._request(
            "PATCH",
            "/rest/v1/calendar_bookings",
            params=params,
            json={"metadata": metadata},
            prefer="return=minimal",
        )

    async def user_has_role(self, *, usuario_id: UUID, role_code: str) -> bool:
        normalized_target = (role_code or "").strip().lower()
        if not normalized_target:
            return False

        alias_map: dict[str, set[str]] = {
            "admin": {"admin", "administrador"},
            "administrador": {"admin", "administrador"},
        }
        lookup_targets = alias_map.get(normalized_target, {normalized_target})

        params = {
            "select": "rol:roles(codigo,nombre)",
            "usuario_id": f"eq.{usuario_id}",
        }
        resp = await self._request("GET", "/rest/v1/usuarios_roles", params=params)
        data = resp.json() or []

        rows: list[Any]
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = []

        for row in rows:
            role = row.get("rol") if isinstance(row, dict) else None
            if not isinstance(role, dict):
                continue
            codigo_norm = str(role.get("codigo") or "").strip().lower()
            nombre_norm = str(role.get("nombre") or "").strip().lower()
            if codigo_norm in lookup_targets or nombre_norm in lookup_targets:
                return True
        return False

    async def list_clientes(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "select": self._CLIENTE_SELECT,
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar clientes: {data!r}")
        return data

    async def get_cliente_por_oportunidad(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "oportunidad_id": f"eq.{oportunidad_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/clientes",
                    token=usuario_token,
                    params=params,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
            else:
                data = resp.json() or []
                row = self._first_row(data)
                if isinstance(row, dict):
                    return row
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def get_cliente_por_id(
        self,
        *,
        organizacion_id: UUID,
        cliente_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "id": f"eq.{cliente_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "GET",
                    "/rest/v1/clientes",
                    token=usuario_token,
                    params=params,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
            else:
                data = resp.json() or []
                row = self._first_row(data)
                if isinstance(row, dict):
                    return row
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def get_cliente_por_id_service(
        self,
        *,
        cliente_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{cliente_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/clientes", params=params)
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def update_cliente(
        self,
        *,
        cliente_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/clientes",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/clientes",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def convert_oportunidad_en_cliente(
        self,
        *,
        organizacion_id: UUID,
        oportunidad_id: UUID,
        usuario_token: str | None = None,
        forzar: bool = False,
    ) -> Any:
        body = {"p_tarjeta_id": str(oportunidad_id), "p_forzar": forzar}
        resp: httpx.Response | None = None
        if usuario_token:
            try:
                resp = await self._request_with_user(
                    "POST",
                    "/rest/v1/rpc/convertir_lead_en_cliente",
                    token=usuario_token,
                    json=body,
                )
            except CRMRepositoryError as exc:
                if not _is_jwt_expired_error(exc):
                    raise
        if resp is None:
            resp = await self._request(
                "POST",
                "/rest/v1/rpc/convertir_lead_en_cliente",
                json=body,
            )
        try:
            return resp.json()
        except ValueError as exc:
            raise CRMRepositoryError("convertir_lead_response_invalid") from exc

    async def create_cliente_document(
        self,
        *,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        request = (
            self._request_with_user(
                "POST",
                "/rest/v1/cliente_documentos",
                token=usuario_token,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "POST",
                "/rest/v1/cliente_documentos",
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("documento_not_created")
        return row

    async def update_cliente_document(
        self,
        *,
        cliente_id: UUID,
        documento_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{documento_id}", "cliente_id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/cliente_documentos",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/cliente_documentos",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("documento_not_found")
        return row

    async def create_cliente_responsable(
        self,
        *,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        request = (
            self._request_with_user(
                "POST",
                "/rest/v1/cliente_responsables",
                token=usuario_token,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "POST",
                "/rest/v1/cliente_responsables",
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("responsable_not_created")
        return row

    async def update_cliente_responsable(
        self,
        *,
        cliente_id: UUID,
        responsable_id: UUID,
        payload: dict[str, Any],
        usuario_token: str | None = None,
    ) -> dict[str, Any]:
        params = {"id": f"eq.{responsable_id}", "cliente_id": f"eq.{cliente_id}"}
        request = (
            self._request_with_user(
                "PATCH",
                "/rest/v1/cliente_responsables",
                token=usuario_token,
                params=params,
                json=payload,
                prefer="return=representation",
            )
            if usuario_token
            else self._request(
                "PATCH",
                "/rest/v1/cliente_responsables",
                params=params,
                json=payload,
                prefer="return=representation",
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("responsable_not_found")
        return row

    async def create_portal_token(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/cliente_portal_tokens",
            token=usuario_token,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("portal_token_create_failed")
        return row

    async def get_portal_token(
        self,
        *,
        portal_token: str,
        include_relations: bool = True,
    ) -> dict[str, Any] | None:
        params = {
            "token": f"eq.{portal_token}",
            "select": (
                self._PORTAL_TOKEN_SELECT if include_relations else self._PORTAL_TOKEN_MIN_SELECT
            ),
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/cliente_portal_tokens",
            params=params,
        )
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def touch_portal_token(
        self,
        *,
        token_id: UUID,
        usos: int,
        ip: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "usos": usos,
            "ultimo_acceso_en": datetime.now(timezone.utc).isoformat(),
        }
        if ip:
            payload["ultimo_acceso_ip"] = ip
        await self._request(
            "PATCH",
            "/rest/v1/cliente_portal_tokens",
            params={"id": f"eq.{token_id}"},
            json=payload,
        )

    async def create_prospeccion_busqueda(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> Any:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/crear_busqueda",
            token=usuario_token,
            json=payload,
        )
        try:
            return resp.json()
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("crear_busqueda_response_invalid") from exc

    async def upsert_prospeccion_resultados(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> Any:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/upsert_resultados_lote",
            token=usuario_token,
            json=payload,
        )
        try:
            return resp.json()
        except ValueError as exc:  # pragma: no cover
            raise CRMRepositoryError("upsert_resultados_invalid_response") from exc

    async def list_prospeccion_busquedas(
        self,
        *,
        usuario_token: str,
        params: dict[str, str],
    ) -> tuple[list[dict[str, Any]], int | None]:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/busquedas",
            token=usuario_token,
            params=params,
            prefer="count=planned",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar búsquedas: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        return data, total

    async def delete_prospeccion_busqueda(
        self,
        *,
        busqueda_id: UUID,
        fuente: str,
    ) -> int:
        params = {
            "id": f"eq.{busqueda_id}",
            "fuente": f"eq.{fuente}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/busquedas",
            params=params,
            prefer="return=representation",
        )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al eliminar búsqueda: {data!r}")
        return len(data)

    async def list_prospeccion_resultados(
        self,
        *,
        usuario_token: str,
        path: str,
        params: dict[str, str],
    ) -> tuple[list[dict[str, Any]], int | None]:
        resp = await self._request_with_user(
            "GET",
            path,
            token=usuario_token,
            params=params,
            prefer="count=planned",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar resultados: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        return data, total

    async def delete_prospeccion_resultados(
        self,
        *,
        ids: list[UUID],
        fuente: str,
    ) -> int:
        ids_param = ",".join(str(value) for value in ids)
        params = {
            "id": f"in.({ids_param})",
            "fuente": f"eq.{fuente}",
        }
        resp = await self._request(
            "DELETE",
            "/rest/v1/resultados",
            params=params,
            prefer="return=representation",
        )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al eliminar resultados: {data!r}")
        return len(data)

    async def list_contactables_by_ids(
        self,
        *,
        usuario_token: str,
        fuente: str,
        resultado_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene filas de vistas contactables filtradas por resultado_id."""

        if not resultado_ids:
            return []
        ids_param = ",".join(str(value) for value in resultado_ids)
        path_map = {
            "google_places": "/rest/v1/v_google_places_contactables",
            "denue": "/rest/v1/v_denue_contactables",
        }
        path = path_map.get(fuente)
        if not path:
            raise CRMRepositoryError(f"fuente_contactable_desconocida:{fuente}")
        params = {
            "select": "*",
            "resultado_id": f"in.({ids_param})",
        }
        resp = await self._request_with_user(
            "GET",
            path,
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar contactables: {data!r}")
        return data

    async def upsert_prospeccion_prospectos(
        self,
        *,
        usuario_token: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Inserta o actualiza prospectos seleccionados desde resultados."""

        if not items:
            return []
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"on_conflict": "resultado_id"},
            json=items,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al upsert prospectos: {data!r}")
        return data

    async def create_prospecto_manual(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Inserta un prospecto manual etiquetado como fuente usuario."""

        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospecto_manual_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"prospecto_manual_invalid:{row!r}")
        return row

    async def list_prospectos_by_ids(
        self,
        *,
        usuario_token: str,
        prospecto_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene prospectos filtrando por su identificador."""

        if not prospecto_ids:
            return []
        ids_param = ",".join(str(value) for value in prospecto_ids)
        params = {"id": f"in.({ids_param})"}
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos: {data!r}")
        return data

    async def list_prospectos(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
        fuente: str | None = None,
        lookup_status: str | None = None,
        segmento: str | None = None,
        carrier_type: str | None = None,
        order: str | None = None,
        stage: str | None = None,
        whatsapp_permitido: bool | None = None,
        llamada_permitida: bool | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista prospectos con filtros de búsqueda y totalizador."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }

        if fuente:
            params["fuente"] = f"eq.{fuente}"
        if lookup_status:
            params["lookup_status"] = f"eq.{lookup_status}"
        if segmento:
            params["segmento"] = f"eq.{segmento}"
        if carrier_type:
            params["carrier_type"] = f"eq.{carrier_type}"
        if stage:
            params["metadata->>stage"] = f"eq.{stage}"
        if whatsapp_permitido is not None:
            params["whatsapp_permitido"] = f"eq.{str(whatsapp_permitido).lower()}"
        if llamada_permitida is not None:
            params["llamada_permitida"] = f"eq.{str(llamada_permitida).lower()}"

        if search:
            sanitized = search.strip()
            for char in "(),*":
                sanitized = sanitized.replace(char, " ")
            pattern = f"*{sanitized}*"
            params["or"] = (
                "("
                + ",".join(
                    [
                        f"display_name.ilike.{pattern}",
                        f"actividad.ilike.{pattern}",
                        f"phone.ilike.{pattern}",
                        f"email.ilike.{pattern}",
                        f"website.ilike.{pattern}",
                    ]
                )
                + ")"
            )

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar prospectos: {data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def worker_get_prospecto(
        self,
        *,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{prospecto_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_prospecto_invalid:{row!r}")
        return row

    async def worker_update_prospecto_metadata(
        self,
        *,
        prospecto_id: UUID,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_prospectos",
            params={"id": f"eq.{prospecto_id}"},
            json={"metadata": metadata},
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("worker_update_prospecto_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_update_prospecto_invalid:{row!r}")
        return row

    async def list_lookup_pending_prospectos(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Obtiene prospectos con verificación pendiente o con error."""

        params = {
            "select": "id,phone,phone_e164,lookup_status",
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 200))),
            "lookup_status": "in.(pendiente,error)",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"lookup_pending_invalid:{data!r}")
        return data

    async def list_scraper_pending_prospectos(
        self,
        *,
        usuario_token: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Regresa prospectos sin correo pero con sitio web para lanzar el scraper."""

        params = {
            "select": "id,display_name,website,segmento,metadata",
            "order": "creado_en.asc",
            "limit": str(max(1, min(limit, 20))),
            "or": "(email.is.null,email.eq.)",
            "website": "not.is.null",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"scraper_pending_invalid:{data!r}")
        return data

    async def update_prospecto(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Aplica actualizaciones parciales a un prospecto."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"id": f"eq.{prospecto_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("prospecto_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"prospecto_update_invalid:{row!r}")
        return row

    async def delete_prospecto(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
    ) -> None:
        """Elimina un prospecto y devuelve error si no existe."""

        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_prospectos",
            token=usuario_token,
            params={"id": f"eq.{prospecto_id}"},
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError("prospecto_delete_failed")
        if not data:
            raise CRMRepositoryError("prospecto_not_found")

    async def insert_prospecto_logs(
        self,
        *,
        usuario_token: str,
        entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Registra eventos de contacto ejecutados sobre prospectos."""

        if not entries:
            return []
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            json=entries,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inválida al registrar contactos: {data!r}")
        return data

    async def create_contact_batch(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Inserta un lote de contacto y devuelve el registro."""

        body = [payload]
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_batch_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_invalid:{row!r}")
        return row

    async def list_contact_batches(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        campana_id: UUID | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Obtiene lotes de contacto con filtros básicos."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if estado:
            params["estado"] = f"eq.{estado}"
        if campana_id:
            params["campana_id"] = f"eq.{campana_id}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_batch_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def insert_contact_envios(
        self,
        *,
        usuario_token: str,
        entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Inserta envíos asociados a un lote."""

        if not entries:
            return []
        created: list[dict[str, Any]] = []
        chunk_size = 500
        for start in range(0, len(entries), chunk_size):
            chunk = entries[start : start + chunk_size]
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/prospeccion_contacto_envio",
                token=usuario_token,
                json=chunk,
                prefer="return=representation",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"contact_envio_insert_invalid:{data!r}")
            created.extend(data)
        return created

    async def list_contact_templates(
        self,
        *,
        usuario_token: str,
        canal: str | None = None,
    ) -> list[dict[str, Any]]:
        """Obtiene plantillas de contacto opcionalmente filtradas por canal."""

        params: dict[str, str] = {"select": "*"}
        if canal:
            params["canal"] = f"eq.{canal}"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params=params,
            prefer="order=nombre.asc",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_templates_invalid:{data!r}")
        return data

    async def get_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_invalid:{row!r}")
        return row

    async def create_contact_template(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_template_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_create_invalid:{row!r}")
        return row

    async def update_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_template_not_found")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_template_update_invalid:{row!r}")
        return row

    async def delete_contact_template(
        self,
        *,
        usuario_token: str,
        template_id: UUID,
    ) -> None:
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_templates",
            token=usuario_token,
            params={"id": f"eq.{template_id}"},
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("contact_template_not_found")

    async def list_contact_lists(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Obtiene listas inteligentes de prospección."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": "creado_en.desc",
        }
        if search:
            sanitized = search.strip()
            for char in "(),*":
                sanitized = sanitized.replace(char, " ")
            pattern = f"*{sanitized}*"
            params["or"] = f"(nombre.ilike.{pattern},descripcion.ilike.{pattern})"
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_lists_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def get_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
    ) -> dict[str, Any] | None:
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_invalid:{row!r}")
        return row

    async def create_contact_list(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            json=[payload],
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_list_create_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_create_invalid:{row!r}")
        return row

    async def update_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("contact_list_update_failed")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_list_update_invalid:{row!r}")
        return row

    async def delete_contact_list(
        self,
        *,
        usuario_token: str,
        lista_id: UUID,
    ) -> None:
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_contacto_listas",
            token=usuario_token,
            params={"id": f"eq.{lista_id}"},
        )
        data = resp.json() or []
        if isinstance(data, dict) and data.get("message") == "No rows deleted":
            raise CRMRepositoryError("contact_list_not_found")
        if isinstance(data, list) and not data:
            return

    async def list_contact_envios(
        self,
        *,
        usuario_token: str,
        limit: int = 50,
        offset: int = 0,
        batch_id: UUID | None = None,
        prospecto_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista envíos filtrando por lote o prospecto."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if batch_id:
            params["batch_id"] = f"eq.{batch_id}"
        if prospecto_id:
            params["prospecto_id"] = f"eq.{prospecto_id}"
        if canal:
            params["canal"] = f"eq.{canal}"
        if estado:
            params["estado"] = f"eq.{estado}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_contact_logs(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        batch_id: UUID | None = None,
        envio_id: UUID | None = None,
        prospecto_id: UUID | None = None,
        canal: str | None = None,
        estado: str | None = None,
        order: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lista eventos registrados en la bitácora de contactos."""

        params: dict[str, str] = {
            "select": "*",
            "limit": str(limit),
            "offset": str(offset),
            "order": order or "creado_en.desc",
        }
        if batch_id:
            params["batch_id"] = f"eq.{batch_id}"
        if envio_id:
            params["envio_id"] = f"eq.{envio_id}"
        if prospecto_id:
            params["prospecto_id"] = f"eq.{prospecto_id}"
        if canal:
            params["canal"] = f"eq.{canal}"
        if estado:
            params["estado"] = f"eq.{estado}"

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contactos_log",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_log_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range")) or len(data)
        return data, total

    async def list_prospecto_contact_indicators(
        self,
        *,
        usuario_token: str,
        prospecto_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        """Obtiene indicadores agregados por prospecto/canal."""

        if not prospecto_ids:
            return []
        ids_param = ",".join(str(value) for value in prospecto_ids)
        params = {
            "select": "prospecto_id,canales,total_envios,ultimo_contacto_en,total_respuestas,respondio,ultima_respuesta_en",
            "prospecto_id": f"in.({ids_param})",
            "order": "prospecto_id.asc",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospecto_contacto_stats",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_indicator_list_invalid:{data!r}")
        return data

    async def list_prospecto_audit(
        self,
        *,
        usuario_token: str,
        prospecto_id: UUID,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        params = {
            "prospecto_id": f"eq.{prospecto_id}",
            "order": "realizado_en.desc",
            "limit": str(max(1, min(limit, 200))),
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_prospectos_audit",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"prospecto_audit_invalid:{data!r}")
        return data

    async def update_contact_envio(
        self,
        *,
        usuario_token: str,
        envio_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza un envío individual."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params={"id": f"eq.{envio_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(envio_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_envio_update_invalid:{row!r}")
        return row

    async def get_contact_envio(
        self,
        *,
        usuario_token: str,
        envio_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene un envío individual."""

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params={"id": f"eq.{envio_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_envio_get_invalid:{row!r}")
        return row

    async def update_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza metadatos del lote."""

        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params={"id": f"eq.{batch_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(batch_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_update_invalid:{row!r}")
        return row

    async def get_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
    ) -> dict[str, Any] | None:
        """Obtiene un lote específico."""

        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_batch",
            token=usuario_token,
            params={"id": f"eq.{batch_id}", "limit": "1"},
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"contact_batch_get_invalid:{row!r}")
        return row

    async def summarize_contact_batch(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
    ) -> list[dict[str, Any]]:
        """Regresa el total de envíos agrupados por estado."""

        params = {
            "batch_id": f"eq.{batch_id}",
            "select": "estado",
            "limit": "2000",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_batch_summary_invalid:{data!r}")
        counts: dict[str, int] = {}
        for row in data:
            estado = str(row.get("estado") or "pendiente").strip() or "pendiente"
            counts[estado] = counts.get(estado, 0) + 1
        return [{"estado": estado, "count": total} for estado, total in counts.items()]

    async def summarize_envios_por_batches(
        self,
        *,
        usuario_token: str,
        batch_ids: Sequence[UUID],
    ) -> dict[str, dict[str, int]]:
        """Agrupa estados por lote en una sola consulta."""

        if not batch_ids:
            return {}
        payload = {"batch_ids": [str(value) for value in batch_ids]}
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_contacto_envio_resumen",
            token=usuario_token,
            json=payload,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_group_invalid:{data!r}")
        resultado: dict[str, dict[str, int]] = {}
        for row in data:
            batch_id = str(row.get("batch_id"))
            estado = str(row.get("estado") or "pendiente").strip() or "pendiente"
            try:
                count_value = int(row.get("total"))
            except (TypeError, ValueError):
                count_value = 0
            bucket = resultado.setdefault(batch_id, {})
            bucket[estado] = bucket.get(estado, 0) + count_value
        return resultado

    async def cancel_pending_envios(
        self,
        *,
        usuario_token: str,
        batch_id: UUID,
        motivo: str,
    ) -> list[dict[str, Any]]:
        """Marca como cancelados los envíos pendientes/procesando de un lote."""

        now_iso = datetime.now(timezone.utc).isoformat()
        params = {
            "batch_id": f"eq.{batch_id}",
            "estado": "in.(pendiente,procesando)",
        }
        payload = {
            "estado": "cancelado",
            "error": motivo,
            "procesado_en": now_iso,
        }
        resp = await self._request_with_user(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            token=usuario_token,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"contact_envio_cancel_invalid:{data!r}")
        return data

    async def worker_list_pending_envios(
        self,
        *,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Obtiene envíos pendientes listos para procesarse (service role)."""

        effective_limit = max(limit, 1)
        now_iso = datetime.now(timezone.utc).isoformat()
        params = {
            "select": "*",
            "estado": "eq.pendiente",
            "programado_en": f"lte.{now_iso}",
            "order": "programado_en.asc",
            "limit": str(effective_limit),
        }
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_pending_envios_invalid:{data!r}")
        return data

    async def worker_mark_envio_processing(
        self,
        *,
        envio_id: UUID,
        attempt: int,
    ) -> bool:
        """Intenta marcar un envío como procesando; devuelve False si ya no está pendiente."""

        params = {
            "id": f"eq.{envio_id}",
            "estado": "eq.pendiente",
        }
        payload = {
            "estado": "procesando",
            "intento_actual": attempt,
        }
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        return isinstance(data, list) and bool(data)

    async def worker_complete_envio(
        self,
        *,
        envio_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualiza un envío después de procesarlo (service role)."""

        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_envio",
            params={"id": f"eq.{envio_id}"},
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        if isinstance(data, list) and data:
            row = data[0]
        else:
            row = {"id": str(envio_id), **payload}
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_complete_envio_invalid:{row!r}")
        return row

    async def worker_get_envio_by_mensaje(
        self,
        *,
        mensaje_id: str,
    ) -> dict[str, Any] | None:
        """Obtiene un envío buscando por su mensaje/call SID."""

        trimmed = mensaje_id.strip() if mensaje_id else ""
        if not trimmed:
            return None
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params={
                "mensaje_id": f"eq.{trimmed}",
                "limit": "1",
            },
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_get_envio_invalid:{row!r}")
        return row

    async def worker_insert_contact_logs(self, entries: Sequence[dict[str, Any]]) -> None:
        """Inserta registros en la bitácora usando service role."""

        if not entries:
            return
        resp = await self._request(
            "POST",
            "/rest/v1/prospeccion_contactos_log",
            json=list(entries),
            prefer="return=representation",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"worker_insert_log_invalid:{data!r}")

    async def worker_find_contact_by_prospecto(
        self,
        *,
        organizacion_id: UUID,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "contacto_datos->>prospecto_id": f"eq.{prospecto_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/contactos",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_find_contact_invalid:{row!r}")
        return row

    async def worker_find_opportunity_by_prospecto(
        self,
        *,
        organizacion_id: UUID,
        prospecto_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "metadata->>prospecto_id": f"eq.{prospecto_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/oportunidades",
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"worker_find_opportunity_invalid:{row!r}")
        return row

    async def worker_sync_batch_status(self, *, batch_id: UUID) -> str | None:
        """Actualiza el estado del lote conforme avanza el procesamiento."""

        pending_total = await self._count_batch_envios(
            batch_id=batch_id,
            estados=("pendiente", "procesando"),
        )
        if pending_total > 0:
            await self._request(
                "PATCH",
                "/rest/v1/prospeccion_contacto_batch",
                params={"id": f"eq.{batch_id}"},
                json={"estado": "en_proceso"},
            )
            return "en_proceso"

        error_total = await self._count_batch_envios(
            batch_id=batch_id,
            estados=("error", "fallido"),
        )
        estado_final = "error" if error_total > 0 else "completado"
        payload = {
            "estado": estado_final,
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
        }
        await self._request(
            "PATCH",
            "/rest/v1/prospeccion_contacto_batch",
            params={"id": f"eq.{batch_id}"},
            json=payload,
        )
        return estado_final

    async def create_buscador_job(
        self,
        *,
        usuario_token: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = [payload]
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/prospeccion_buscador_jobs",
            token=usuario_token,
            json=body,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if not isinstance(row, dict):
            raise CRMRepositoryError("buscador_job_create_failed")
        return row

    async def list_buscador_jobs(
        self,
        *,
        usuario_token: str,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        limit_value = max(1, min(limit, 200))
        offset_value = max(0, offset)
        params = {
            "order": "created_at.desc",
            "limit": str(limit_value),
        }
        if offset_value:
            params["offset"] = str(offset_value)
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_buscador_jobs",
            token=usuario_token,
            params=params,
            prefer="count=exact",
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_job_list_invalid:{data!r}")
        total = self._extract_total_count(resp.headers.get("content-range"))
        total_value = total if total is not None else len(data)
        return data, total_value

    async def get_buscador_job(
        self,
        *,
        job_id: UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{job_id}", "limit": "1"}
        request = (
            self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_buscador_jobs",
                token=usuario_token or "",
                params=params,
            )
            if usuario_token
            else self._request(
                "GET",
                "/rest/v1/prospeccion_buscador_jobs",
                params=params,
            )
        )
        resp = await request
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"buscador_job_get_invalid:{row!r}")
        return row

    async def delete_buscador_job(
        self,
        *,
        job_id: UUID,
        usuario_token: str,
    ) -> int:
        params = {
            "id": f"eq.{job_id}",
        }
        resp = await self._request_with_user(
            "DELETE",
            "/rest/v1/prospeccion_buscador_jobs",
            token=usuario_token,
            params=params,
            prefer="return=representation",
        )
        if resp.status_code == 204:
            return 0
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_job_delete_invalid:{data!r}")
        return len(data)

    async def list_buscador_resultados(
        self,
        *,
        usuario_token: str,
        job_id: UUID,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        limit_value = limit if isinstance(limit, int) else 2000
        limit_value = max(1, min(limit_value, 2000))
        offset_value = max(offset or 0, 0)
        params = {
            "job_id": f"eq.{job_id}",
            "order": "creado_en.asc",
            "limit": str(limit_value),
        }
        if offset_value:
            params["offset"] = str(offset_value)
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_buscador_resultados",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_resultados_list_invalid:{data!r}")
        return data

    async def list_buscador_resultados_by_ids(
        self,
        *,
        usuario_token: str,
        job_id: UUID,
        result_ids: Sequence[UUID],
    ) -> list[dict[str, Any]]:
        if not result_ids:
            return []
        ids_param = ",".join(str(value) for value in result_ids)
        params = {
            "job_id": f"eq.{job_id}",
            "id": f"in.({ids_param})",
            "limit": str(len(result_ids)),
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/prospeccion_buscador_resultados",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        if not isinstance(data, list):
            raise CRMRepositoryError(f"buscador_resultados_by_ids_invalid:{data!r}")
        return data

    async def list_buscador_prospecto_result_ids(
        self,
        *,
        usuario_token: str,
        job_id: UUID,
        chunk_size: int = 1000,
    ) -> set[str]:
        chunk_value = max(1, min(chunk_size, 2000))
        existing: set[str] = set()
        offset = 0
        while True:
            params: dict[str, str] = {
                "metadata->>buscador_job_id": f"eq.{job_id}",
                "select": "metadata",
                "limit": str(chunk_value),
            }
            if offset:
                params["offset"] = str(offset)
            resp = await self._request_with_user(
                "GET",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                params=params,
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"buscador_prospectos_list_invalid:{data!r}")
            if not data:
                break
            for row in data:
                metadata = row.get("metadata")
                if isinstance(metadata, dict):
                    value = metadata.get("buscador_result_id")
                    if isinstance(value, str) and value:
                        existing.add(value)
            if len(data) < chunk_value:
                break
            offset += len(data)
        return existing

    async def worker_update_buscador_job(
        self,
        *,
        job_id: UUID,
        payload: dict[str, Any],
        strict: bool = True,
        extra_filters: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {"id": f"eq.{job_id}"}
        if extra_filters:
            params.update(extra_filters)
        resp = await self._request(
            "PATCH",
            "/rest/v1/prospeccion_buscador_jobs",
            params=params,
            json=payload,
            prefer="return=representation",
        )
        data = resp.json() or []
        row = self._first_row(data)
        if row is None:
            if strict:
                raise CRMRepositoryError(f"buscador_job_update_invalid:{data!r}")
            return None
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"buscador_job_update_invalid:{row!r}")
        return row

    async def worker_replace_buscador_results(
        self,
        *,
        job_id: UUID,
        organizacion_id: UUID | None,
        items: list[dict[str, Any]],
    ) -> None:
        await self._request(
            "DELETE",
            "/rest/v1/prospeccion_buscador_resultados",
            params={"job_id": f"eq.{job_id}"},
        )
        if not items:
            return
        chunk_size = 500
        for start in range(0, len(items), chunk_size):
            chunk = items[start : start + chunk_size]
            # Asegurar job_id/organizacion_id presentes
            for row in chunk:
                row.setdefault("job_id", str(job_id))
                if organizacion_id:
                    row.setdefault("organizacion_id", str(organizacion_id))
            await self._request(
                "POST",
                "/rest/v1/prospeccion_buscador_resultados",
                json=chunk,
                prefer="return=minimal",
            )

    async def bulk_insert_prospectos(
        self,
        *,
        usuario_token: str,
        items: Sequence[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not items:
            return []
        created: list[dict[str, Any]] = []
        chunk_size = 200
        for start in range(0, len(items), chunk_size):
            chunk = list(items[start : start + chunk_size])
            resp = await self._request_with_user(
                "POST",
                "/rest/v1/prospeccion_prospectos",
                token=usuario_token,
                json=chunk,
                prefer="return=representation",
            )
            data = resp.json() or []
            if not isinstance(data, list):
                raise CRMRepositoryError(f"prospecto_bulk_insert_invalid:{data!r}")
            created.extend(data)
        return created

    async def get_prospeccion_stage_summary(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_stage_resumen",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError(f"stage_summary_invalid:{data!r}")
        return data

    async def get_prospeccion_enriquecimiento_resumen(
        self,
        *,
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/prospeccion_enriquecimiento_resumen",
            token=usuario_token,
            json={},
        )
        data = resp.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError(f"enriquecimiento_resumen_invalid:{data!r}")
        return data

    async def get_email_template(
        self,
        *,
        slug: str,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/panel_email_templates",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener template de correo: {row!r}")
        return row

    async def upsert_email_template(
        self,
        *,
        slug: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"slug": slug, **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/panel_email_templates",
            params={"on_conflict": "slug"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el template de correo actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar template de correo: {row!r}"
            )
        return row

    async def get_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/quote_templates",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener template de cotización: {row!r}"
            )
        return row

    async def upsert_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
        payload: dict[str, Any],
        updated_by: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "slug": slug,
            "organizacion_id": str(organizacion_id),
            **payload,
        }
        if updated_by:
            body["updated_by"] = str(updated_by)
        resp = await self._request(
            "POST",
            "/rest/v1/quote_templates",
            params={"on_conflict": "slug,organizacion_id"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió el template de cotización actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar template de cotización: {row!r}"
            )
        return row

    async def get_calendar_settings(
        self,
        *,
        slug: str,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "limit": "1",
        }
        resp = await self._request(
            "GET",
            "/rest/v1/panel_calendar_settings",
            params=params,
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al obtener settings del calendario: {row!r}"
            )
        return row

    async def upsert_calendar_settings(
        self,
        *,
        slug: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"slug": slug, **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/panel_calendar_settings",
            params={"on_conflict": "slug"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError(
                "Supabase no devolvió los settings del calendario actualizados"
            )
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(
                f"Respuesta inválida al actualizar settings del calendario: {row!r}"
            )
        return row

    @staticmethod
    def _extract_total_count(content_range: str | None) -> int | None:
        if not content_range or "/" not in content_range:
            return None
        _, total_str = content_range.split("/", 1)
        try:
            total_value = int(total_str)
        except ValueError:
            return None
        return total_value if total_value >= 0 else None

    @staticmethod
    def _first_row(data: Any) -> Any:
        if isinstance(data, list):
            return data[0] if data else None
        return data

    async def _count_batch_envios(
        self,
        *,
        batch_id: UUID,
        estados: Sequence[str],
    ) -> int:
        params: dict[str, str] = {
            "batch_id": f"eq.{batch_id}",
            "select": "id",
            "limit": "1",
        }
        if estados:
            or_filters = ",".join(f"estado.eq.{estado}" for estado in estados)
            params["or"] = f"({or_filters})"
        resp = await self._request(
            "GET",
            "/rest/v1/prospeccion_contacto_envio",
            params=params,
            prefer="count=exact",
        )
        return self._extract_total_count(resp.headers.get("content-range")) or 0

    async def _request(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        url = f"{self._base_url}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(method, url, params=params, json=json, headers=headers)
        except httpx.RequestError as exc:  # pragma: no cover - red de terceros
            raise CRMRepositoryError(f"Error de red al llamar Supabase: {exc}") from exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en {path}: {resp.text}"
            )
        return resp

    async def _upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        key = object_key.lstrip("/")
        if not key:
            raise CRMRepositoryError("object_key_required")
        url = f"{self._base_url}/storage/v1/object/{bucket_name}/{key}"
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": content_type or "application/octet-stream",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    url, headers=headers, content=content, params={"upsert": "true"}
                )
        except httpx.RequestError as exc:
            raise CRMRepositoryError(
                f"Error de red al subir objeto {bucket_name}/{key}: {exc}"
            ) from exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} al subir objeto {bucket_name}/{key}: {resp.text}"
            )
        public_path: str | None = None
        content_type_header = (resp.headers.get("content-type") or "").lower()
        if "application/json" in content_type_header:
            try:
                payload = resp.json()
            except ValueError:
                payload = {}
            if isinstance(payload, dict):
                public_path = payload.get("Key")
        if not public_path:
            prefix = f"{bucket_name}/"
            public_path = f"{prefix}{key}" if not key.startswith(prefix) else key
        return public_path

    async def create_signed_storage_url(
        self,
        *,
        bucket: str,
        object_path: str,
        expires_in: int = 300,
    ) -> str:
        """Genera un enlace firmado para un objeto de Storage."""

        bucket_name = bucket.strip().strip("/")
        if not bucket_name:
            raise CRMRepositoryError("bucket_required")
        if expires_in <= 0:
            raise CRMRepositoryError("expires_in_invalid")

        key = object_path.lstrip("/")
        if key.startswith(f"{bucket_name}/"):
            key = key[len(bucket_name) + 1 :]
        if not key:
            raise CRMRepositoryError("object_key_required")

        resp = await self._request(
            "POST",
            f"/storage/v1/object/sign/{bucket_name}/{key}",
            json={"expiresIn": expires_in},
        )
        data = resp.json()
        if not isinstance(data, dict):
            raise CRMRepositoryError("signed_url_invalid_response")
        signed_fragment = data.get("signedURL") or data.get("signedUrl")
        if not signed_fragment or not isinstance(signed_fragment, str):
            raise CRMRepositoryError("signed_url_missing")
        if signed_fragment.startswith("http://") or signed_fragment.startswith("https://"):
            return signed_fragment

        fragment = signed_fragment if signed_fragment.startswith("/") else f"/{signed_fragment}"
        if not fragment.startswith("/storage/"):
            fragment = f"/storage/v1{fragment}"

        base = self._base_url.rstrip("/")
        return f"{base}{fragment}"

    async def _rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        url = f"{self._base_url}/rest/v1/rpc/{function_name}"
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
        }
        if function_name == "registrar_mensaje_whatsapp":
            logger.info(
                "crm.rpc_payload",
                extra={"function": function_name, "payload": payload},
            )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise CRMRepositoryError(f"Error de red al invocar RPC {function_name}: {exc}") from exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en RPC {function_name}: {resp.text}"
            )
        if resp.status_code == 204:
            return {}
        try:
            return resp.json()
        except ValueError as exc:
            raise CRMRepositoryError(f"Respuesta inválida de RPC {function_name}: {exc}") from exc

    async def _request_with_user(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        token: str,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        if not settings.supabase_url or not settings.supabase_anon:
            raise CRMRepositoryError("Supabase no está configurado (anon key)")
        url = f"{settings.supabase_url.rstrip('/')}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": settings.supabase_anon,
            "Authorization": f"Bearer {token}",
        }
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(method, url, params=params, json=json, headers=headers)
        except httpx.RequestError as exc:
            raise CRMRepositoryError(f"Error de red al llamar Supabase (user): {exc}") from exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en {path}: {resp.text}"
            )
        return resp
logger = get_logger("app.repositories.crm")
