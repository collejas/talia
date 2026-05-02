import uuid
from typing import Any, AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes import crm as crm_routes
from app.repositories.crm import CRMRepository


class DummyCRMRepository(CRMRepository):
    """Repo falso que permite inyectar respuestas predecibles."""

    def __init__(self) -> None:  # pragma: no cover - simple init
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.pipeline_stages: list[dict[str, Any]] = []
        self.pipeline_opportunities: list[dict[str, Any]] = []
        self.dashboard_kpis: dict[str, Any] = {"webchat": {"visitas_sin_chat": 0}}
        self.next_sales_rep: uuid.UUID | None = None
        self.contactables_by_ids_result: list[dict[str, Any]] = []
        self.existing_prospectos_by_emails_result: list[dict[str, Any]] = []
        self.existing_prospectos_by_phones_result: list[dict[str, Any]] = []
        self.last_upserted_prospectos: list[dict[str, Any]] = []

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
            "propietario_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

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
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

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
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "moneda": kwargs["payload"].get("moneda", "MXN"),
            "activo": kwargs["payload"].get("activo", True),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

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

    async def refresh_prospeccion_query_daily_mv(self, **kwargs: Any) -> None:
        self.calls.append(("refresh_prospeccion_query_daily_mv", kwargs))


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
async def test_create_account(client: AsyncClient) -> None:
    body = {"nombre": "Nueva Cuenta", "tipo": "cliente"}
    resp = await client.post("/crm/cuentas", headers=_headers(), json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Nueva Cuenta"
    assert data["tipo"] == "cliente"


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
    assert data["total"] == 2
    assert len(data["prospectos"]) == 2
    assert len(fake_repo.last_upserted_prospectos) == 2
    assert any(item.get("phone_e164") for item in fake_repo.last_upserted_prospectos)
    assert any(item.get("phone") == "55 3333 4444" for item in fake_repo.last_upserted_prospectos)


@pytest.mark.asyncio
async def test_get_account_not_found(client: AsyncClient) -> None:
    headers = _headers()
    resp = await client.get(
        f"/crm/cuentas/{uuid.UUID(int=1)}",
        headers=headers,
    )
    assert resp.status_code == 404


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
async def test_list_audit_logs(client: AsyncClient) -> None:
    resp = await client.get("/crm/audit_logs", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()
