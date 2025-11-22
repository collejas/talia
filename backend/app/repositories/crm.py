"""Repositorio para interactuar con las tablas CRM en Supabase."""

from __future__ import annotations

from datetime import datetime
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
