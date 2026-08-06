import uuid
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes import crm as crm_routes
from app.repositories.crm import CRMRepository, _build_search_clause, _make_json_serializable, _matches_search_query


def test_lead_quote_item_accepts_long_catalog_description() -> None:
    description = "Descripción comercial extensa. " * 150

    item = crm_routes.LeadQuoteItemPayload(descripcion=description)

    assert item.descripcion == description


def test_lead_quote_item_rejects_unbounded_description() -> None:
    description = "x" * (crm_routes.LEAD_QUOTE_ITEM_DESCRIPTION_MAX_LENGTH + 1)

    with pytest.raises(ValueError):
        crm_routes.LeadQuoteItemPayload(descripcion=description)


@pytest.mark.asyncio
async def test_resolve_available_quote_folio_replaces_duplicate() -> None:
    repo = AsyncMock()
    repo.quote_folio_exists.return_value = True
    repo.reserve_quote_folio.return_value = {
        "folio": "Cot-RS-300726-0008",
        "secuencia": 8,
        "fecha": "2026-07-30",
        "iniciales": "RS",
    }

    folio = await crm_routes._resolve_available_quote_folio(
        repo=repo,
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        vendor_context={"vendor_assessor_name": "Roberto Silva"},
        requested_folio="Cot-RS-300726-0007",
    )

    assert folio == "Cot-RS-300726-0008"
    repo.quote_folio_exists.assert_awaited_once()
    repo.reserve_quote_folio.assert_awaited_once()


class DummyCRMRepository(CRMRepository):
    """Repo falso que permite inyectar respuestas predecibles."""

    def __init__(self) -> None:  # pragma: no cover - simple init
        self._user_token = None
        self._timeout = 30.0
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.pipeline_stages: list[dict[str, Any]] = []
        self.pipeline_opportunities: list[dict[str, Any]] = []
        self.sale_ready_opportunities: list[dict[str, Any]] = []
        self.prospectos_by_ids_result: list[dict[str, Any]] = []
        self.dashboard_kpis: dict[str, Any] = {"webchat": {"visitas_sin_chat": 0}}
        self.next_sales_rep: uuid.UUID | None = None
        self.contactables_by_ids_result: list[dict[str, Any]] = []
        self.existing_prospectos_by_emails_result: list[dict[str, Any]] = []
        self.existing_prospectos_by_phones_result: list[dict[str, Any]] = []
        self.last_upserted_prospectos: list[dict[str, Any]] = []
        self.last_bulk_inserted_prospectos: list[dict[str, Any]] = []
        self.products_by_id: dict[str, dict[str, Any]] = {}
        self.catalog_items_by_id: dict[str, dict[str, Any]] = {}
        self.propiedad_unidades_by_id: dict[str, dict[str, Any]] = {}
        self.opportunities_with_stage: dict[str, dict[str, Any]] = {}
        self.updated_propiedad_unidades: list[dict[str, Any]] = []
        self.updated_catalog_items: list[dict[str, Any]] = []
        self.created_propiedad_unidad_movimientos: list[dict[str, Any]] = []
        self.clients: dict[str, dict[str, Any]] = {}
        self.clients_by_contact: dict[str, dict[str, Any]] = {}
        self.permission_context: dict[str, Any] = {
            "usuario_id": str(uuid.uuid4()),
            "organizacion_id": str(uuid.uuid4()),
            "es_admin": True,
            "es_owner": False,
            "permisos": ["contacts.write", "contacts.delete"],
        }
        self.account_owner_id: uuid.UUID | None = None
        self.persona_owner_id: uuid.UUID | None = None

    async def ensure_prospeccion_stage(self, **kwargs: Any) -> dict[str, Any]:
        """Evita llamadas reales durante las pruebas."""

        return {
            "id": str(uuid.uuid4()),
            "codigo": "prospeccion_primer_contacto",
            "nombre": "Prospección · Primer contacto",
            "orden": 0,
            "categoria": "abierta",
            "metadata": {"seed": "prospeccion_stage"},
        }

    async def list_prospectos_by_ids(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_prospectos_by_ids", kwargs))
        return list(self.prospectos_by_ids_result)

    async def get_permission_context(self) -> dict[str, Any]:
        self.calls.append(("get_permission_context", {}))
        return dict(self.permission_context)

    async def ensure_contact_record_for_persona(
        self,
        *,
        organizacion_id: uuid.UUID,
        persona_id: uuid.UUID,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "ensure_contact_record_for_persona",
                {"organizacion_id": organizacion_id, "persona_id": persona_id},
            )
        )
        return {
            "id": str(persona_id),
            "organizacion_id": str(organizacion_id),
            "codigo_contacto": "Con1",
        }

    async def get_cliente_por_oportunidad(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_cliente_por_oportunidad", kwargs))
        return self.clients.get(str(kwargs["oportunidad_id"]))

    async def get_cliente_por_contacto(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_cliente_por_contacto", kwargs))
        return self.clients_by_contact.get(str(kwargs["contacto_id"]))

    async def get_organizacion_config(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_organizacion_config", kwargs))
        return {
            "features": {
                "propiedades": {"enabled": True},
                "productos": {"enabled": True},
            }
        }

    async def list_accounts(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_accounts", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "nombre": "Cuenta Demo",
                "alias": None,
                "tipo": None,
                "industria": None,
                "tamano": None,
                "sitio_web": None,
                "telefono": None,
                "correo": None,
                "direccion": {},
                "propietario_usuario_id": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def get_persona_by_phone_e164(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_persona_by_phone_e164", kwargs))
        return None

    async def get_persona_by_email(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_persona_by_email", kwargs))
        return None

    async def personas_list(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("personas_list", kwargs))
        return []

    async def contactos_list(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("contactos_list", kwargs))
        return []

    async def list_pipelines(self, **kwargs: Any) -> list[dict[str, Any]]:
        """Simula la lista de etapas del pipeline."""

        self.calls.append(("list_pipelines", kwargs))
        tablero_id = kwargs.get("tablero_id")
        stages = self.pipeline_stages or [
            {
                "id": str(uuid.uuid4()),
                "nombre": "Prospecto",
                "codigo": "prospecto",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {},
            }
        ]
        if tablero_id:
            tablero_filter = str(tablero_id)
            return [
                stage
                for stage in stages
                if str(stage.get("metadata", {}).get("tablero_id")) == tablero_filter
                or str(stage.get("metadatos", {}).get("tablero_id")) == tablero_filter
                or str(stage.get("tablero_id")) == tablero_filter
            ]
        return stages

    async def list_pipeline_opportunities(self, **kwargs: Any) -> tuple[list[dict[str, Any]], int]:
        """Simula la lista de oportunidades del pipeline."""

        self.calls.append(("list_pipeline_opportunities", kwargs))
        tablero_id = kwargs.get("tablero_id")
        rows = list(self.pipeline_opportunities)
        if tablero_id:
            tablero_filter = str(tablero_id)
            rows = [
                row
                for row in rows
                if str(row.get("metadata", {}).get("tablero_id")) == tablero_filter
                or str((row.get("etapa", {}) or {}).get("metadata", {}).get("tablero_id"))
                == tablero_filter
                or str(row.get("tablero_id")) == tablero_filter
                or str((row.get("etapa", {}) or {}).get("tablero_id")) == tablero_filter
            ]
        return rows[: kwargs.get("limit", len(rows))], len(rows)

    async def list_opportunity_scoring_events(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_opportunity_scoring_events", kwargs))
        return []

    async def list_sale_ready_opportunities(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_sale_ready_opportunities", kwargs))
        rows = list(self.sale_ready_opportunities)
        return rows[: kwargs.get("limit", len(rows))]

    async def visitas_dashboard_kpis(self, **kwargs: Any) -> dict[str, Any]:
        """Simula el payload de KPIs de visitas."""

        self.calls.append(("visitas_dashboard_kpis", kwargs))
        return self.dashboard_kpis

    async def list_clientes(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_clientes", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "contacto_id": str(uuid.uuid4()),
                "cuenta_id": str(uuid.uuid4()),
                "oportunidad_id": str(uuid.uuid4()),
                "legacy_lead_id": str(uuid.uuid4()),
                "estado_onboarding": "pendiente",
                "rfc": "RFC123456789",
                "razon_social": "Cliente Demo",
                "domicilio_fiscal": "Fiscal 123",
                "domicilio_fisico": "Fisico 456",
                "regimen_fiscal": "General",
                "datos_facturacion": {},
                "fuente": "crm",
                "monto_estimado": 10000.0,
                "moneda": "MXN",
                "metadatos": {},
                "ganado_en": "2024-01-02T00:00:00Z",
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
                "contacto": {
                    "id": str(uuid.uuid4()),
                    "nombre_completo": "Contacto Demo",
                    "correo": "demo@example.com",
                    "telefono_e164": "+521111111111",
                    "company_name": "Demo Inc.",
                },
                "documentos": [],
                "responsables": [],
            }
        ]

    async def assign_next_sales_rep(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("assign_next_sales_rep", kwargs))
        rep_id = self.next_sales_rep or uuid.uuid4()
        return {
            "usuario_id": rep_id,
            "nombre": "Seller Demo",
            "correo": "seller@example.com",
            "telefono_e164": "+521234567890",
        }

    async def create_account(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_account", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def list_account_address_relations(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_account_address_relations", kwargs))
        return []

    async def create_persona(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_persona", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def update_account(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_account", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(kwargs["account_id"]))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("propietario_usuario_id", str(self.account_owner_id) if self.account_owner_id else None)
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def update_persona(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_persona", kwargs))
        body = kwargs["payload"].copy()
        persona_id = kwargs.get("persona_id") or kwargs.get("contacto_id")
        body.setdefault("id", str(persona_id))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("propietario_usuario_id", str(self.persona_owner_id) if self.persona_owner_id else None)
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def get_account(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_account", kwargs))
        if kwargs["account_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["account_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "nombre": "Cuenta Demo",
            "alias": None,
            "tipo": None,
            "industria": None,
            "tamano": None,
            "sitio_web": None,
            "telefono": None,
            "correo": None,
            "direccion": {},
            "propietario_usuario_id": str(self.account_owner_id) if self.account_owner_id else None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def get_persona(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_persona", kwargs))
        if kwargs["persona_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["persona_id"]),
            "organizacion_id": str(kwargs.get("organizacion_id") or uuid.uuid4()),
            "nombre_completo": "Contacto Demo",
            "correo_principal": "demo@example.com",
            "correo_secundario": None,
            "correo_institucional": None,
            "correo_personal_3": None,
            "codigo_contacto": None,
            "telefono_principal_e164": "+521111111111",
            "telefono_principal_tipo_linea": None,
            "telefono_principal_extension": None,
            "telefono_movil_1_e164": "+521111111111",
            "telefono_movil_1_tipo_linea": None,
            "telefono_movil_2_e164": None,
            "telefono_movil_2_tipo_linea": None,
            "telefono_movil_2_extension": None,
            "telefono_secundario_e164": None,
            "telefono_secundario_tipo_linea": None,
            "telefono_secundario_extension": None,
            "telefono_empresa_1_e164": None,
            "telefono_empresa_1_extension": None,
            "telefono_empresa_2_e164": None,
            "telefono_empresa_2_extension": None,
            "company_name": "Demo Inc.",
            "notas": None,
            "propietario_usuario_id": str(self.persona_owner_id) if self.persona_owner_id else None,
        }

    async def get_persona_by_id(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_persona_by_id", kwargs))
        return {
            "id": str(kwargs["persona_id"]),
            "organizacion_id": str(kwargs.get("organizacion_id") or uuid.uuid4()),
            "nombre_completo": "Contacto Demo",
            "correo": "demo@example.com",
            "telefono_e164": "+521111111111",
            "company_name": "Demo Inc.",
        }

    async def get_latest_conversation_id_by_contact(self, **kwargs: Any) -> str | None:
        self.calls.append(("get_latest_conversation_id_by_contact", kwargs))
        return None

    async def get_stage_by_code(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_stage_by_code", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "codigo": kwargs.get("codigo"),
            "nombre": "Prospección · Primer contacto",
            "orden": 1,
            "categoria": "abierta",
            "metadata": {},
        }

    async def get_default_stage_id(self, **kwargs: Any) -> uuid.UUID:
        self.calls.append(("get_default_stage_id", kwargs))
        return uuid.uuid4()

    async def create_opportunity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_opportunity", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def append_stage_history(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("append_stage_history", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        return body

    async def update_prospecto(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_prospecto", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(kwargs["prospecto_id"]))
        return body

    async def delete_persona(self, **kwargs: Any) -> None:
        self.calls.append(("delete_persona", kwargs))

    async def delete_account(self, **kwargs: Any) -> None:
        self.calls.append(("delete_account", kwargs))

    async def list_activities(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_activities", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "tipo": "llamada",
                "canal": "telefono",
                "asunto": "Seguimiento",
                "descripcion": None,
                "estado": "pendiente",
                "prioridad": "alta",
                "fecha_vencimiento": None,
                "inicio_en": "2024-01-02T12:00:00Z",
                "fin_en": None,
                "sla_horas": None,
                "recordatorio_en": None,
                "cuenta_id": None,
                "contacto_id": None,
                "oportunidad_id": None,
                "creado_por_usuario_id": None,
                "asignado_a_usuario_id": None,
                "completado_en": None,
                "cancelado_en": None,
                "cerrado_por_usuario_id": None,
                "recordatorio_notificado_en": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_activity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_activity", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estado": kwargs["payload"].get("estado", "pendiente"),
            "prioridad": kwargs["payload"].get("prioridad", "media"),
            "completado_en": kwargs["payload"].get("completado_en"),
            "cancelado_en": kwargs["payload"].get("cancelado_en"),
            "cerrado_por_usuario_id": kwargs["payload"].get("cerrado_por_usuario_id"),
            "recordatorio_notificado_en": kwargs["payload"].get("recordatorio_notificado_en"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def update_activity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_activity", kwargs))
        body = kwargs["payload"].copy()
        return {
            "id": str(kwargs["activity_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "tipo": body.get("tipo", "llamada"),
            "canal": body.get("canal"),
            "asunto": body.get("asunto", "Seguimiento"),
            "descripcion": body.get("descripcion"),
            "estado": body.get("estado", "pendiente"),
            "prioridad": body.get("prioridad", "media"),
            "fecha_vencimiento": body.get("fecha_vencimiento"),
            "inicio_en": body.get("inicio_en"),
            "fin_en": body.get("fin_en"),
            "sla_horas": body.get("sla_horas"),
            "recordatorio_en": body.get("recordatorio_en"),
            "cuenta_id": body.get("cuenta_id"),
            "contacto_id": body.get("contacto_id"),
            "oportunidad_id": body.get("oportunidad_id"),
            "creado_por_usuario_id": body.get("creado_por_usuario_id"),
            "asignado_a_usuario_id": body.get("asignado_a_usuario_id"),
            "completado_en": body.get("completado_en"),
            "cancelado_en": body.get("cancelado_en"),
            "cerrado_por_usuario_id": body.get("cerrado_por_usuario_id"),
            "recordatorio_notificado_en": body.get("recordatorio_notificado_en"),
            "metadata": body.get("metadata", {}),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def complete_activity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("complete_activity", kwargs))
        return await self.update_activity(
            activity_id=kwargs["activity_id"],
            organizacion_id=kwargs["organizacion_id"],
            payload={
                "estado": "completada",
                "completado_en": "2024-01-03T00:00:00Z",
                "cancelado_en": None,
                "cerrado_por_usuario_id": str(kwargs.get("cerrado_por_usuario_id"))
                if kwargs.get("cerrado_por_usuario_id")
                else None,
            },
        )

    async def cancel_activity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("cancel_activity", kwargs))
        return await self.update_activity(
            activity_id=kwargs["activity_id"],
            organizacion_id=kwargs["organizacion_id"],
            payload={
                "estado": "cancelada",
                "cancelado_en": "2024-01-03T00:00:00Z",
                "completado_en": None,
                "cerrado_por_usuario_id": str(kwargs.get("cerrado_por_usuario_id"))
                if kwargs.get("cerrado_por_usuario_id")
                else None,
            },
        )

    async def get_activity(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_activity", kwargs))
        if kwargs["activity_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["activity_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "tipo": "llamada",
            "canal": "telefono",
            "asunto": "Seguimiento",
            "descripcion": None,
            "estado": "pendiente",
            "prioridad": "media",
            "fecha_vencimiento": None,
            "inicio_en": "2024-01-02T12:00:00Z",
            "fin_en": None,
            "sla_horas": None,
            "recordatorio_en": None,
            "cuenta_id": None,
            "contacto_id": None,
            "oportunidad_id": None,
            "creado_por_usuario_id": None,
            "asignado_a_usuario_id": None,
            "completado_en": None,
            "cancelado_en": None,
            "cerrado_por_usuario_id": None,
            "recordatorio_notificado_en": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_tickets(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_tickets", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "asunto": "Incidencia",
                "descripcion": None,
                "estado": "abierto",
                "prioridad": "media",
                "canal_origen": "whatsapp",
                "cuenta_id": None,
                "contacto_id": None,
                "asignado_a_usuario_id": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
                "cerrado_en": None,
            }
        ]

    async def create_ticket(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_ticket", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estado": kwargs["payload"].get("estado", "abierto"),
            "prioridad": kwargs["payload"].get("prioridad", "media"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def get_ticket(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_ticket", kwargs))
        if kwargs["ticket_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["ticket_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "asunto": "Incidencia",
            "descripcion": None,
            "estado": "abierto",
            "prioridad": "media",
            "canal_origen": "whatsapp",
            "cuenta_id": None,
            "contacto_id": None,
            "asignado_a_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
            "cerrado_en": None,
        }

    async def list_ticket_comments(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_ticket_comments", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "ticket_id": str(kwargs["ticket_id"]),
                "autor_usuario_id": str(uuid.uuid4()),
                "autor_cliente_id": None,
                "mensaje": "Comentario",
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def list_agenda_bookings(self, **kwargs: Any) -> tuple[list[dict[str, Any]], int]:
        self.calls.append(("list_agenda_bookings", kwargs))
        card_id = str(uuid.uuid4())
        return (
            [
                {
                    "id": str(uuid.uuid4()),
                    "resource_id": str(uuid.uuid4()),
                    "hold_id": None,
                    "tarjeta_id": card_id,
                    "contacto_id": str(uuid.uuid4()),
                    "contacto_nombre": "Contacto Demo",
                    "status": "confirmed",
                    "start_at": "2024-01-01T10:00:00Z",
                    "end_at": "2024-01-01T10:30:00Z",
                    "timezone": "UTC",
                    "notes": None,
                    "metadata": {"estado": "confirmada"},
                    "tarjeta_canal": "webchat",
                    "tarjeta_lead_score": 50,
                }
            ],
            1,
        )

    async def visitas_detalle(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("visitas_detalle", kwargs))
        return [
            {
                "session_id": "session-1",
                "tarjeta_id": str(uuid.uuid4()),
                "canal": "webchat",
                "metadata": {"foo": "bar"},
                "registrado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_ticket_comment(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_ticket_comment", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "mensaje": kwargs["payload"]["mensaje"],
            "metadata": kwargs["payload"].get("metadata", {}),
            "creado_en": "2024-01-01T00:00:00Z",
        }

    async def get_contact_batch(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_contact_batch", kwargs))
        batch_id = kwargs["batch_id"]
        if batch_id == uuid.UUID(int=0):
            return None
        return {
            "id": str(batch_id),
            "estado": "pendiente",
            "canales": ["correo", "whatsapp"],
            "total_prospectos": 2,
            "creado_en": "2024-01-01T00:00:00Z",
        }

    async def summarize_contact_batch(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("summarize_contact_batch", kwargs))
        return [
            {"estado": "pendiente", "count": 1},
            {"estado": "enviado", "count": 1},
        ]

    async def get_contact_envio(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_contact_envio", kwargs))
        envio_id = kwargs["envio_id"]
        if envio_id == uuid.UUID(int=0):
            return None
        return {
            "id": str(envio_id),
            "prospecto_id": str(uuid.uuid4()),
            "batch_id": str(uuid.uuid4()),
            "canal": "whatsapp",
            "estado": "fallido",
        }

    async def update_contact_envio(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_contact_envio", kwargs))
        payload = kwargs["payload"].copy()
        payload["id"] = str(kwargs["envio_id"])
        return payload

    async def insert_prospecto_logs(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("insert_prospecto_logs", kwargs))
        return kwargs.get("entries", [])

    async def list_files(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_files", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "relacion_tipo": kwargs.get("relacion_tipo") or "oportunidad",
                "relacion_id": str(kwargs.get("relacion_id") or uuid.uuid4()),
                "nombre_original": "archivo.pdf",
                "content_type": "application/pdf",
                "tamano_bytes": 1234,
                "storage_path": "files/archivo.pdf",
                "metadata": {},
                "subido_por_usuario_id": str(uuid.uuid4()),
                "subido_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_file(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_file", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "subido_en": "2024-01-01T00:00:00Z",
        }

    async def list_tags(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_tags", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "nombre": "VIP",
                "color": "#FF0000",
                "creado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_tag(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_tag", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "creado_en": "2024-01-01T00:00:00Z",
        }

    async def create_tagging(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_tagging", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "creado_en": "2024-01-01T00:00:00Z",
        }

    async def delete_tagging(self, **kwargs: Any) -> None:
        self.calls.append(("delete_tagging", kwargs))

    async def list_products(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_products", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "codigo": "SKU-1",
                "nombre": "Producto",
                "descripcion": None,
                "precio_base": 100.0,
                "moneda": "MXN",
                "activo": True,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_product(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_product", kwargs))
        payload = dict(kwargs["payload"])
        product_id = str(payload.get("id") or uuid.uuid4())
        product = {
            "id": product_id,
            "organizacion_id": str(kwargs["organizacion_id"]),
            **payload,
            "moneda": payload.get("moneda", "MXN"),
            "activo": payload.get("activo", True),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }
        self.products_by_id[product_id] = product
        return product

    async def list_quotes(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_quotes", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "oportunidad_id": kwargs.get("oportunidad_id"),
                "cuenta_id": None,
                "contacto_id": None,
                "estatus": "borrador",
                "total": 1000.0,
                "moneda": "MXN",
                "valida_hasta": None,
                "creada_por_usuario_id": str(uuid.uuid4()),
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_quote(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_quote", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estatus": kwargs["payload"].get("estatus", "borrador"),
            "moneda": kwargs["payload"].get("moneda", "MXN"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_quote_items(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_quote_items", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "cotizacion_id": str(kwargs["cotizacion_id"]),
                "producto_id": None,
                "descripcion": "Servicio",
                "cantidad": 1,
                "precio_unitario": 1000.0,
                "descuento_porcentaje": None,
                "subtotal": 1000.0,
                "metadata": {},
            }
        ]

    async def add_quote_item(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("add_quote_item", kwargs))
        return {
            "id": str(uuid.uuid4()),
            **kwargs["payload"],
            "descripcion": kwargs["payload"]["descripcion"],
            "cantidad": kwargs["payload"].get("cantidad", 1),
        }

    async def list_quote_entries(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_quote_entries", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "oportunidad_id": str(kwargs["oportunidad_id"]),
                "estatus": "borrador",
                "total": 1160.0,
                "moneda": "MXN",
                "valida_hasta": "2024-01-31",
                "metadata": {"titulo": "Propuesta"},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
                "items": [],
            }
        ]

    async def get_quote_entry(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_quote_entry", kwargs))
        return {
            "id": str(kwargs["quote_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "oportunidad_id": str(uuid.uuid4()),
            "estatus": "borrador",
            "total": 1160.0,
            "moneda": "MXN",
            "valida_hasta": "2024-01-31",
            "metadata": {"titulo": "Propuesta"},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
            "items": [],
        }

    async def create_quote_entry(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_quote_entry", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "oportunidad_id": str(kwargs["oportunidad_id"]),
            "estatus": kwargs["estatus"],
            "total": kwargs.get("total"),
            "moneda": kwargs.get("moneda"),
            "valida_hasta": kwargs.get("valida_hasta"),
            "metadata": kwargs.get("metadata") or {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
            "items": kwargs.get("items") or [],
        }

    async def quote_folio_exists(self, **kwargs: Any) -> bool:
        self.calls.append(("quote_folio_exists", kwargs))
        return False

    async def reserve_quote_folio(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("reserve_quote_folio", kwargs))
        return {
            "folio": "Cot-TEST-010124-0001",
            "secuencia": 1,
            "fecha": "2024-01-01",
            "iniciales": "TEST",
        }

    async def mark_quote_entry(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("mark_quote_entry", kwargs))
        merged_metadata = kwargs.get("metadata_patch") or {}
        return {
            "id": str(kwargs["quote_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "oportunidad_id": str(uuid.uuid4()),
            "estatus": kwargs.get("estatus") or "enviada",
            "total": 1160.0,
            "moneda": "MXN",
            "valida_hasta": "2024-01-31",
            "metadata": merged_metadata,
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
            "items": [],
        }

    async def get_opportunity_with_contact(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_opportunity_with_contact", kwargs))
        return {
            "id": str(kwargs["oportunidad_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "cuenta_id": str(uuid.uuid4()),
            "contacto_principal_id": str(uuid.uuid4()),
            "etapa_id": str(uuid.uuid4()),
            "monto_estimado": 1000.0,
            "moneda": "MXN",
            "metadata": {"tablero_id": str(uuid.uuid4())},
            "etapa": {"codigo": "demo", "categoria": "abierta"},
            "contacto": {
                "id": str(uuid.uuid4()),
                "nombre_completo": "Cliente Demo",
                "correo": "demo@example.com",
                "telefono_e164": "+5215555555555",
                "company_name": "Empresa Demo",
                "notes": "",
                "necesidad_proposito": "",
            },
        }

    async def get_opportunity_with_stage(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_opportunity_with_stage", kwargs))
        opportunity_id = str(kwargs["opportunity_id"])
        if opportunity_id in self.opportunities_with_stage:
            return self.opportunities_with_stage[opportunity_id]
        opportunity = await self.get_opportunity_with_contact(
            organizacion_id=kwargs["organizacion_id"],
            oportunidad_id=kwargs["opportunity_id"],
        )
        if not opportunity:
            return None
        opportunity["etapa"] = {"id": str(uuid.uuid4()), "codigo": "demo", "categoria": "abierta"}
        return opportunity

    async def get_pipeline_opportunity(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_pipeline_opportunity", kwargs))
        opportunity_id = str(kwargs["oportunidad_id"])
        if opportunity_id in self.opportunities_with_stage:
            return self.opportunities_with_stage[opportunity_id]
        return await self.get_opportunity_with_contact(
            organizacion_id=kwargs["organizacion_id"],
            oportunidad_id=kwargs["oportunidad_id"],
        )

    async def get_catalog_item(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_catalog_item", kwargs))
        item_id = str(kwargs["item_id"])
        if item_id in self.catalog_items_by_id:
            return self.catalog_items_by_id[item_id]
        return {
            "id": item_id,
            "organizacion_id": str(kwargs["organizacion_id"]),
            "nombre": "Unidad demo",
            "metadatos": {},
        }

    async def get_product(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_product", kwargs))
        return self.products_by_id.get(str(kwargs["product_id"]))

    async def get_propiedad_unidad(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_propiedad_unidad", kwargs))
        return self.propiedad_unidades_by_id.get(str(kwargs["unidad_id"]))

    async def update_propiedad_unidad(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_propiedad_unidad", kwargs))
        payload = dict(kwargs["payload"])
        self.updated_propiedad_unidades.append(
            {
                "organizacion_id": str(kwargs["organizacion_id"]),
                "unidad_id": str(kwargs["unidad_id"]),
                "payload": payload,
            }
        )
        current = dict(self.propiedad_unidades_by_id.get(str(kwargs["unidad_id"])) or {})
        current.update(payload)
        current.setdefault("id", str(kwargs["unidad_id"]))
        current.setdefault("organizacion_id", str(kwargs["organizacion_id"]))
        self.propiedad_unidades_by_id[str(kwargs["unidad_id"])] = current
        return current

    async def create_propiedad_unidad_movimiento(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_propiedad_unidad_movimiento", kwargs))
        payload = dict(kwargs["payload"])
        self.created_propiedad_unidad_movimientos.append(
            {
                "organizacion_id": str(kwargs["organizacion_id"]),
                "payload": payload,
            }
        )
        return {
            "id": str(uuid.uuid4()),
            **payload,
        }

    async def update_catalog_item(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_catalog_item", kwargs))
        payload = dict(kwargs["payload"])
        self.updated_catalog_items.append(
            {
                "item_id": str(kwargs["item_id"]),
                "payload": payload,
            }
        )
        current = dict(self.catalog_items_by_id.get(str(kwargs["item_id"])) or {})
        current.update(payload)
        current.setdefault("id", str(kwargs["item_id"]))
        current.setdefault("organizacion_id", str(current.get("organizacion_id") or kwargs.get("organizacion_id") or uuid.uuid4()))
        self.catalog_items_by_id[str(kwargs["item_id"])] = current
        return current

    async def list_campaigns(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_campaigns", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "nombre": "Campaña",
                "tipo": "email",
                "canal": "email",
                "presupuesto": 1000.0,
                "fecha_inicio": "2024-01-01",
                "fecha_fin": "2024-01-31",
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_campaign(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_campaign", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_leads(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_leads", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "campana_id": None,
                "contacto_id": None,
                "cuenta_id": None,
                "origen": "ads",
                "estado": kwargs.get("estado") or "nuevo",
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_lead(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_lead", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estado": kwargs["payload"].get("estado", "nuevo"),
            "metadata": kwargs["payload"].get("metadata", {}),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_lead_events(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_lead_events", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "lead_id": str(kwargs["lead_id"]),
                "tipo": "click",
                "metadata": {},
                "registrado_en": "2024-01-02T00:00:00Z",
            }
        ]

    async def create_lead_event(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_lead_event", kwargs))
        return {
            "id": str(uuid.uuid4()),
            **kwargs["payload"],
            "registrado_en": "2024-01-02T00:00:00Z",
        }

    async def list_notes(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_notes", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "relacion_tipo": kwargs.get("relacion_tipo") or "oportunidad",
                "relacion_id": str(kwargs.get("relacion_id") or uuid.uuid4()),
                "actividad_id": str(kwargs.get("actividad_id") or uuid.uuid4()) if kwargs.get("actividad_id") else None,
                "texto": "Nota interna",
                "visible_para_cliente": False,
                "tipo": "interna",
                "creado_por_usuario_id": str(uuid.uuid4()),
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_note(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_note", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "visible_para_cliente": kwargs["payload"].get("visible_para_cliente", False),
            "tipo": kwargs["payload"].get("tipo", "interna"),
            "actividad_id": kwargs["payload"].get("actividad_id"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_audit_logs(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_audit_logs", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "usuario_id": str(uuid.uuid4()),
                "accion": "update",
                "tabla": "oportunidades",
                "registro_id": str(uuid.uuid4()),
                "cambios": {"estado": "ganada"},
                "ip": "1.1.1.1",
                "user_agent": "pytest",
                "creado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def list_contactables_by_ids(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_contactables_by_ids", kwargs))
        return list(self.contactables_by_ids_result)

    async def list_prospectos_by_emails(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_prospectos_by_emails", kwargs))
        return list(self.existing_prospectos_by_emails_result)

    async def list_prospectos_by_phones(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_prospectos_by_phones", kwargs))
        return list(self.existing_prospectos_by_phones_result)

    async def upsert_prospeccion_prospectos(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("upsert_prospeccion_prospectos", kwargs))
        items = [dict(item) for item in kwargs.get("items", [])]
        self.last_upserted_prospectos = items
        return [
            {
                "id": str(uuid.uuid4()),
                **item,
            }
            for item in items
        ]

    async def create_prospecto_manual(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_prospecto_manual", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        if kwargs.get("organizacion_id") is not None:
            body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def bulk_insert_prospectos(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("bulk_insert_prospectos", kwargs))
        items = [dict(item) for item in kwargs.get("items", [])]
        self.last_bulk_inserted_prospectos = items
        return [
            {
                "id": str(uuid.uuid4()),
                **item,
            }
            for item in items
        ]

    async def refresh_prospeccion_query_daily_mv(self, **kwargs: Any) -> None:
        self.calls.append(("refresh_prospeccion_query_daily_mv", kwargs))

    async def delete_prospeccion_busqueda(self, **kwargs: Any) -> int:
        self.calls.append(("delete_prospeccion_busqueda", kwargs))
        return 1

    async def get_prospeccion_busqueda(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_prospeccion_busqueda", kwargs))
        return {
            "organizacion_id": str(uuid.uuid4()),
            "deleted_at": None,
        }

    async def worker_update_busqueda(self, **kwargs: Any) -> None:
        self.calls.append(("worker_update_busqueda", kwargs))


@pytest.fixture()
def fake_repo() -> DummyCRMRepository:
    return DummyCRMRepository()


@pytest.fixture()
def app(fake_repo: DummyCRMRepository) -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(crm_routes.router)
    fastapi_app.dependency_overrides[crm_routes.get_repository] = lambda: fake_repo
    return fastapi_app


@pytest.fixture()
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as session:
        yield session


def _headers(*, include_user_token: bool = False) -> dict[str, str]:
    headers = {
        "X-Organizacion-Id": str(uuid.uuid4()),
        "X-Usuario-Id": str(uuid.uuid4()),
    }
    if include_user_token:
        headers["X-User-Token"] = "test-token"
    return headers



@pytest.mark.asyncio
async def test_list_accounts(client: AsyncClient) -> None:
    resp = await client.get("/crm/cuentas", headers=_headers())
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"]
    assert payload["limit"] == 50
    assert payload["offset"] == 0


@pytest.mark.asyncio
async def test_list_contacts_forwards_organizacion_id(
    client: AsyncClient,
    fake_repo: DummyCRMRepository,
) -> None:
    organizacion_id = uuid.uuid4()
    headers = _headers(include_user_token=True)
    headers["X-Organizacion-Id"] = str(organizacion_id)

    resp = await client.get("/crm/personas/list", headers=headers)

    assert resp.status_code == 200
    personas_calls = [call for call in fake_repo.calls if call[0] == "personas_list"]
    assert personas_calls
    assert personas_calls[-1][1]["organizacion_id"] == organizacion_id


@pytest.mark.asyncio
async def test_export_contacts_forwards_organizacion_id(
    client: AsyncClient,
    fake_repo: DummyCRMRepository,
) -> None:
    organizacion_id = uuid.uuid4()
    headers = _headers(include_user_token=True)
    headers["X-Organizacion-Id"] = str(organizacion_id)

    resp = await client.get("/crm/personas/export", headers=headers)

    assert resp.status_code == 200
    contactos_calls = [call for call in fake_repo.calls if call[0] == "contactos_list"]
    assert contactos_calls
    assert contactos_calls[-1][1]["organizacion_id"] == organizacion_id



@pytest.mark.asyncio
async def test_create_account(client: AsyncClient) -> None:
    body = {"nombre": "Nueva Cuenta", "tipo": "cliente"}
    resp = await client.post("/crm/cuentas", headers=_headers(), json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Nueva Cuenta"
    assert data["tipo"] == "cliente"



@pytest.mark.asyncio
async def test_create_account_rejects_duplicate_contact_data(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    duplicate_email = "dupe@example.com"
    fake_repo.list_accounts = AsyncMock(
        return_value=[
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(org_id),
                "nombre": "Cuenta duplicada",
                "alias": None,
                "tipo": "empresa",
                "estado": "activo",
                "correo_principal": duplicate_email.upper(),
                "correo_secundario": None,
                "telefono_principal_e164": None,
                "telefono_secundario_e164": None,
                "telefono": None,
                "rfc": None,
                "archived_at": None,
                "merged_into_cuenta_id": None,
                "propietario_usuario_id": None,
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]
    )

    resp = await client.post(
        "/crm/cuentas",
        headers={**_headers(), "X-Organizacion-Id": str(org_id)},
        json={
            "nombre": "Nueva Cuenta",
            "tipo": "cliente",
            "correo_principal": duplicate_email,
        },
    )

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["code"] == "duplicate_account_detected"
    assert detail["candidatos_cuenta"]
    assert detail["message"]


@pytest.mark.asyncio
async def test_create_persona_alta_rejects_duplicate_contact_data(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    duplicate_email = "contacto-dupe@example.com"
    duplicate_phone = "+5215550000001"
    existing_persona = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(org_id),
        "codigo_contacto": "Con999",
        "nombre_completo": "Contacto Duplicado",
        "correo_principal": duplicate_email.upper(),
        "correo_secundario": None,
        "correo_institucional": None,
        "correo_personal_3": None,
        "telefono_principal_e164": duplicate_phone,
        "telefono_principal_tipo_linea": "movil",
        "telefono_principal_extension": None,
        "telefono_movil_1_e164": duplicate_phone,
        "telefono_movil_2_e164": None,
        "telefono_secundario_e164": None,
        "telefono_empresa_1_e164": None,
        "telefono_empresa_2_e164": None,
        "company_name": None,
        "propietario_usuario_id": None,
        "archived_at": None,
        "merged_into_persona_id": None,
        "estado": "activo",
        "creado_en": "2024-01-01T00:00:00Z",
        "actualizado_en": "2024-01-01T00:00:00Z",
    }
    fake_repo.get_persona_by_email = AsyncMock(return_value=existing_persona)
    fake_repo.get_persona_by_phone_e164 = AsyncMock(return_value=None)

    resp = await client.post(
        "/crm/personas/alta",
        headers={**_headers(), "X-Organizacion-Id": str(org_id)},
        json={
            "persona": {
                "nombre": "Ana",
                "apellido_paterno": "Pérez",
                "apellido_materno": "López",
                "correo_principal": duplicate_email,
                "telefono_principal_e164": duplicate_phone,
            },
            "contexto_comercial": {
                "modo": "solo_persona",
                "usar_cuenta_existente": False,
                "crear_cuenta_nueva": False,
                "es_persona_fisica_actividad_empresarial": False,
            },
        },
    )

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["code"] == "dedupe_confirmation_required"
    assert detail["candidatos_persona"]
    assert detail["message"]


@pytest.mark.asyncio
async def test_create_persona_alta_pfae_preserves_account_type_and_code(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    account_id = uuid.uuid4()
    expected_account_code = "PFAE-441"

    async def _create_persona_with_linked_account(**kwargs: Any) -> dict[str, Any]:
        fake_repo.calls.append(("create_persona", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body["cuenta_id"] = str(account_id)
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def _get_account_pfae(**kwargs: Any) -> dict[str, Any] | None:
        fake_repo.calls.append(("get_account", kwargs))
        return {
            "id": str(kwargs["account_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "nombre": "Ana Perez Lopez",
            "alias": "Ana Perez Lopez",
            "tipo": "persona_fisica_actividad_empresarial",
            "codigo_cuenta": expected_account_code,
            "razon_social": "Ana Perez Lopez",
            "rfc": "PELJ800101ABC",
            "industria": None,
            "tamano": None,
            "sitio_web": None,
            "telefono": None,
            "correo": None,
            "direccion": {},
            "propietario_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    fake_repo.create_persona = _create_persona_with_linked_account
    fake_repo.get_account = _get_account_pfae

    resp = await client.post(
        "/crm/personas/alta",
        headers={**_headers(), "X-Organizacion-Id": str(org_id)},
        json={
            "persona": {
                "nombre": "Ana",
                "apellido_paterno": "Perez",
                "apellido_materno": "Lopez",
                "correo_principal": "ana@example.com",
                "telefono_principal_e164": "+5215512345678",
                "origen": "prospeccion_propia",
            },
            "contexto_comercial": {
                "modo": "persona_fisica_actividad_empresarial",
                "usar_cuenta_existente": False,
                "crear_cuenta_nueva": True,
                "es_persona_fisica_actividad_empresarial": True,
            },
            "cuenta": {
                "nombre_comercial": "Ana Perez Lopez",
                "razon_social": "Ana Perez Lopez",
                "tipo_persona": "fisica",
                "tipo_cuenta": "persona_fisica_actividad_empresarial",
                "tipo": "persona_fisica_actividad_empresarial",
                "codigo_cuenta": expected_account_code,
                "rfc": "PELJ800101ABC",
            },
            "extras": {
                "direccion": {
                    "tipo": "principal",
                }
            },
        },
    )

    assert resp.status_code == 201, resp.text
    create_persona_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "create_persona")
    assert create_persona_call["payload"]["tipo_cuenta"] == "persona_fisica_actividad_empresarial"
    assert create_persona_call["payload"]["codigo_cuenta"] == expected_account_code
    assert "tipo" not in create_persona_call["payload"]

    payload = resp.json()
    assert payload["cuenta"]["tipo"] == "persona_fisica_actividad_empresarial"
    assert payload["cuenta"]["codigo_cuenta"] == expected_account_code


@pytest.mark.asyncio
async def test_reassign_opportunity_aligns_contact_and_conversation(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    opportunity_id = uuid.uuid4()
    persona_id = uuid.uuid4()
    conversation_id = uuid.uuid4()
    seller_id = uuid.uuid4()

    fake_repo.current_user_has_perm = AsyncMock(return_value=True)
    fake_repo.get_employee_vendor = AsyncMock(return_value={"id": str(seller_id), "es_vendedor": True})
    fake_repo.get_opportunity = AsyncMock(
        return_value={
            "id": str(opportunity_id),
            "organizacion_id": str(uuid.uuid4()),
            "contacto_principal_id": str(persona_id),
            "metadata": {},
        }
    )
    fake_repo.update_opportunity = AsyncMock(return_value={"id": str(opportunity_id)})
    fake_repo.update_persona = AsyncMock(return_value={"id": str(persona_id)})
    fake_repo.update_conversation = AsyncMock(return_value={"id": str(conversation_id)})
    fake_repo.insert_sales_assignment_audit = AsyncMock(return_value={"id": str(uuid.uuid4())})
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda *args, **kwargs: fake_repo)

    resp = await client.post(
        f"/crm/oportunidades/{opportunity_id}/reasignar",
        headers=_headers(include_user_token=True),
        json={
            "asignado_usuario_id": str(seller_id),
            "persona_id": str(persona_id),
            "conversacion_id": str(conversation_id),
            "alinear_persona": True,
            "alinear_conversacion": True,
        },
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["oportunidad_id"] == str(opportunity_id)
    assert payload["persona_actualizada"] is True
    assert payload["conversacion_actualizada"] is True

    assert fake_repo.update_opportunity.await_count == 1
    assert fake_repo.update_persona.await_count == 1
    assert fake_repo.update_conversation.await_count == 1
    assert fake_repo.insert_sales_assignment_audit.await_count == 1

    persona_kwargs = fake_repo.update_persona.await_args.kwargs
    assert persona_kwargs["persona_id"] == persona_id
    assert "contacto_id" not in persona_kwargs


@pytest.mark.asyncio
async def test_delete_denue_busqueda_borra_fisicamente(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    busqueda_id = uuid.uuid4()

    resp = await client.delete(
        f"/crm/prospeccion/denue/busquedas/{busqueda_id}",
        headers=_headers(),
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["deleted"] == 1
    assert any(
        call_name == "delete_prospeccion_busqueda"
        and call_kwargs.get("busqueda_id") == busqueda_id
        and call_kwargs.get("fuente") == "denue"
        for call_name, call_kwargs in fake_repo.calls
    )
    assert all(call_name != "worker_update_busqueda" for call_name, _ in fake_repo.calls)



@pytest.mark.asyncio
async def test_guardar_prospectos_deduplica_email_y_telefono(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    resultado_ids = [uuid.uuid4() for _ in range(4)]
    fake_repo.contactables_by_ids_result = [
        {
            "busqueda_id": str(uuid.uuid4()),
            "resultado_id": str(resultado_ids[0]),
            "fuente_resultado": "google_places",
            "fuente_busqueda": "google",
            "busqueda_meta": {"query": "Pizza artesanal cerca de mi"},
            "display_name": "Contacto 1",
            "name": "Contacto 1",
            "phone": "55 1111 2222",
            "email": "Duplicado@Ejemplo.com",
            "website": "https://ejemplo.com",
            "metadata": {},
        },
        {
            "busqueda_id": str(uuid.uuid4()),
            "resultado_id": str(resultado_ids[1]),
            "fuente_resultado": "google_places",
            "fuente_busqueda": "google",
            "display_name": "Contacto 2",
            "name": "Contacto 2",
            "phone": "55 9999 8888",
            "email": "duplicado@ejemplo.com",
            "website": "https://ejemplo.com",
            "metadata": {},
        },
        {
            "busqueda_id": str(uuid.uuid4()),
            "resultado_id": str(resultado_ids[2]),
            "fuente_resultado": "google_places",
            "fuente_busqueda": "google",
            "display_name": "Contacto 3",
            "name": "Contacto 3",
            "phone": "55 1111 2222",
            "email": "otro@ejemplo.com",
            "website": "https://ejemplo.com",
            "metadata": {},
        },
        {
            "busqueda_id": str(uuid.uuid4()),
            "resultado_id": str(resultado_ids[3]),
            "fuente_resultado": "google_places",
            "fuente_busqueda": "google",
            "display_name": "Contacto 4",
            "name": "Contacto 4",
            "phone": "55 3333 4444",
            "email": None,
            "website": "https://ejemplo.com",
            "metadata": {},
        },
    ]

    resp = await client.post(
        "/crm/prospeccion/prospectos",
        headers=_headers(include_user_token=True),
        json={
            "fuente": "google_places",
            "resultado_ids": [str(value) for value in resultado_ids],
            "segmento": "Prueba",
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["prospectos"]) == 3
    assert len(fake_repo.last_upserted_prospectos) == 3
    assert any(item.get("phone_e164") for item in fake_repo.last_upserted_prospectos)
    assert any(item.get("phone") == "55 3333 4444" for item in fake_repo.last_upserted_prospectos)
    assert any(item.get("email") == "otro@ejemplo.com" for item in fake_repo.last_upserted_prospectos)
    assert fake_repo.last_upserted_prospectos[0].get("busqueda_ref")
    assert fake_repo.last_upserted_prospectos[0].get("query_sort") == "Pizza artesanal cerca de mi"



@pytest.mark.asyncio
async def test_crear_prospecto_manual_permite_datos_de_persona(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    resp = await client.post(
        "/crm/prospeccion/prospectos/manual",
        headers=_headers(include_user_token=True),
        json={
            "display_name": "Grupo Demo",
            "nombre_comercial": "Grupo Demo SA de CV",
            "titulo": "Ing.",
                "nombre": "Ana",
                "primer_apellido": "Lopez",
                "segundo_apellido": "Garcia",
                "tipo_vialidad": "Av.",
                "nombre_vialidad": "Reforma",
                "numero_exterior": "123",
                "colonia": "Juarez",
                "codigo_postal": "06600",
                "municipio_nombre": "Cuauhtemoc",
                "estado_nombre": "Ciudad de Mexico",
                "email": "Ana@Ejemplo.com",
                "phone": "55 1111 2222",
            },
        )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["prospecto"]["titulo"] == "Ing."
    assert payload["prospecto"]["nombre"] == "Ana"
    assert payload["prospecto"]["primer_apellido"] == "Lopez"
    assert payload["prospecto"]["segundo_apellido"] == "Garcia"
    assert payload["prospecto"]["nombre_comercial"] == "Grupo Demo SA de CV"
    assert payload["prospecto"]["address"] == "Av. Reforma 123, Juarez, Cuauhtemoc, Ciudad de Mexico, CP 06600"
    assert payload["prospecto"]["address_full"] == "Av. Reforma 123, Juarez, Cuauhtemoc, Ciudad de Mexico, CP 06600"
    assert fake_repo.calls and fake_repo.calls[-1][0] == "create_prospecto_manual"
    create_call = fake_repo.calls[-1][1]
    assert create_call["payload"]["titulo"] == "Ing."
    assert create_call["payload"]["nombre"] == "Ana"
    assert create_call["payload"]["primer_apellido"] == "Lopez"
    assert create_call["payload"]["segundo_apellido"] == "Garcia"
    assert create_call["payload"]["address"] == "Av. Reforma 123, Juarez, Cuauhtemoc, Ciudad de Mexico, CP 06600"
    assert create_call["payload"]["address_full"] == "Av. Reforma 123, Juarez, Cuauhtemoc, Ciudad de Mexico, CP 06600"


@pytest.mark.asyncio
async def test_importar_prospectos_en_lote_soporta_persona_y_empresa(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    resp = await client.post(
        "/crm/prospeccion/prospectos/importar",
        headers={**_headers(include_user_token=True), "X-Organizacion-Id": str(org_id)},
        json={
            "items": [
                {
                    "nombre_comercial": "Alpha SA de CV",
                    "titulo": "JEFE DE RELACIONES LABORALES Y CAPACITACIÓN",
                    "nombre": "Carlos",
                    "primer_apellido": "Perez",
                    "tipo_vialidad": "Calle",
                    "nombre_vialidad": "Madero",
                    "numero_exterior": "456",
                    "municipio_nombre": "Monterrey",
                    "estado_nombre": "Nuevo Leon",
                    "email": "carlos@ejemplo.com",
                    "phone": "+52 55 1234 5678",
                },
                {
                    "nombre": "Mariana",
                    "primer_apellido": "Ruiz",
                    "segundo_apellido": "Lopez",
                    "colonia": "Centro",
                    "codigo_postal": "64000",
                },
            ]
        },
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["created"] == 2
    assert len(payload["prospectos"]) == 2
    assert fake_repo.last_bulk_inserted_prospectos[0]["titulo"] == "JEFE DE RELACIONES LABORALES Y CAPACITACIÓN"
    assert fake_repo.last_bulk_inserted_prospectos[0]["nombre"] == "Carlos"
    assert fake_repo.last_bulk_inserted_prospectos[0]["primer_apellido"] == "Perez"
    assert fake_repo.last_bulk_inserted_prospectos[0]["address"] == "Calle Madero 456, Monterrey, Nuevo Leon"
    assert fake_repo.last_bulk_inserted_prospectos[0]["address_full"] == "Calle Madero 456, Monterrey, Nuevo Leon"
    assert fake_repo.last_bulk_inserted_prospectos[1]["display_name"] == "Mariana Ruiz Lopez"
    assert fake_repo.last_bulk_inserted_prospectos[1]["address"] == "Centro, CP 64000"
    call_names = [call_name for call_name, _ in fake_repo.calls]
    assert "list_prospectos_by_emails" in call_names
    assert "list_prospectos_by_phones" in call_names
    assert "bulk_insert_prospectos" in call_names
    email_call = next(kwargs for call_name, kwargs in fake_repo.calls if call_name == "list_prospectos_by_emails")
    phone_call = next(kwargs for call_name, kwargs in fake_repo.calls if call_name == "list_prospectos_by_phones")
    bulk_call = next(kwargs for call_name, kwargs in fake_repo.calls if call_name == "bulk_insert_prospectos")
    assert email_call["organizacion_id"] == org_id
    assert phone_call["organizacion_id"] == org_id
    assert bulk_call["organizacion_id"] == org_id


@pytest.mark.asyncio
async def test_importar_prospectos_en_lote_acepta_solo_telefono(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    resp = await client.post(
        "/crm/prospeccion/prospectos/importar",
        headers={**_headers(include_user_token=True), "X-Organizacion-Id": str(org_id)},
        json={
            "items": [
                {
                    "phone": "+52 55 5555 1212",
                },
            ]
        },
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["created"] == 1
    assert payload["skipped"] == 0
    assert len(payload["prospectos"]) == 1
    assert payload["prospectos"][0]["display_name"] == "+52 55 5555 1212"
    assert fake_repo.last_bulk_inserted_prospectos[0]["display_name"] == "+52 55 5555 1212"
    assert fake_repo.last_bulk_inserted_prospectos[0]["phone"] == "+52 55 5555 1212"


@pytest.mark.asyncio
async def test_importar_prospectos_en_lote_reporta_omitidos_con_motivo(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    org_id = uuid.uuid4()
    fake_repo.existing_prospectos_by_emails_result = [
        {"id": str(uuid.uuid4()), "email": "existente@ejemplo.com"}
    ]
    resp = await client.post(
        "/crm/prospeccion/prospectos/importar",
        headers={**_headers(include_user_token=True), "X-Organizacion-Id": str(org_id)},
        json={
            "items": [
                {
                    "nombre_comercial": "Alpha SA de CV",
                    "email": "dup@ejemplo.com",
                    "phone": "+52 55 1234 5678",
                },
                {
                    "nombre_comercial": "Alpha repetido",
                    "email": "dup@ejemplo.com",
                    "phone": "+52 55 9999 1111",
                },
                {
                    "nombre_comercial": "Beta existente",
                    "email": "existente@ejemplo.com",
                },
                {
                    "nombre_comercial": "Gamma ok",
                    "email": "gamma@ejemplo.com",
                },
            ]
        },
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["created"] == 2
    assert payload["skipped"] == 2
    assert len(payload["omitidos"]) == 2
    assert payload["omitidos"][0]["row"] == 2
    assert payload["omitidos"][0]["motivo"] == "duplicado_en_archivo"
    assert "Correo repetido" in payload["omitidos"][0]["detalle"]
    assert payload["omitidos"][1]["row"] == 3
    assert payload["omitidos"][1]["motivo"] == "ya_existia_en_tenant"
    assert "ya existe un prospecto con ese correo" in payload["omitidos"][1]["detalle"].lower()
    assert len(fake_repo.last_bulk_inserted_prospectos) == 2
    assert all("__import_row" not in item for item in fake_repo.last_bulk_inserted_prospectos)


def test_build_contact_envios_entries_includes_person_fields() -> None:
    entries, suppressed = crm_routes._build_contact_envios_entries(
        batch_id=uuid.uuid4(),
        prospectos=[
            {
                "id": str(uuid.uuid4()),
                "display_name": "Grupo Demo",
                "nombre_comercial": "Grupo Demo SA de CV",
                "titulo": "Ing.",
                "nombre": "Ana",
                "primer_apellido": "Lopez",
                "segundo_apellido": "Garcia",
                "email": "ana@ejemplo.com",
                "phone": "+52 55 1111 2222",
                "segmento": "Servicios",
            }
        ],
        canales={"correo": {"enabled": True, "body": "Hola {{nombre}}"}},
        programacion=None,
        separacion_segundos=5,
    )

    assert suppressed == {}
    assert len(entries) == 1
    detalle = entries[0]["detalle"]
    assert detalle["display_name"] == "Grupo Demo"
    assert detalle["nombre_comercial"] == "Grupo Demo SA de CV"
    assert detalle["titulo"] == "Ing."
    assert detalle["nombre"] == "Ana"
    assert detalle["primer_apellido"] == "Lopez"
    assert detalle["segundo_apellido"] == "Garcia"


class _FrozenCampaignScheduleDateTime(crm_routes.datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        base = crm_routes.datetime(2026, 7, 17, 12, 0, 0, tzinfo=crm_routes.UTC)
        if tz is None:
            return base.replace(tzinfo=None)
        return base.astimezone(tz)


@pytest.mark.asyncio
async def test_align_programacion_keeps_requested_slot_before_future_campaign_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(crm_routes, "datetime", _FrozenCampaignScheduleDateTime)

    class Repo:
        async def list_contact_batches(self, **kwargs: Any) -> tuple[list[dict[str, Any]], int]:
            return (
                [
                    {
                        "id": str(uuid.uuid4()),
                        "estado": "pendiente",
                    }
                ],
                1,
            )

        async def list_contact_envios_for_batches(self, **kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "estado": "pendiente",
                    "canal": "correo",
                    "programado_en": "2026-07-20T15:00:00+00:00",
                }
            ]

    resolved = await crm_routes._align_programacion_with_active_campaign_schedule(
        repo=Repo(),
        user_token="token",
        campana_id=uuid.uuid4(),
        canales={"correo"},
        programacion={"correo": "2026-07-17T12:05:00+00:00"},
        separacion_segundos=5,
    )

    assert resolved["correo"] == "2026-07-17T12:05:00+00:00"


@pytest.mark.asyncio
async def test_align_programacion_moves_requested_slot_after_prior_active_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(crm_routes, "datetime", _FrozenCampaignScheduleDateTime)

    class Repo:
        async def list_contact_batches(self, **kwargs: Any) -> tuple[list[dict[str, Any]], int]:
            return (
                [
                    {
                        "id": str(uuid.uuid4()),
                        "estado": "pendiente",
                    }
                ],
                1,
            )

        async def list_contact_envios_for_batches(self, **kwargs: Any) -> list[dict[str, Any]]:
            return [
                {
                    "estado": "pendiente",
                    "canal": "correo",
                    "programado_en": "2026-07-17T12:04:00+00:00",
                }
            ]

    resolved = await crm_routes._align_programacion_with_active_campaign_schedule(
        repo=Repo(),
        user_token="token",
        campana_id=uuid.uuid4(),
        canales={"correo"},
        programacion={"correo": "2026-07-17T12:04:02+00:00"},
        separacion_segundos=5,
    )

    assert resolved["correo"] == "2026-07-17T12:04:05+00:00"


@pytest.mark.asyncio
async def test_actualizar_prospecto_no_resetea_verificacion_si_el_telefono_no_cambia(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    prospecto_id = uuid.uuid4()
    fake_repo.prospectos_by_ids_result = [
        {
            "id": str(prospecto_id),
            "display_name": "Grupo Demo",
            "nombre_comercial": "Grupo Demo SA de CV",
            "nombre": "Ana",
            "primer_apellido": "Lopez",
            "segundo_apellido": "Garcia",
            "actividad": "Servicios",
            "email": "ana@ejemplo.com",
            "phone": "+52 55 1111 2222",
            "phone_e164": "+5215511112222",
            "lookup_status": "verificado",
            "metadata": {},
        }
    ]

    resp = await client.patch(
        f"/crm/prospeccion/prospectos/{prospecto_id}",
        headers=_headers(include_user_token=True),
        json={
            "nombre_comercial": "Grupo Demo SA de CV",
            "nombre": "Ana",
            "primer_apellido": "Lopez",
            "segundo_apellido": "Garcia",
            "phone": "+52 55 1111 2222",
            "email": "ana@ejemplo.com",
        },
    )

    assert resp.status_code == 200, resp.text
    update_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "update_prospecto")
    payload = update_call["payload"]
    assert payload["display_name"] == "Grupo Demo SA de CV"
    assert payload["nombre_comercial"] == "Grupo Demo SA de CV"
    assert "lookup_status" not in payload
    assert "phone_e164" not in payload
    assert "phone_national" not in payload
    assert "carrier_type" not in payload


@pytest.mark.asyncio
async def test_actualizar_prospecto_no_resetea_verificacion_si_el_telefono_cambia_solo_de_formato(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    prospecto_id = uuid.uuid4()
    fake_repo.prospectos_by_ids_result = [
        {
            "id": str(prospecto_id),
            "display_name": "Grupo Demo",
            "nombre_comercial": "Grupo Demo SA de CV",
            "nombre": "Ana",
            "primer_apellido": "Lopez",
            "segundo_apellido": "Garcia",
            "actividad": "Servicios",
            "email": "ana@ejemplo.com",
            "phone": "+52 55 1111 2222",
            "phone_e164": "+5215511112222",
            "lookup_status": "verificado",
            "metadata": {},
        }
    ]

    resp = await client.patch(
        f"/crm/prospeccion/prospectos/{prospecto_id}",
        headers=_headers(include_user_token=True),
        json={
            "phone": "55 1111 2222",
            "actividad": "Consultoría",
        },
    )

    assert resp.status_code == 200, resp.text
    update_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "update_prospecto")
    payload = update_call["payload"]
    assert payload["actividad"] == "Consultoría"
    assert "lookup_status" not in payload
    assert "phone" not in payload
    assert "phone_e164" not in payload
    assert "phone_national" not in payload
    assert "carrier_type" not in payload


@pytest.mark.asyncio
async def test_actualizar_prospecto_recalcula_nombre_visible_desde_persona_o_empresa(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    prospecto_id = uuid.uuid4()
    fake_repo.prospectos_by_ids_result = [
        {
            "id": str(prospecto_id),
            "display_name": "Grupo Demo",
            "nombre_comercial": "Grupo Demo SA de CV",
            "nombre": "Ana",
            "primer_apellido": "Lopez",
            "segundo_apellido": "Garcia",
            "actividad": "Servicios",
            "email": "ana@ejemplo.com",
            "phone": "+52 55 1111 2222",
            "metadata": {},
        }
    ]

    resp = await client.patch(
        f"/crm/prospeccion/prospectos/{prospecto_id}",
        headers=_headers(include_user_token=True),
        json={
            "nombre_comercial": "Grupo Demo SA de CV",
            "nombre": "Ana",
            "primer_apellido": "Lopez",
            "segundo_apellido": "Garcia",
            "actividad": "Consultoría",
            "email": "ana@ejemplo.com",
        },
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["prospecto"]["display_name"] == "Grupo Demo SA de CV"
    call_names = [name for name, _ in fake_repo.calls]
    assert "update_prospecto" in call_names
    update_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "update_prospecto")
    assert update_call["prospecto_id"] == prospecto_id
    assert update_call["payload"]["display_name"] == "Grupo Demo SA de CV"
    assert update_call["payload"]["nombre_comercial"] == "Grupo Demo SA de CV"


@pytest.mark.asyncio
async def test_convertir_prospecto_a_contacto_no_falla_y_actualiza_metadata(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    prospecto_id = uuid.uuid4()
    fake_repo.prospectos_by_ids_result = [
        {
            "id": str(prospecto_id),
            "nombre_comercial": "Prospecto Demo",
            "display_name": "Prospecto Demo",
            "actividad": "Arquitectura",
            "email": "demo@ejemplo.com",
            "phone_e164": "+5215550000000",
            "phone": "+52 1 555 000 0000",
            "website": "https://demo.ejemplo.com",
            "notas": "Nota de prueba",
            "segmento": "Servicios",
            "metadata": {},
        }
    ]

    resp = await client.post(
        f"/crm/prospeccion/prospectos/{prospecto_id}/convertir-contacto",
        headers=_headers(include_user_token=True),
        json={
            "company_name": "Empresa Demo",
            "notas": "Conversión manual",
            "canal_origen": "correo",
        },
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["contacto"]["id"]
    assert payload["prospecto"]["metadata"]["convertido_contacto_id"] == payload["contacto"]["id"]
    call_names = [name for name, _ in fake_repo.calls]
    assert "list_prospectos_by_ids" in call_names
    assert "create_persona" in call_names
    assert "get_stage_by_code" in call_names
    assert "create_opportunity" in call_names
    assert "update_prospecto" in call_names
    create_persona_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "create_persona")
    assert create_persona_call["payload"]["company_name"] == "Empresa Demo"
    assert create_persona_call["payload"]["website"] == "https://demo.ejemplo.com"
    assert create_persona_call["payload"]["segmento"] == "Servicios"
    assert create_persona_call["payload"]["tipo_industria"] == "Arquitectura"
    create_opportunity_call = next(call_kwargs for call_name, call_kwargs in fake_repo.calls if call_name == "create_opportunity")
    assert isinstance(create_opportunity_call["payload"]["contacto_principal_id"], str)
    assert create_opportunity_call["payload"]["metadata"]["prospeccion_segmento"] == "Servicios"
    assert create_opportunity_call["payload"]["metadata"]["prospeccion_actividad"] == "Arquitectura"


@pytest.mark.asyncio
async def test_cliente_de_oportunidad_refleja_cliente_existente_por_contacto(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    oportunidad_id = uuid.uuid4()
    contacto_id = uuid.uuid4()
    fake_repo.clients_by_contact[str(contacto_id)] = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(uuid.uuid4()),
        "contacto_id": str(contacto_id),
        "oportunidad_id": None,
        "legacy_lead_id": None,
        "estado_onboarding": "pendiente",
        "razon_social": "Cliente Existente",
    }

    async def _opportunity_with_contact(**kwargs: Any) -> dict[str, Any] | None:
        fake_repo.calls.append(("get_opportunity_with_contact", kwargs))
        return {
            "id": str(kwargs["oportunidad_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "contacto_principal_id": str(contacto_id),
            "cuenta_id": str(uuid.uuid4()),
            "etapa": {"codigo": "cerrado_ganado", "categoria": "ganada"},
        }

    monkeypatch.setattr(fake_repo, "get_opportunity_with_contact", _opportunity_with_contact)

    resp = await client.get(
        f"/crm/oportunidades/{oportunidad_id}/cliente",
        headers=_headers(include_user_token=True),
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["cliente"] is not None
    assert payload["cliente_existente_por_contacto"] is not None
    assert payload["puede_convertir"] is False
    assert payload["razon_no_convertir"] == "cliente_ya_existe"
    assert payload["cliente"]["contacto_id"] == str(contacto_id)



@pytest.mark.asyncio
async def test_registrar_venta_propiedad_requiere_oportunidad(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    catalog_item_id = uuid.uuid4()
    unidad_id = uuid.uuid4()
    propiedad_id = uuid.uuid4()
    fake_repo.catalog_items_by_id[str(catalog_item_id)] = {
        "id": str(catalog_item_id),
        "organizacion_id": str(uuid.uuid4()),
        "nombre": "Unidad demo",
        "metadatos": {},
    }
    fake_repo.propiedad_unidades_by_id[str(unidad_id)] = {
        "id": str(unidad_id),
        "organizacion_id": str(uuid.uuid4()),
        "propiedad_id": str(propiedad_id),
        "status": "disponible",
        "precio": 1500000,
    }

    resp = await client.post(
        "/crm/ventas/propiedades",
        headers=_headers(),
        json={
            "catalog_item_id": str(catalog_item_id),
            "propiedad_id": str(propiedad_id),
            "unidad_id": str(unidad_id),
            "precio_final": 1500000,
            "moneda": "MXN",
        },
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "sale_requires_opportunity"



@pytest.mark.asyncio
async def test_registrar_venta_propiedad_actualiza_relaciones_y_movimiento(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    catalog_item_id = uuid.uuid4()
    unidad_id = uuid.uuid4()
    propiedad_id = uuid.uuid4()
    oportunidad_id = uuid.uuid4()
    persona_id = uuid.uuid4()
    fallback_persona_id = uuid.uuid4()
    cuenta_id = uuid.uuid4()
    stage_id = uuid.uuid4()

    fake_repo.catalog_items_by_id[str(catalog_item_id)] = {
        "id": str(catalog_item_id),
        "organizacion_id": str(uuid.uuid4()),
        "nombre": "Unidad demo",
        "slug": "unidad-demo",
        "precio_base": 1500000,
        "moneda": "MXN",
        "activo": True,
        "metadatos": {},
    }
    fake_repo.propiedad_unidades_by_id[str(unidad_id)] = {
        "id": str(unidad_id),
        "organizacion_id": str(uuid.uuid4()),
        "propiedad_id": str(propiedad_id),
        "status": "disponible",
        "precio": 1500000,
        "catalog_item_id": None,
    }
    fake_repo.opportunities_with_stage[str(oportunidad_id)] = {
        "id": str(oportunidad_id),
        "organizacion_id": str(uuid.uuid4()),
        "cuenta_id": str(cuenta_id),
        "contacto_principal_id": str(fallback_persona_id),
        "etapa_id": str(stage_id),
        "etapa": {"id": str(stage_id), "codigo": "demo", "categoria": "abierta"},
        "monto_estimado": 1500000.0,
        "moneda": "MXN",
        "metadata": {},
        "contacto": {
            "id": str(fallback_persona_id),
            "nombre_completo": "Cliente Demo",
            "correo": "demo@example.com",
            "telefono_e164": "+521111111111",
        },
    }

    monkeypatch.setattr(crm_routes, "_render_quote_pdf_after_sale", AsyncMock(return_value=None))
    monkeypatch.setattr(
        crm_routes,
        "_mark_quote_as_accepted_from_mapbox",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(crm_routes, "_advance_opportunity_to_won", AsyncMock(return_value=None))

    resp = await client.post(
        "/crm/ventas/propiedades",
        headers=_headers(),
        json={
            "catalog_item_id": str(catalog_item_id),
            "propiedad_id": str(propiedad_id),
            "unidad_id": str(unidad_id),
            "precio_final": 1750000,
            "moneda": "MXN",
            "oportunidad_id": str(oportunidad_id),
            "persona_id": str(persona_id),
            "cuenta_id": str(cuenta_id),
            "contacto_id": str(fallback_persona_id),
        },
    )

    assert resp.status_code == 201, resp.text
    payload = resp.json()
    assert payload["id"]
    assert any(call_name == "create_quote" for call_name, _ in fake_repo.calls)
    assert any(call_name == "add_quote_item" for call_name, _ in fake_repo.calls)
    assert fake_repo.updated_propiedad_unidades
    assert fake_repo.updated_propiedad_unidades[0]["payload"]["status"] == "vendido"
    assert fake_repo.updated_propiedad_unidades[0]["payload"]["oportunidad_id"] == str(oportunidad_id)
    assert fake_repo.updated_propiedad_unidades[0]["payload"]["catalog_item_id"] == str(catalog_item_id)
    assert fake_repo.created_propiedad_unidad_movimientos
    movimiento_payload = fake_repo.created_propiedad_unidad_movimientos[0]["payload"]
    assert movimiento_payload["oportunidad_id"] == str(oportunidad_id)
    assert movimiento_payload["persona_id"] == str(persona_id)
    assert movimiento_payload["cuenta_id"] == str(cuenta_id)
    assert movimiento_payload["estado_nuevo"] == "vendido"
    assert fake_repo.updated_catalog_items
    assert fake_repo.updated_catalog_items[0]["payload"]["oportunidad_id"] == str(oportunidad_id)
    assert fake_repo.updated_catalog_items[0]["payload"]["persona_id"] == str(persona_id)


@pytest.mark.asyncio
async def test_reject_previous_quotes_for_opportunity_marks_prior_quotes_rejected(
    fake_repo: DummyCRMRepository,
) -> None:
    oportunidad_id = uuid.uuid4()
    keep_quote_id = uuid.uuid4()
    previous_quote_1 = uuid.uuid4()
    previous_quote_2 = uuid.uuid4()

    async def fake_list_quote_entries(**_: Any) -> list[dict[str, Any]]:
        return [
            {
                "id": str(keep_quote_id),
                "oportunidad_id": str(oportunidad_id),
                "estatus": "aceptada",
                "metadata": {},
            },
            {
                "id": str(previous_quote_1),
                "oportunidad_id": str(oportunidad_id),
                "estatus": "enviada",
                "metadata": {},
            },
            {
                "id": str(previous_quote_2),
                "oportunidad_id": str(oportunidad_id),
                "estatus": "borrador",
                "metadata": {},
            },
        ]

    fake_repo.list_quote_entries = fake_list_quote_entries  # type: ignore[assignment]

    await crm_routes._reject_previous_quotes_for_opportunity(
        repo=fake_repo,
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        oportunidad_id=oportunidad_id,
        keep_quote_id=keep_quote_id,
        usuario_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
    )

    mark_calls = [
        kwargs
        for call_name, kwargs in fake_repo.calls
        if call_name == "mark_quote_entry"
    ]
    assert len(mark_calls) == 2
    assert {str(call["quote_id"]) for call in mark_calls} == {
        str(previous_quote_1),
        str(previous_quote_2),
    }
    assert all(call["estatus"] == "rechazada" for call in mark_calls)
    assert all(
        call["metadata_patch"]["quote_reemplazada_por"] == str(keep_quote_id)
        for call in mark_calls
    )


def test_parse_quote_items_uses_catalog_item_description_as_fallback() -> None:
    quote_id = uuid.uuid4()
    catalog_item_id = uuid.uuid4()

    items = crm_routes._parse_quote_items(
        [
            {
                "id": str(uuid.uuid4()),
                "cotizacion_id": str(quote_id),
                "catalog_item_id": str(catalog_item_id),
                "titulo": None,
                "descripcion": None,
                "unidad": "unidad",
                "cantidad": 1,
                "precio_unitario": 1500,
                "descuento": None,
                "subtotal": 1500,
                "impuestos": None,
                "total": 1740,
                "moneda": "MXN",
                "orden": 1,
                "metadata": {},
                "catalog_item": {
                    "id": str(catalog_item_id),
                    "slug": "servicio-demo",
                    "nombre": "Servicio demo",
                    "tipo": "servicio",
                    "descripcion": "Descripción larga del producto",
                    "descripcion_corta": "Descripción breve",
                    "descripcion_larga": "Descripción larga del producto",
                    "unidad": "unidad",
                    "precio_base": 1500,
                    "moneda": "MXN",
                    "impuestos": [],
                    "activo": True,
                    "requiere_factura": False,
                    "clave_sat": None,
                    "unidad_sat": None,
                    "metadatos": {},
                    "maneja_inventario": False,
                    "unidad_inventario": "unidad",
                    "stock_minimo": None,
                    "stock_objetivo": None,
                    "costo_ultimo": None,
                    "costo_promedio": None,
                    "requiere_lote": False,
                    "requiere_serie": False,
                    "proveedor_principal_id": None,
                    "activo_compra": True,
                    "created_by": None,
                    "updated_by": None,
                    "creado_en": "2024-01-01T00:00:00Z",
                    "actualizado_en": "2024-01-01T00:00:00Z",
                    "linea_id": None,
                    "familia_id": None,
                    "modelo_id": None,
                },
            }
        ]
    )

    assert len(items) == 1
    assert items[0].descripcion == "Descripción breve"
    assert items[0].titulo == "Servicio demo"



@pytest.mark.asyncio
async def test_actualizar_status_propiedad_unidad_crea_movimiento(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    unidad_id = uuid.uuid4()
    oportunidad_id = uuid.uuid4()
    persona_id = uuid.uuid4()
    cuenta_id = uuid.uuid4()
    fake_repo.propiedad_unidades_by_id[str(unidad_id)] = {
        "id": str(unidad_id),
        "organizacion_id": str(uuid.uuid4()),
        "status": "disponible",
        "precio": 1200000,
        "oportunidad_id": str(oportunidad_id),
        "persona_id": str(persona_id),
        "cuenta_id": str(cuenta_id),
    }

    resp = await client.patch(
        f"/crm/propiedad-unidades/{unidad_id}/status",
        headers=_headers(),
        json={"status": "apartado", "oportunidad_id": str(oportunidad_id)},
    )

    assert resp.status_code == 200, resp.text
    assert fake_repo.updated_propiedad_unidades
    assert fake_repo.updated_propiedad_unidades[0]["payload"]["status"] == "apartado"
    assert fake_repo.updated_propiedad_unidades[0]["payload"]["oportunidad_id"] == str(oportunidad_id)
    assert fake_repo.created_propiedad_unidad_movimientos
    movimiento_payload = fake_repo.created_propiedad_unidad_movimientos[0]["payload"]
    assert movimiento_payload["estado_anterior"] == "disponible"
    assert movimiento_payload["estado_nuevo"] == "apartado"
    assert movimiento_payload["oportunidad_id"] == str(oportunidad_id)
    assert movimiento_payload["persona_id"] == str(persona_id)
    assert movimiento_payload["cuenta_id"] == str(cuenta_id)
    assert movimiento_payload["precio"] == 1200000


@pytest.mark.asyncio
async def test_actualizar_status_propiedad_unidad_requiere_oportunidad_en_flujo_comercial(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    unidad_id = uuid.uuid4()
    fake_repo.propiedad_unidades_by_id[str(unidad_id)] = {
        "id": str(unidad_id),
        "organizacion_id": str(uuid.uuid4()),
        "status": "disponible",
        "precio": 1200000,
        "oportunidad_id": None,
    }

    resp = await client.patch(
        f"/crm/propiedad-unidades/{unidad_id}/status",
        headers=_headers(),
        json={"status": "apartado"},
    )

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "opportunity_required_for_commercial_status"



@pytest.mark.asyncio
async def test_make_json_serializable_convierte_uuid_anidados() -> None:
    nested_uuid = uuid.uuid4()
    payload = {
        "id": nested_uuid,
        "metadata": {
            "principal": nested_uuid,
            "items": [nested_uuid, {"otro": nested_uuid}],
        },
    }

    sanitized = _make_json_serializable(payload)

    assert sanitized["id"] == str(nested_uuid)
    assert sanitized["metadata"]["principal"] == str(nested_uuid)
    assert sanitized["metadata"]["items"][0] == str(nested_uuid)
    assert sanitized["metadata"]["items"][1]["otro"] == str(nested_uuid)


def test_build_search_clause_splits_terms() -> None:
    clause = _build_search_clause(["titulo", "descripcion"], "juan empresa")

    assert clause is not None
    assert clause.startswith("and(")
    assert "juan" in clause
    assert "empresa" in clause


def test_matches_search_query_accepts_typo_tolerant_text() -> None:
    row = {
        "titulo": "Perico De los Palotes de Urbanizadora compartió sus datos básicos y pidió información",
        "descripcion": "Perico De los Palotes de Urbanizadora compartió sus datos básicos y pidió información",
        "contacto_nombre": "Perico De los Palotes",
        "metadata": {"project_name": "Perico De los Palotes de Urbanizadora compartió sus datos básicos y pidió información"},
    }

    assert _matches_search_query(row, "Perico")
    assert _matches_search_query(row, "Perico De los Palotes")
    assert _matches_search_query(row, "Palotesporqu")



@pytest.mark.asyncio
async def test_build_contact_write_parts_mueve_segmento_a_metadata() -> None:
    repo = object.__new__(CRMRepository)
    parts = CRMRepository._build_contact_write_parts(
        repo,
        organizacion_id=uuid.uuid4(),
        contact_id=uuid.uuid4(),
        payload={
            "nombre_completo": "Prospecto Demo",
            "correo": "demo@ejemplo.com",
            "telefono_e164": "+5215550000000",
            "company_name": "Empresa Demo",
            "segmento": "Servicios",
            "tipo_industria": "Arquitectura",
        },
    )

    account_body = parts["account_body"]
    assert account_body is not None
    assert "segmento" not in account_body
    assert account_body["metadata"]["segmento"] == "Servicios"



@pytest.mark.asyncio
async def test_bulk_delete_contacts_elimina_varios_registros(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    contact_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]

    resp = await client.post(
        "/crm/contacts/bulk-delete",
        headers=_headers(include_user_token=True),
        json={"ids": [str(value) for value in contact_ids]},
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["requested"] == 3
    assert payload["deleted"] == 3
    assert payload["failed"] == 0
    assert payload["deleted_ids"] == [str(value) for value in contact_ids]
    call_names = [name for name, _ in fake_repo.calls]
    assert call_names.count("delete_persona") == 3


@pytest.mark.asyncio
async def test_delete_account_denies_non_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.account_owner_id = uuid.uuid4()

    resp = await client.delete(
        f"/crm/cuentas/{uuid.uuid4()}",
        headers=_headers(),
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_account" for name, _ in fake_repo.calls)
    assert not any(name == "delete_account" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_delete_account_denies_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.account_owner_id = actor_user

    resp = await client.delete(
        f"/crm/cuentas/{uuid.uuid4()}",
        headers=_headers(),
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_account" for name, _ in fake_repo.calls)
    assert not any(name == "delete_account" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_delete_persona_denies_non_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = uuid.uuid4()

    resp = await client.delete(
        f"/crm/personas/{uuid.uuid4()}",
        headers=_headers(),
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert not any(name == "delete_persona" and kwargs.get("persona_id") for name, kwargs in fake_repo.calls)


@pytest.mark.asyncio
async def test_delete_persona_denies_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = actor_user

    resp = await client.delete(
        f"/crm/personas/{uuid.uuid4()}",
        headers=_headers(),
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert not any(name == "delete_persona" for name, _ in fake_repo.calls)



@pytest.mark.asyncio
async def test_update_account_allows_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    account_id = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.account_owner_id = actor_user

    resp = await client.patch(
        f"/crm/cuentas/{account_id}",
        headers=_headers(),
        json={"nombre": "Cuenta actualizada"},
    )

    assert resp.status_code == 200, resp.text
    assert any(name == "get_account" for name, _ in fake_repo.calls)
    assert any(name == "update_account" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_update_account_denies_non_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.account_owner_id = uuid.uuid4()

    resp = await client.patch(
        f"/crm/cuentas/{uuid.uuid4()}",
        headers=_headers(),
        json={"nombre": "Cuenta bloqueada"},
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_account" for name, _ in fake_repo.calls)
    assert not any(name == "update_account" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_update_persona_legacy_allows_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = actor_user

    resp = await client.patch(
        f"/crm/contacts/{uuid.uuid4()}",
        headers=_headers(),
        params={"skip_conversation_sync": "true"},
        json={"nombre_completo": "Contacto actualizado"},
    )

    assert resp.status_code == 200, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert any(name == "update_persona" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_update_persona_legacy_forwards_company_and_need(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = actor_user

    resp = await client.patch(
        f"/crm/contacts/{uuid.uuid4()}",
        headers=_headers(),
        params={"skip_conversation_sync": "true"},
        json={
            "nombre_completo": "Contacto actualizado",
            "company_name": "Demo SA",
            "necesidad_proposito": "Automatizar atención",
        },
    )

    assert resp.status_code == 200, resp.text
    update_kwargs = next(kwargs for name, kwargs in fake_repo.calls if name == "update_persona")
    assert update_kwargs["payload"]["company_name"] == "Demo SA"
    assert update_kwargs["payload"]["necesidad_proposito"] == "Automatizar atención"


@pytest.mark.asyncio
async def test_update_persona_legacy_denies_non_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = uuid.uuid4()

    resp = await client.patch(
        f"/crm/contacts/{uuid.uuid4()}",
        headers=_headers(),
        json={"nombre_completo": "Contacto bloqueado"},
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert not any(name == "update_persona" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_update_persona_edit_flow_allows_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    contact_id = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = actor_user

    resp = await client.patch(
        f"/crm/personas/{contact_id}",
        headers=_headers(),
        json={
            "persona": {
                "nombre": "Ana",
                "apellido_paterno": "Pérez",
                "nombre_completo": "Ana Pérez",
                "correo_principal": "ana@example.com",
                "telefono_principal_e164": "+5215550000001",
            },
            "contexto_comercial": {
                "modo": "solo_persona",
                "usar_cuenta_existente": False,
                "crear_cuenta_nueva": False,
                "es_persona_fisica_actividad_empresarial": False,
            },
        },
    )

    assert resp.status_code == 200, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert any(name == "update_persona" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_update_persona_edit_flow_does_not_reuse_suggested_contact_automatically(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor_user = uuid.uuid4()
    contact_id = uuid.uuid4()
    suggested_id = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = actor_user

    async def fake_dedupe_preview(**_: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]], uuid.UUID | None, uuid.UUID | None, bool]:
        return [], [], suggested_id, None, False

    monkeypatch.setattr(crm_routes, "_persona_alta_build_dedupe_preview", fake_dedupe_preview)

    resp = await client.patch(
        f"/crm/personas/{contact_id}",
        headers=_headers(),
        json={
            "persona": {
                "nombre": "Ana",
                "apellido_paterno": "Pérez",
                "nombre_completo": "Ana Pérez",
                "correo_principal": "ana@example.com",
                "telefono_principal_e164": "+5215550000001",
            },
            "contexto_comercial": {
                "modo": "solo_persona",
                "usar_cuenta_existente": False,
                "crear_cuenta_nueva": False,
                "es_persona_fisica_actividad_empresarial": False,
            },
        },
    )

    assert resp.status_code == 200, resp.text
    update_calls = [kwargs for name, kwargs in fake_repo.calls if name == "update_persona"]
    assert update_calls, "expected update_persona to be called"
    assert update_calls[-1]["persona_id"] == contact_id
    assert update_calls[-1]["persona_id"] != suggested_id


@pytest.mark.asyncio
async def test_update_persona_edit_flow_denies_non_owner_when_not_elevated(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    actor_user = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(actor_user),
        "organizacion_id": str(uuid.uuid4()),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["contacts.write"],
    }
    fake_repo.persona_owner_id = uuid.uuid4()

    resp = await client.patch(
        f"/crm/personas/{uuid.uuid4()}",
        headers=_headers(),
        json={
            "persona": {
                "nombre": "Ana",
                "apellido_paterno": "Pérez",
                "nombre_completo": "Ana Pérez",
                "correo_principal": "ana@example.com",
                "telefono_principal_e164": "+5215550000001",
            },
            "contexto_comercial": {
                "modo": "solo_persona",
                "usar_cuenta_existente": False,
                "crear_cuenta_nueva": False,
                "es_persona_fisica_actividad_empresarial": False,
            },
        },
    )

    assert resp.status_code == 403, resp.text
    assert any(name == "get_persona" for name, _ in fake_repo.calls)
    assert not any(name == "update_persona" for name, _ in fake_repo.calls)


@pytest.mark.asyncio
async def test_get_account_not_found(client: AsyncClient) -> None:
    headers = _headers()
    resp = await client.get(
        f"/crm/cuentas/{uuid.UUID(int=1)}",
        headers=headers,
    )
    assert resp.status_code == 404



@pytest.mark.asyncio
async def test_list_opportunities_uses_lightweight_repo_call(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        crm_routes,
        "_resolve_effective_timezone_name",
        AsyncMock(return_value=("UTC", "UTC")),
    )
    captured: dict[str, Any] = {}

    async def fake_list_opportunities(**kwargs: Any) -> list[dict[str, Any]]:
        captured.update(kwargs)
        return []

    fake_repo.list_opportunities = AsyncMock(side_effect=fake_list_opportunities)

    resp = await client.get(
        "/crm/oportunidades",
        headers=_headers(include_user_token=True),
        params={"limit": "20", "offset": "0"},
    )

    assert resp.status_code == 200
    assert captured["include_contact_rows"] is False


@pytest.mark.asyncio
async def test_list_sales_reps_scoped_to_organization(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    seller_id = uuid.uuid4()
    supervisor_id = uuid.uuid4()
    organizacion_id = uuid.uuid4()
    fake_repo.permission_context = {
        "usuario_id": str(supervisor_id),
        "organizacion_id": str(organizacion_id),
        "es_admin": False,
        "es_owner": False,
        "permisos": ["pipeline.reassign.team"],
    }
    fake_repo.current_user_has_perm = AsyncMock(side_effect=lambda codigo: codigo == "pipeline.reassign.team")
    fake_repo.list_supervised_sales_reps = AsyncMock(
        return_value=[
            {
                "id": str(seller_id),
                "nombre_completo": "Vendedor Demo",
                "correo": "vendedor@example.com",
                "telefono_e164": "+5215550000000",
            }
        ]
    )
    fake_repo.get_employee_vendor = AsyncMock(return_value={"usuario_id": str(supervisor_id), "es_vendedor": True})
    fake_repo.list_users = AsyncMock(return_value=[{"id": str(supervisor_id), "nombre_completo": "Supervisor Demo"}])
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda *args, **kwargs: fake_repo)

    resp = await client.get(
        "/crm/usuarios/vendedores",
        headers={
            **_headers(include_user_token=True),
            "X-Organizacion-Id": str(organizacion_id),
            "X-Usuario-Id": str(supervisor_id),
        },
        params={"limit": "50", "scope": "team"},
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload
    assert payload[0]["id"] == str(seller_id)

    supervised_kwargs = fake_repo.list_supervised_sales_reps.await_args.kwargs
    assert supervised_kwargs["organizacion_id"] == uuid.UUID(fake_repo.permission_context["organizacion_id"])
    assert supervised_kwargs["supervisor_id"] == supervisor_id

    employee_kwargs = fake_repo.get_employee_vendor.await_args.kwargs
    assert employee_kwargs["organizacion_id"] == uuid.UUID(fake_repo.permission_context["organizacion_id"])
    assert employee_kwargs["usuario_id"] == supervisor_id



@pytest.mark.asyncio
async def test_pipeline_board_filters_by_tablero(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    tablero_a = uuid.uuid4()
    tablero_b = uuid.uuid4()
    stage_a_id = uuid.uuid4()
    stage_b_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_a_id),
            "nombre": "Prospectos",
            "codigo": "prospectos",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {"tablero_id": str(tablero_a)},
        },
        {
            "id": str(stage_b_id),
            "nombre": "Calificados",
            "codigo": "calificados",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {"tablero_id": str(tablero_b)},
        },
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_a_id),
            "titulo": "Oportunidad A",
            "metadata": {"tablero_id": str(tablero_a)},
            "etapa": {
                "id": str(stage_a_id),
                "nombre": "Prospectos",
                "codigo": "prospectos",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {"tablero_id": str(tablero_a)},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Alice"},
        },
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_b_id),
            "titulo": "Oportunidad B",
            "metadata": {"tablero_id": str(tablero_b)},
            "etapa": {
                "id": str(stage_b_id),
                "nombre": "Calificados",
                "codigo": "calificados",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {"tablero_id": str(tablero_b)},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Bob"},
        },
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
        params={"tablero_id": str(tablero_a)},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload["stages"]) == 1
    stage = payload["stages"][0]
    assert stage["id"] == str(stage_a_id)
    assert stage["tarjetas"]
    assert all(card["etapa_id"] == str(stage_a_id) for card in stage["tarjetas"])
    assert all(card["metadata"]["tablero_id"] == str(tablero_a) for card in stage["tarjetas"])
    call_kwargs = next(kwargs for name, kwargs in fake_repo.calls if name == "list_pipeline_opportunities")
    assert call_kwargs["include_contact_rows"] is False
    assert call_kwargs["count_exact"] is False



@pytest.mark.asyncio
async def test_pipeline_board_uses_tablero_column(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    tablero_a = uuid.uuid4()
    tablero_b = uuid.uuid4()
    stage_a_id = uuid.uuid4()
    stage_b_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_a_id),
            "nombre": "Prospectos",
            "codigo": "prospectos",
            "categoria": "abierta",
            "orden": 1,
            "tablero_id": str(tablero_a),
            "metadata": {},
        },
        {
            "id": str(stage_b_id),
            "nombre": "Calificados",
            "codigo": "calificados",
            "categoria": "abierta",
            "orden": 1,
            "tablero_id": str(tablero_b),
            "metadata": {},
        },
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_a_id),
            "titulo": "Oportunidad A",
            "tablero_id": str(tablero_a),
            "metadata": {},
            "etapa": {
                "id": str(stage_a_id),
                "nombre": "Prospectos",
                "codigo": "prospectos",
                "categoria": "abierta",
                "orden": 1,
                "tablero_id": str(tablero_a),
                "metadata": {},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Alice"},
        },
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_b_id),
            "titulo": "Oportunidad B",
            "tablero_id": str(tablero_b),
            "metadata": {},
            "etapa": {
                "id": str(stage_b_id),
                "nombre": "Calificados",
                "codigo": "calificados",
                "categoria": "abierta",
                "orden": 1,
                "tablero_id": str(tablero_b),
                "metadata": {},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Bob"},
        },
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
        params={"tablero_id": str(tablero_a)},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert [stage["id"] for stage in payload["stages"]] == [str(stage_a_id)]
    assert payload["stages"][0]["tarjetas"]
    assert all(
        card["metadata"] == {} and card["etapa_id"] == str(stage_a_id)
        for card in payload["stages"][0]["tarjetas"]
    )



@pytest.mark.asyncio
async def test_pipeline_board_auto_selects_dominant_tablero(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    tablero_a = uuid.uuid4()
    tablero_b = uuid.uuid4()
    stage_a_id = uuid.uuid4()
    stage_b1_id = uuid.uuid4()
    stage_b2_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_a_id),
            "nombre": "Visitantes",
            "codigo": "visitantes",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {"tablero_id": str(tablero_a)},
        },
        {
            "id": str(stage_b1_id),
            "nombre": "Captado",
            "codigo": "captado",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {"tablero_id": str(tablero_b)},
        },
        {
            "id": str(stage_b2_id),
            "nombre": "Negociación",
            "codigo": "negociacion",
            "categoria": "abierta",
            "orden": 2,
            "metadata": {"tablero_id": str(tablero_b)},
        },
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_a_id),
            "titulo": "Lead sin chat",
            "metadata": {"tablero_id": str(tablero_a)},
            "etapa": {
                "id": str(stage_a_id),
                "nombre": "Visitantes",
                "codigo": "visitantes",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {"tablero_id": str(tablero_a)},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Ana"},
        },
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_b1_id),
            "titulo": "Lead captado",
            "metadata": {"tablero_id": str(tablero_b)},
            "etapa": {
                "id": str(stage_b1_id),
                "nombre": "Captado",
                "codigo": "captado",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {"tablero_id": str(tablero_b)},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Ben"},
        },
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_b2_id),
            "titulo": "Lead en negociación",
            "metadata": {"tablero_id": str(tablero_b)},
            "etapa": {
                "id": str(stage_b2_id),
                "nombre": "Negociación",
                "codigo": "negociacion",
                "categoria": "abierta",
                "orden": 2,
                "metadata": {"tablero_id": str(tablero_b)},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Cam"},
        },
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert [stage["id"] for stage in payload["stages"]] == [
        str(stage_b1_id),
        str(stage_b2_id),
    ]
    assert all(
        card["metadata"].get("tablero_id") == str(tablero_b)
        for stage in payload["stages"]
        for card in stage["tarjetas"]
    )



@pytest.mark.asyncio
async def test_pipeline_board_includes_channel_from_metadata(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    stage_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_id),
            "nombre": "Prospecto",
            "codigo": "prospecto",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {},
        }
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_id),
            "titulo": "Oportunidad con canal",
            "metadata": {"channel": "whatsapp"},
            "etapa": {
                "id": str(stage_id),
                "nombre": "Prospecto",
                "codigo": "prospecto",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Alice"},
        }
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["stages"][0]["tarjetas"][0]["canal"] == "whatsapp"


@pytest.mark.asyncio
async def test_pipeline_board_applies_day_window(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        crm_routes,
        "_resolve_effective_timezone_name",
        AsyncMock(return_value=("UTC", "UTC")),
    )
    stage_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_id),
            "nombre": "Prospecto",
            "codigo": "prospecto",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {},
        }
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_id),
            "titulo": "Oportunidad con fecha",
            "metadata": {},
            "etapa": {
                "id": str(stage_id),
                "nombre": "Prospecto",
                "codigo": "prospecto",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {},
            },
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Alice"},
        }
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
        params={"days": "15"},
    )

    assert resp.status_code == 200
    call_kwargs = next(kwargs for name, kwargs in fake_repo.calls if name == "list_pipeline_opportunities")
    assert call_kwargs["created_from"] is not None
    assert call_kwargs["include_contact_rows"] is False


@pytest.mark.asyncio
async def test_pipeline_board_forwards_email_filter(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    stage_id = uuid.uuid4()
    fake_repo.pipeline_stages = [
        {
            "id": str(stage_id),
            "nombre": "Prospecto",
            "codigo": "prospecto",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {},
        }
    ]
    fake_repo.pipeline_opportunities = [
        {
            "id": str(uuid.uuid4()),
            "etapa_id": str(stage_id),
            "titulo": "Oportunidad con correo",
            "contacto": {"id": str(uuid.uuid4()), "nombre_completo": "Alice", "correo_principal": "collejas1@gmail.com"},
            "etapa": {
                "id": str(stage_id),
                "nombre": "Prospecto",
                "codigo": "prospecto",
                "categoria": "abierta",
                "orden": 1,
                "metadata": {},
            },
        }
    ]

    resp = await client.get(
        "/crm/pipeline/board",
        headers=_headers(include_user_token=True),
        params={"correo": "collejas1@gmail.com"},
    )

    assert resp.status_code == 200
    call_kwargs = next(kwargs for name, kwargs in fake_repo.calls if name == "list_pipeline_opportunities")
    assert call_kwargs["correo"] == "collejas1@gmail.com"


def test_pipeline_card_prefers_persona_email_over_metadata_snapshot() -> None:
    stage_id = uuid.uuid4()
    row = {
        "id": str(uuid.uuid4()),
        "etapa_id": str(stage_id),
        "titulo": "Oportunidad con correo desfasado",
        "metadata": {
            "contacto_correo": "old@example.com",
        },
        "contacto": {
            "id": str(uuid.uuid4()),
            "nombre_completo": "Alice",
            "correo_principal": "new@example.com",
            "correo_institucional": None,
            "correo": None,
        },
        "etapa": {
            "id": str(stage_id),
            "nombre": "Prospecto",
            "codigo": "prospecto",
            "categoria": "abierta",
            "orden": 1,
            "metadata": {},
        },
    }

    card = crm_routes._card_from_opportunity(row)

    assert card is not None
    assert card.correo == "new@example.com"


@pytest.mark.asyncio
async def test_pipeline_scoring_kpis_forwards_email_filter(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        crm_routes,
        "_resolve_effective_timezone_name",
        AsyncMock(return_value=("UTC", "UTC")),
    )
    captured: dict[str, Any] = {}

    async def fake_list_scoring_events(**kwargs: Any) -> list[dict[str, Any]]:
        captured.update(kwargs)
        return []

    fake_repo.list_opportunity_scoring_events = AsyncMock(side_effect=fake_list_scoring_events)

    resp = await client.get(
        "/crm/pipeline/scoring/kpis",
        headers=_headers(include_user_token=True),
        params={"correo": "collejas1@gmail.com"},
    )

    assert resp.status_code == 200
    assert captured["correo"] == "collejas1@gmail.com"


@pytest.mark.asyncio
async def test_pipeline_scoring_kpis_supports_no_window(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        crm_routes,
        "_resolve_effective_timezone_name",
        AsyncMock(return_value=("UTC", "UTC")),
    )
    captured: dict[str, Any] = {}

    async def fake_list_scoring_events(**kwargs: Any) -> list[dict[str, Any]]:
        captured.update(kwargs)
        return []

    fake_repo.list_opportunity_scoring_events = AsyncMock(side_effect=fake_list_scoring_events)

    resp = await client.get(
        "/crm/pipeline/scoring/kpis",
        headers=_headers(include_user_token=True),
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["window_days"] == 0
    assert captured["created_from"] is None



@pytest.mark.asyncio
async def test_list_clientes(client: AsyncClient, fake_repo: DummyCRMRepository) -> None:
    resp = await client.get("/crm/clientes", headers=_headers())
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"]
    assert payload["limit"] == 50
    assert payload["offset"] == 0
    assert fake_repo.calls[-1][0] == "list_clientes"



@pytest.mark.asyncio
async def test_missing_org_header_returns_400(client: AsyncClient) -> None:
    resp = await client.get("/crm/cuentas")
    assert resp.status_code == 422  # FastAPI validation error for header



@pytest.mark.asyncio
async def test_list_agenda_bookings_returns_oportunidad_id(client: AsyncClient) -> None:
    resp = await client.get(
        "/crm/agenda/bookings",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"]
    assert payload["items"][0]["oportunidad_id"]



@pytest.mark.asyncio
async def test_create_agenda_booking_can_skip_opportunity_creation(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    async def fake_get_calendar_runtime_settings(**kwargs: Any) -> Any:
        captured["calendar_runtime"] = kwargs
        return type(
            "CalendarSettings",
            (),
            {"resource_id": "resource-1", "timezone": "UTC", "hold_minutes": 10},
        )()

    async def fake_create_zoom_meeting_for_booking_if_enabled(**kwargs: Any) -> tuple[str, str, dict[str, Any]]:
        captured["zoom"] = kwargs
        return "https://zoom.example/meet", "https://zoom.example/join", {}

    async def fake_hold_slot(**kwargs: Any) -> dict[str, Any]:
        captured["hold"] = kwargs
        return {
            "hold_id": str(uuid.uuid4()),
            "resource_id": kwargs["resource_id"],
            "slot_start": kwargs["slot_start"].isoformat(),
            "slot_end": kwargs["slot_start"].isoformat(),
            "expires_at": "2026-01-01T10:10:00Z",
        }

    async def fake_confirm_slot(**kwargs: Any) -> dict[str, Any]:
        captured["confirm"] = kwargs
        return {
            "booking_id": str(uuid.uuid4()),
            "resource_id": "resource-1",
            "start_at": "2026-01-01T10:00:00Z",
            "end_at": "2026-01-01T10:30:00Z",
            "timezone": "UTC",
            "status": "confirmed",
            "hold_id": kwargs["hold_id"],
            "notes": kwargs.get("notes"),
            "metadata": kwargs.get("metadata") or {"source": "test"},
            "tarjeta_id": None,
        }

    async def fake_send_booking_confirmation_email(
        *,
        booking: Any,
        persona_id: str | None,
        conversation_id: str | None,
        tarjeta_id: str | None,
        persona: dict[str, Any] | None,
    ) -> None:
        captured["email"] = {
            "booking": booking,
            "persona_id": persona_id,
            "conversation_id": conversation_id,
            "tarjeta_id": tarjeta_id,
            "persona": persona,
        }

    monkeypatch.setattr(
        crm_routes.tenant_runtime,
        "get_calendar_runtime_settings",
        fake_get_calendar_runtime_settings,
    )
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "create_zoom_meeting_for_booking_if_enabled",
        fake_create_zoom_meeting_for_booking_if_enabled,
    )
    monkeypatch.setattr(crm_routes.calendar_service, "hold_slot", fake_hold_slot)
    monkeypatch.setattr(crm_routes.calendar_service, "confirm_slot", fake_confirm_slot)
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_send_booking_confirmation_email",
        fake_send_booking_confirmation_email,
    )
    async def fake_sync_booking_with_opportunity(**kwargs: Any) -> None:
        captured["sync"] = kwargs

    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_sync_booking_with_opportunity",
        fake_sync_booking_with_opportunity,
    )

    resp = await client.post(
        "/crm/agenda/bookings",
        headers=_headers(include_user_token=True),
        json={
            "persona_id": str(uuid.uuid4()),
            "start_at": "2026-01-01T10:00:00Z",
            "crear_oportunidad": False,
            "modalidad": "virtual",
            "notes": "Demo sin oportunidad",
        },
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert captured["hold"]["conversation_id"] is None
    assert captured["hold"]["tarjeta_id"] is None
    assert captured["hold"]["metadata"]["modalidad"] == "virtual"
    assert captured["confirm"]["metadata"]["crear_oportunidad"] is False
    assert captured["confirm"]["metadata"]["modalidad"] == "virtual"
    assert not any(call_name == "create_conversation" for call_name, _ in fake_repo.calls)
    assert not any(call_name == "schedule_calendar_booking" for call_name, _ in fake_repo.calls)



@pytest.mark.asyncio
async def test_create_agenda_booking_without_opportunity_uses_direct_calendar_flow(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    async def fake_get_calendar_runtime_settings(**kwargs: Any) -> Any:
        captured["calendar_runtime"] = kwargs
        return type(
            "CalendarSettings",
            (),
            {"resource_id": "resource-2", "timezone": "UTC", "hold_minutes": 10},
        )()

    async def fake_create_zoom_meeting_for_booking_if_enabled(**kwargs: Any) -> tuple[str, str, dict[str, Any]]:
        captured["zoom"] = kwargs
        return "https://zoom.example/meet", "https://zoom.example/join", {}

    async def fake_hold_slot(**kwargs: Any) -> dict[str, Any]:
        captured["hold"] = kwargs
        return {
            "hold_id": str(uuid.uuid4()),
            "resource_id": kwargs["resource_id"],
            "slot_start": kwargs["slot_start"].isoformat(),
            "slot_end": kwargs["slot_start"].isoformat(),
            "expires_at": "2026-01-01T10:10:00Z",
        }

    async def fake_confirm_slot(**kwargs: Any) -> dict[str, Any]:
        captured["confirm"] = kwargs
        return {
            "booking_id": str(uuid.uuid4()),
            "resource_id": "resource-2",
            "start_at": "2026-01-01T10:00:00Z",
            "end_at": "2026-01-01T10:30:00Z",
            "timezone": "UTC",
            "status": "confirmed",
            "hold_id": kwargs["hold_id"],
            "notes": kwargs.get("notes"),
            "metadata": kwargs.get("metadata") or {"source": "test"},
            "tarjeta_id": None,
        }

    async def fake_send_booking_confirmation_email(**kwargs: Any) -> None:
        captured["email"] = kwargs

    monkeypatch.setattr(
        crm_routes.tenant_runtime,
        "get_calendar_runtime_settings",
        fake_get_calendar_runtime_settings,
    )
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "create_zoom_meeting_for_booking_if_enabled",
        fake_create_zoom_meeting_for_booking_if_enabled,
    )
    monkeypatch.setattr(crm_routes.calendar_service, "hold_slot", fake_hold_slot)
    monkeypatch.setattr(crm_routes.calendar_service, "confirm_slot", fake_confirm_slot)
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_send_booking_confirmation_email",
        fake_send_booking_confirmation_email,
    )
    async def fake_sync_booking_with_opportunity(**kwargs: Any) -> None:
        captured["sync"] = kwargs

    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_sync_booking_with_opportunity",
        fake_sync_booking_with_opportunity,
    )

    resp = await client.post(
        "/crm/agenda/bookings",
        headers=_headers(include_user_token=True),
        json={
            "persona_id": str(uuid.uuid4()),
            "start_at": "2026-01-01T10:00:00Z",
            "crear_oportunidad": False,
            "modalidad": "presencial",
            "notes": "Demo sin oportunidad",
        },
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert captured["hold"]["conversation_id"] is None
    assert captured["hold"]["metadata"]["modalidad"] == "presencial"
    assert captured["confirm"]["metadata"]["source"] == "panel_agenda"
    assert captured["confirm"]["metadata"]["modalidad"] == "presencial"
    assert "zoom" not in captured
    assert captured["email"]["conversation_id"] is None
    assert not any(call_name == "create_conversation" for call_name, _ in fake_repo.calls)
    assert not any(call_name == "schedule_calendar_booking" for call_name, _ in fake_repo.calls)



@pytest.mark.asyncio
async def test_create_agenda_booking_can_be_created_without_contact(
    client: AsyncClient, fake_repo: DummyCRMRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    async def fake_get_calendar_runtime_settings(**kwargs: Any) -> Any:
        captured["calendar_runtime"] = kwargs
        return type(
            "CalendarSettings",
            (),
            {"resource_id": "resource-3", "timezone": "UTC", "hold_minutes": 10},
        )()

    async def fake_create_zoom_meeting_for_booking_if_enabled(**kwargs: Any) -> tuple[str, str, dict[str, Any]]:
        captured["zoom"] = kwargs
        return "https://zoom.example/meet", "https://zoom.example/join", {}

    async def fake_hold_slot(**kwargs: Any) -> dict[str, Any]:
        captured["hold"] = kwargs
        return {
            "hold_id": str(uuid.uuid4()),
            "resource_id": kwargs["resource_id"],
            "slot_start": kwargs["slot_start"].isoformat(),
            "slot_end": kwargs["slot_start"].isoformat(),
            "expires_at": "2026-01-01T10:10:00Z",
        }

    async def fake_confirm_slot(**kwargs: Any) -> dict[str, Any]:
        captured["confirm"] = kwargs
        return {
            "booking_id": str(uuid.uuid4()),
            "resource_id": "resource-3",
            "start_at": "2026-01-01T10:00:00Z",
            "end_at": "2026-01-01T10:30:00Z",
            "timezone": "UTC",
            "status": "confirmed",
            "hold_id": kwargs["hold_id"],
            "notes": kwargs.get("notes"),
            "metadata": kwargs.get("metadata") or {"source": "test"},
            "tarjeta_id": None,
        }

    async def fake_send_booking_confirmation_email(**kwargs: Any) -> None:
        captured["email"] = kwargs

    async def fake_sync_booking_with_opportunity(**kwargs: Any) -> None:
        captured["sync"] = kwargs

    monkeypatch.setattr(
        crm_routes.tenant_runtime,
        "get_calendar_runtime_settings",
        fake_get_calendar_runtime_settings,
    )
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "create_zoom_meeting_for_booking_if_enabled",
        fake_create_zoom_meeting_for_booking_if_enabled,
    )
    monkeypatch.setattr(crm_routes.calendar_service, "hold_slot", fake_hold_slot)
    monkeypatch.setattr(crm_routes.calendar_service, "confirm_slot", fake_confirm_slot)
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_send_booking_confirmation_email",
        fake_send_booking_confirmation_email,
    )
    monkeypatch.setattr(
        crm_routes.webchat_service,
        "_sync_booking_with_opportunity",
        fake_sync_booking_with_opportunity,
    )

    resp = await client.post(
        "/crm/agenda/bookings",
        headers=_headers(include_user_token=True),
        json={
            "sin_contacto": True,
            "start_at": "2026-01-01T10:00:00Z",
            "asunto": "Bloqueo personal",
            "modalidad": "presencial",
            "notes": "Bloqueo manual",
        },
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert captured["hold"]["contact_id"] is None
    assert captured["hold"]["conversation_id"] is None
    assert captured["hold"]["metadata"]["asunto"] == "Bloqueo personal"
    assert captured["hold"]["metadata"]["sin_contacto"] is True
    assert captured["confirm"]["metadata"]["asunto"] == "Bloqueo personal"
    assert captured["confirm"]["metadata"]["sin_contacto"] is True
    assert "zoom" not in captured
    assert "email" not in captured
    assert "sync" not in captured
    assert not any(call_name == "get_persona_by_id" for call_name, _ in fake_repo.calls)



@pytest.mark.asyncio
async def test_visits_detail_maps_oportunidad_id(client: AsyncClient) -> None:
    resp = await client.get(
        "/crm/visitas/detalle",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert isinstance(payload, list)
    assert payload[0]["oportunidad_id"]



@pytest.mark.asyncio
async def test_list_activities(client: AsyncClient) -> None:
    resp = await client.get("/crm/actividades", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["items"]



@pytest.mark.asyncio
async def test_create_activity(client: AsyncClient) -> None:
    body = {"tipo": "llamada", "asunto": "Seguimiento"}
    resp = await client.post("/crm/actividades", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["tipo"] == "llamada"



@pytest.mark.asyncio
async def test_get_activity_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/crm/actividades/{uuid.UUID(int=1)}", headers=_headers())
    assert resp.status_code == 404



@pytest.mark.asyncio
async def test_list_tickets(client: AsyncClient) -> None:
    resp = await client.get("/crm/tickets", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["items"]



@pytest.mark.asyncio
async def test_create_ticket(client: AsyncClient) -> None:
    resp = await client.post("/crm/tickets", headers=_headers(), json={"asunto": "Incidencia"})
    assert resp.status_code == 201
    assert resp.json()["asunto"] == "Incidencia"



@pytest.mark.asyncio
async def test_get_ticket_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/crm/tickets/{uuid.UUID(int=1)}", headers=_headers())
    assert resp.status_code == 404



@pytest.mark.asyncio
async def test_list_ticket_comments(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    resp = await client.get(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["ticket_id"] == str(ticket_id)



@pytest.mark.asyncio
async def test_create_ticket_comment(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    body = {"ticket_id": str(ticket_id), "mensaje": "Seguimiento"}
    resp = await client.post(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["mensaje"] == "Seguimiento"



@pytest.mark.asyncio
async def test_create_ticket_comment_mismatch(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    other_id = uuid.uuid4()
    body = {"ticket_id": str(other_id), "mensaje": "Error"}
    resp = await client.post(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers(), json=body)
    assert resp.status_code == 400



@pytest.mark.asyncio
async def test_get_contacto_batch_summary(client: AsyncClient) -> None:
    batch_id = uuid.uuid4()
    resp = await client.get(
        f"/crm/prospeccion/contacto/batches/{batch_id}",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["batch"]["id"] == str(batch_id)
    assert data["totales"]["pendiente"] == 1



@pytest.mark.asyncio
async def test_get_contacto_batch_summary_not_found(client: AsyncClient) -> None:
    resp = await client.get(
        f"/crm/prospeccion/contacto/batches/{uuid.UUID(int=0)}",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 404



@pytest.mark.asyncio
async def test_reintentar_contacto_envio(
    client: AsyncClient, fake_repo: DummyCRMRepository
) -> None:
    envio_id = uuid.uuid4()
    resp = await client.post(
        f"/crm/prospeccion/contacto/envios/{envio_id}/reintentar",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["envio"]["estado"] == "pendiente"
    assert fake_repo.calls[-1][0] == "insert_prospecto_logs"



@pytest.mark.asyncio
async def test_reintentar_contacto_envio_not_found(client: AsyncClient) -> None:
    resp = await client.post(
        f"/crm/prospeccion/contacto/envios/{uuid.UUID(int=0)}/reintentar",
        headers=_headers(include_user_token=True),
    )
    assert resp.status_code == 404



@pytest.mark.asyncio
async def test_list_files(client: AsyncClient) -> None:
    resp = await client.get("/crm/archivos", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()



@pytest.mark.asyncio
async def test_create_file(client: AsyncClient) -> None:
    body = {
        "relacion_tipo": "oportunidad",
        "relacion_id": str(uuid.uuid4()),
        "nombre_original": "doc.pdf",
        "storage_path": "files/doc.pdf",
    }
    resp = await client.post("/crm/archivos", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["nombre_original"] == "doc.pdf"



@pytest.mark.asyncio
async def test_list_tags(client: AsyncClient) -> None:
    resp = await client.get("/crm/tags", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["nombre"] == "VIP"



@pytest.mark.asyncio
async def test_create_tag(client: AsyncClient) -> None:
    resp = await client.post("/crm/tags", headers=_headers(), json={"nombre": "Nuevo"})
    assert resp.status_code == 201
    assert resp.json()["nombre"] == "Nuevo"



@pytest.mark.asyncio
async def test_create_and_delete_tagging(client: AsyncClient) -> None:
    tag_id = uuid.uuid4()
    relacion_id = uuid.uuid4()
    resp = await client.post(
        "/crm/taggings",
        headers=_headers(),
        json={
            "tag_id": str(tag_id),
            "relacion_tipo": "oportunidad",
            "relacion_id": str(relacion_id),
        },
    )
    assert resp.status_code == 201
    tagging_id = resp.json()["id"]
    del_resp = await client.delete(f"/crm/taggings/{tagging_id}", headers=_headers())
    assert del_resp.status_code == 204



@pytest.mark.asyncio
async def test_list_products(client: AsyncClient) -> None:
    resp = await client.get("/crm/productos", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["codigo"] == "SKU-1"



@pytest.mark.asyncio
async def test_create_product(client: AsyncClient) -> None:
    resp = await client.post(
        "/crm/productos",
        headers=_headers(),
        json={"codigo": "SKU-2", "nombre": "Nuevo"},
    )
    assert resp.status_code == 201
    assert resp.json()["codigo"] == "SKU-2"



@pytest.mark.asyncio
async def test_list_quotes(client: AsyncClient) -> None:
    resp = await client.get("/crm/cotizaciones", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()



@pytest.mark.asyncio
async def test_create_quote(client: AsyncClient) -> None:
    resp = await client.post("/crm/cotizaciones", headers=_headers(), json={})
    assert resp.status_code == 201
    assert resp.json()["estatus"] == "borrador"



@pytest.mark.asyncio
async def test_list_quote_items(client: AsyncClient) -> None:
    cotizacion_id = uuid.uuid4()
    resp = await client.get(
        f"/crm/cotizaciones/{cotizacion_id}/items",
        headers=_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()[0]["cotizacion_id"] == str(cotizacion_id)



@pytest.mark.asyncio
async def test_create_quote_item(client: AsyncClient) -> None:
    cotizacion_id = uuid.uuid4()
    body = {
        "cotizacion_id": str(cotizacion_id),
        "descripcion": "Servicio",
        "cantidad": 2,
    }
    resp = await client.post(
        f"/crm/cotizaciones/{cotizacion_id}/items",
        headers=_headers(),
        json=body,
    )
    assert resp.status_code == 201
    assert resp.json()["descripcion"] == "Servicio"



@pytest.mark.asyncio
async def test_create_quote_item_mismatch(client: AsyncClient) -> None:
    cotizacion_id = uuid.uuid4()
    resp = await client.post(
        f"/crm/cotizaciones/{cotizacion_id}/items",
        headers=_headers(),
        json={
            "cotizacion_id": str(uuid.uuid4()),
            "descripcion": "Bad",
        },
    )
    assert resp.status_code == 400



@pytest.mark.asyncio
async def test_list_campaigns(client: AsyncClient) -> None:
    resp = await client.get("/crm/campanas", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["nombre"] == "Campaña"



@pytest.mark.asyncio
async def test_create_campaign(client: AsyncClient) -> None:
    resp = await client.post("/crm/campanas", headers=_headers(), json={"nombre": "Nueva"})
    assert resp.status_code == 201
    assert resp.json()["nombre"] == "Nueva"



@pytest.mark.asyncio
async def test_list_leads(client: AsyncClient) -> None:
    resp = await client.get("/crm/leads", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()



@pytest.mark.asyncio
async def test_create_lead(client: AsyncClient) -> None:
    resp = await client.post("/crm/leads", headers=_headers(), json={"origen": "ads"})
    assert resp.status_code == 201
    assert resp.json()["origen"] == "ads"



@pytest.mark.asyncio
async def test_list_lead_events(client: AsyncClient) -> None:
    lead_id = uuid.uuid4()
    resp = await client.get(f"/crm/leads/{lead_id}/eventos", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["lead_id"] == str(lead_id)



@pytest.mark.asyncio
async def test_create_lead_event(client: AsyncClient) -> None:
    lead_id = uuid.uuid4()
    body = {"lead_id": str(lead_id), "tipo": "click"}
    resp = await client.post(f"/crm/leads/{lead_id}/eventos", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["tipo"] == "click"



@pytest.mark.asyncio
async def test_create_lead_event_mismatch(client: AsyncClient) -> None:
    lead_id = uuid.uuid4()
    body = {"lead_id": str(uuid.uuid4()), "tipo": "click"}
    resp = await client.post(f"/crm/leads/{lead_id}/eventos", headers=_headers(), json=body)
    assert resp.status_code == 400



@pytest.mark.asyncio
async def test_list_notes(client: AsyncClient) -> None:
    resp = await client.get("/crm/notas", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()



@pytest.mark.asyncio
async def test_list_notes_by_activity(client: AsyncClient) -> None:
    activity_id = uuid.uuid4()
    resp = await client.get(f"/crm/notas?actividad_id={activity_id}", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["actividad_id"] == str(activity_id)



@pytest.mark.asyncio
async def test_create_note(client: AsyncClient) -> None:
    body = {
        "relacion_tipo": "oportunidad",
        "relacion_id": str(uuid.uuid4()),
        "texto": "Seguimiento interno",
    }
    resp = await client.post("/crm/notas", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["texto"] == "Seguimiento interno"



@pytest.mark.asyncio
async def test_create_note_with_activity_id(client: AsyncClient) -> None:
    activity_id = uuid.uuid4()
    body = {
        "relacion_tipo": "oportunidad",
        "relacion_id": str(uuid.uuid4()),
        "actividad_id": str(activity_id),
        "texto": "Seguimiento ligado a actividad",
    }
    resp = await client.post("/crm/notas", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["actividad_id"] == str(activity_id)



@pytest.mark.asyncio
async def test_update_activity(client: AsyncClient) -> None:
    activity_id = uuid.uuid4()
    body = {
        "asunto": "Nuevo seguimiento",
        "prioridad": "alta",
    }
    resp = await client.patch(f"/crm/actividades/{activity_id}", headers=_headers(), json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["asunto"] == "Nuevo seguimiento"
    assert data["prioridad"] == "alta"



@pytest.mark.asyncio
async def test_complete_activity(client: AsyncClient) -> None:
    activity_id = uuid.uuid4()
    resp = await client.post(f"/crm/actividades/{activity_id}/completar", headers=_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["estado"] == "completada"
    assert data["completado_en"] is not None



@pytest.mark.asyncio
async def test_cancel_activity(client: AsyncClient) -> None:
    activity_id = uuid.uuid4()
    resp = await client.post(f"/crm/actividades/{activity_id}/cancelar", headers=_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["estado"] == "cancelada"
    assert data["cancelado_en"] is not None



@pytest.mark.asyncio
async def test_list_audit_logs(client: AsyncClient) -> None:
    resp = await client.get("/crm/audit_logs", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()



@pytest.mark.asyncio
async def test_contactar_prospectos_allows_300_ids() -> None:
    prospecto_ids = [str(uuid.uuid4()) for _ in range(300)]

    payload = crm_routes.ProspectoContactarPayload.model_validate({"prospecto_ids": prospecto_ids})

    assert len(payload.prospecto_ids or []) == 300

    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoContactarPayload.model_validate({"prospecto_ids": prospecto_ids + [str(uuid.uuid4())]})

@pytest.mark.asyncio
async def test_prospect_lookup_batches_allow_300_ids() -> None:
    prospecto_ids = [str(uuid.uuid4()) for _ in range(300)]
    over_limit_ids = prospecto_ids + [str(uuid.uuid4())]

    phone_payload = crm_routes.ProspectoLookupPayload.model_validate({"prospecto_ids": prospecto_ids})
    email_payload = crm_routes.ProspectoEmailLookupPayload.model_validate({"prospecto_ids": prospecto_ids})
    website_payload = crm_routes.ProspectoWebsiteLookupPayload.model_validate({"prospecto_ids": prospecto_ids})

    assert len(phone_payload.prospecto_ids) == 300
    assert len(email_payload.prospecto_ids) == 300
    assert len(website_payload.prospecto_ids) == 300

    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoLookupPayload.model_validate({"prospecto_ids": over_limit_ids})
    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoEmailLookupPayload.model_validate({"prospecto_ids": over_limit_ids})
    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoWebsiteLookupPayload.model_validate({"prospecto_ids": over_limit_ids})


@pytest.mark.asyncio
async def test_prospect_full_lookup_and_checklist_batches_allow_300_ids() -> None:
    prospecto_ids = [str(uuid.uuid4()) for _ in range(300)]
    over_limit_ids = prospecto_ids + [str(uuid.uuid4())]

    full_payload = crm_routes.ProspectoFullLookupPayload.model_validate({"prospecto_ids": prospecto_ids})
    checklist_lookup = crm_routes.ProspectoChecklistLookupPayload.model_validate({"limit": 300})
    scraper_payload = crm_routes.ProspectoChecklistScraperPayload.model_validate({"prospecto_ids": prospecto_ids, "limit": 300})

    assert len(full_payload.prospecto_ids) == 300
    assert checklist_lookup.limit == 300
    assert scraper_payload.limit == 300
    assert len(scraper_payload.prospecto_ids or []) == 300

    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoFullLookupPayload.model_validate({"prospecto_ids": over_limit_ids})
    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoChecklistLookupPayload.model_validate({"limit": 301})
    with pytest.raises(crm_routes.ValidationError):
        crm_routes.ProspectoChecklistScraperPayload.model_validate({"prospecto_ids": over_limit_ids, "limit": 300})
