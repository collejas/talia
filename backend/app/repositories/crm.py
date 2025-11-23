"""Repositorio para interactuar con las tablas CRM en Supabase."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

import httpx

from app.core.config import settings


class CRMRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase CRM."""


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
            "asignado:usuarios!oportunidades_asignado_a_usuario_id_fkey(id,nombre_completo,correo)",
            "propietario:usuarios!oportunidades_propietario_usuario_id_fkey(id,nombre_completo,correo)",
            "etapa:etapas_pipeline!oportunidades_etapa_id_fkey(id,nombre,codigo,categoria,orden,metadata)",
            "contacto:contactos!oportunidades_contacto_principal_id_fkey(id,nombre_completo,correo,telefono_e164,company_name,notes,necesidad_proposito,estado,captura_estado)",
            "cuenta:cuentas!oportunidades_cuenta_id_fkey(id,nombre,telefono,correo)",
        ]
    )

    _CLIENTE_SELECT = (
        "id,contacto_id,lead_tarjeta_id,tablero_id,etapa_id,estado_onboarding,rfc,"
        "razon_social,domicilio_fiscal,domicilio_fisico,regimen_fiscal,datos_facturacion,"
        "fuente,monto_estimado,moneda,metadatos,ganado_en,creado_en,actualizado_en,"
        "contacto:contactos!clientes_contacto_id_fkey(id,nombre_completo,correo,telefono_e164,company_name),"
        "documentos:cliente_documentos!cliente_documentos_cliente_id_fkey(id,tipo,estado,descripcion,storage_url,"
        "storage_path,metadatos,creado_en,actualizado_en),"
        "responsables:cliente_responsables!cliente_responsables_cliente_id_fkey(id,nombre,correo,telefono_e164,rol,"
        "es_responsable_principal,metadatos,creado_en,actualizado_en)"
    )

    _PORTAL_TOKEN_SELECT = (
        "id,cliente_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        f"cliente:clientes!cliente_portal_tokens_cliente_id_fkey({_CLIENTE_SELECT})"
    )

    _PORTAL_TOKEN_MIN_SELECT = (
        "id,cliente_id,token,expira_en,revocado,usos,nota,metadata,ultimo_acceso_en,"
        "ultimo_acceso_ip,creado_en,actualizado_en,"
        "cliente:clientes!cliente_portal_tokens_cliente_id_fkey(id)"
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
            "etapa_origen:etapas_pipeline!oportunidad_etapas_historial_etapa_origen_id_fkey(id,nombre)",
            "etapa_destino:etapas_pipeline!oportunidad_etapas_historial_etapa_destino_id_fkey(id,nombre)",
            "cambiado_por:usuarios!oportunidad_etapas_historial_cambiado_por_usuario_id_fkey(id,nombre_completo,correo)",
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
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
        }
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
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
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
    ) -> tuple[list[dict[str, Any]], int]:
        params: dict[str, Any] = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
            "limit": str(limit),
            "select": self._PIPELINE_SELECT,
        }
        if created_from:
            params["creado_en"] = f"gte.{created_from.isoformat()}"
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
        usuario_token: str,
    ) -> dict[str, Any]:
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/panel_visitantes_sin_chat_estados",
            token=usuario_token,
            json={},
            prefer="return=representation",
        )
        data = resp.json()
        if isinstance(data, dict):
            return data
        raise CRMRepositoryError(
            f"Respuesta inesperada en panel_visitantes_sin_chat_estados: {data!r}"
        )

    async def visitas_detalle(
        self,
        *,
        usuario_token: str,
        limit: int = 200,
        offset: int = 0,
        order_by: str = "primera",
        order_dir: Literal["asc", "desc"] = "asc",
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
        return data

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
            "select": "id,conversacion_id,contact_id,tarjeta_id,status,timezone,start_at,end_at,metadata",
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

    async def user_has_role(self, *, usuario_id: UUID, role_code: str) -> bool:
        params = {
            "select": "rol:roles(codigo)",
            "usuario_id": f"eq.{usuario_id}",
            "rol.codigo": f"eq.{role_code}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/usuarios_roles", params=params)
        data = resp.json() or []
        if isinstance(data, list):
            for row in data:
                role = row.get("rol") if isinstance(row, dict) else None
                if isinstance(role, dict) and role.get("codigo") == role_code:
                    return True
        if isinstance(data, dict):
            role = data.get("rol")
            if isinstance(role, dict) and role.get("codigo") == role_code:
                return True
        return False

    async def get_cliente_por_lead(
        self,
        *,
        usuario_token: str,
        lead_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "lead_tarjeta_id": f"eq.{lead_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/clientes",
            token=usuario_token,
            params=params,
        )
        data = resp.json() or []
        row = self._first_row(data)
        return row if isinstance(row, dict) else None

    async def get_cliente_por_id(
        self,
        *,
        usuario_token: str,
        cliente_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{cliente_id}",
            "select": self._CLIENTE_SELECT,
            "limit": "1",
        }
        resp = await self._request_with_user(
            "GET",
            "/rest/v1/clientes",
            token=usuario_token,
            params=params,
        )
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

    async def convert_lead_en_cliente(
        self,
        *,
        usuario_token: str,
        lead_id: UUID,
        forzar: bool = False,
    ) -> Any:
        body = {"p_tarjeta_id": str(lead_id), "p_forzar": forzar}
        resp = await self._request_with_user(
            "POST",
            "/rest/v1/rpc/convertir_lead_en_cliente",
            token=usuario_token,
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
            "select": self._PORTAL_TOKEN_SELECT
            if include_relations
            else self._PORTAL_TOKEN_MIN_SELECT,
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
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
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
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"slug": slug, **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/quote_templates",
            params={"on_conflict": "slug"},
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
