import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes import crm as crm_routes
from app.repositories.crm import CRMRepository


class InMemoryPipelineRepository(CRMRepository):
    def __init__(self) -> None:  # pragma: no cover - helper for tests
        self.stage_catalog = {
            "captado": self._stage("captado", "Captado", "abierta", 1),
            "demo": self._stage("demo", "Demo agendada", "abierta", 2),
            "cerrado_ganado": self._stage("cerrado_ganado", "Cerrado ganado", "ganada", 99),
        }
        self.opportunities: dict[str, dict[str, Any]] = {}
        self.stage_history: list[dict[str, Any]] = []
        self.notes: dict[str, dict[str, Any]] = {}
        self.quotes: dict[str, dict[str, Any]] = {}
        self.clients: dict[str, dict[str, Any]] = {}
        self.assigned_reps: list[uuid.UUID] = []

    async def create_account(
        self,
        *,
        organizacion_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        account_id = uuid.uuid4()
        return {
            "id": str(account_id),
            "organizacion_id": str(organizacion_id),
            **payload,
            "creado_en": datetime.now(timezone.utc).isoformat(),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }

    async def assign_next_sales_rep(self, **kwargs: Any) -> dict[str, Any] | None:
        rep_id = uuid.uuid4()
        self.assigned_reps.append(rep_id)
        return {
            "usuario_id": rep_id,
            "nombre": "Pipeline Seller",
            "correo": "seller@pipeline.test",
            "telefono_e164": "+521000000000",
        }

    def _stage(self, codigo: str, nombre: str, categoria: str, orden: int) -> dict[str, Any]:
        return {
            "id": uuid.uuid4(),
            "nombre": nombre,
            "codigo": codigo,
            "categoria": categoria,
            "orden": orden,
            "metadata": {"tablero_id": str(uuid.uuid4())},
        }

    def _stage_by_id(self, stage_id: str | uuid.UUID | None) -> dict[str, Any]:
        if stage_id is None:
            return self.stage_catalog["captado"]
        for stage in self.stage_catalog.values():
            if str(stage["id"]) == str(stage_id):
                return stage
        return {
            "id": stage_id,
            "nombre": "Etapa",
            "codigo": "custom",
            "categoria": "abierta",
            "orden": 50,
            "metadata": {},
        }

    def _build_opportunity_row(
        self,
        *,
        oportunidad_id: uuid.UUID,
        organizacion_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        stage_id = payload.get("etapa_id") or self.stage_catalog["captado"]["id"]
        stage = self._stage_by_id(stage_id)
        metadata = dict(payload.get("metadata") or {})
        contacto_id = payload.get("contacto_principal_id") or uuid.uuid4()
        contact = {
            "id": str(contacto_id),
            "nombre_completo": "Contacto Demo",
            "correo": "demo@example.com",
            "telefono_e164": "+521111111111",
            "company_name": payload.get("company_name") or "Empresa Demo",
            "notes": metadata.get("contact_notes"),
            "necesidad_proposito": metadata.get("necesidad"),
        }
        return {
            "id": str(oportunidad_id),
            "organizacion_id": str(organizacion_id),
            "etapa_id": str(stage["id"]),
            "etapa": stage,
            "titulo": payload.get("titulo") or "Oportunidad demo",
            "contacto_nombre": payload.get("contacto_nombre") or "Contacto Demo",
            "canal": (payload.get("canal") or "webchat"),
            "restart_sequence": payload.get("restart_sequence") or 1,
            "descripcion": payload.get("descripcion"),
            "monto_estimado": payload.get("monto_estimado"),
            "moneda": payload.get("moneda") or "MXN",
            "probabilidad": payload.get("probabilidad"),
            "metadata": metadata,
            "contacto": contact,
            "cuenta": {"id": payload.get("cuenta_id"), "nombre": "Cuenta Demo"},
            "asignado": {
                "nombre_completo": "Owner Demo",
                "correo": "owner@example.com",
            },
            "creado_en": datetime.now(timezone.utc).isoformat(),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }

    async def create_opportunity(
        self,
        *,
        organizacion_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        oportunidad_id = uuid.uuid4()
        row = self._build_opportunity_row(
            oportunidad_id=oportunidad_id,
            organizacion_id=organizacion_id,
            payload=payload,
        )
        self.opportunities[str(oportunidad_id)] = row
        return row

    async def get_pipeline_opportunity(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
    ) -> dict[str, Any] | None:
        return self.opportunities.get(str(oportunidad_id))

    async def update_opportunity(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        row = self.opportunities[str(oportunidad_id)]
        if "etapa_id" in payload:
            stage = self._stage_by_id(payload["etapa_id"])
            row["etapa_id"] = str(stage["id"])
            row["etapa"] = stage
        if "metadata" in payload:
            metadata = dict(row.get("metadata") or {})
            metadata.update(payload["metadata"])
            row["metadata"] = metadata
        if "canal" in payload:
            row["canal"] = payload["canal"]
        if "contacto_nombre" in payload:
            row["contacto_nombre"] = payload["contacto_nombre"]
        if "restart_sequence" in payload:
            row["restart_sequence"] = payload["restart_sequence"]
        for key in (
            "titulo",
            "descripcion",
            "monto_estimado",
            "moneda",
            "probabilidad",
        ):
            if key in payload:
                row[key] = payload[key]
        row["actualizado_en"] = datetime.now(timezone.utc).isoformat()
        return row

    async def append_stage_history(
        self,
        *,
        organizacion_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        entry = {
            "id": str(uuid.uuid4()),
            "oportunidad_id": payload.get("oportunidad_id"),
            "etapa_origen_id": payload.get("etapa_origen_id"),
            "etapa_destino_id": payload.get("etapa_destino_id"),
            "metadata": payload.get("metadata") or {},
            "cambiado_en": datetime.now(timezone.utc).isoformat(),
            "cambiado_por_usuario_id": payload.get("cambiado_por_usuario_id"),
            "fuente": payload.get("fuente"),
            "motivo": payload.get("motivo"),
        }
        self.stage_history.append(entry)
        return entry

    async def list_opportunity_stage_history(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        entries = [
            entry for entry in self.stage_history if entry["oportunidad_id"] == str(oportunidad_id)
        ]
        for (opp_id, _), entry in self.notes.items():
            if opp_id == str(oportunidad_id):
                entries.append(entry)
        return entries[offset : offset + limit]

    async def append_note_history(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        etapa_id: uuid.UUID,
        usuario_id: uuid.UUID | None,
        texto: str,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        entry_id = str(uuid.uuid4())
        entry = {
            "id": entry_id,
            "oportunidad_id": str(oportunidad_id),
            "etapa_destino_id": str(etapa_id),
            "cambiado_en": datetime.now(timezone.utc).isoformat(),
            "cambiado_por_usuario_id": str(usuario_id) if usuario_id else None,
            "metadata": {"nota": texto, **metadata},
            "tipo": "nota",
        }
        self.notes[(str(oportunidad_id), entry_id)] = entry
        return entry

    async def get_opportunity_history_entry(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        history_id: uuid.UUID,
    ) -> dict[str, Any] | None:
        return self.notes.get((str(oportunidad_id), str(history_id)))

    async def delete_opportunity(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
    ) -> None:
        self.opportunities.pop(str(oportunidad_id), None)

    async def list_quote_entries(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
    ) -> list[dict[str, Any]]:
        return [
            quote
            for quote in self.quotes.values()
            if quote.get("oportunidad_id") == str(oportunidad_id)
        ]

    async def create_quote_entry(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        cuenta_id: uuid.UUID | None,
        contacto_id: uuid.UUID | None,
        estatus: str,
        total: float | None,
        moneda: str,
        valida_hasta: str | None,
        metadata: dict[str, Any],
        items: list[dict[str, Any]],
        usuario_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        quote_id = uuid.uuid4()
        normalized_items: list[dict[str, Any]] = []
        for item in items:
            normalized = dict(item)
            normalized.setdefault("id", str(uuid.uuid4()))
            normalized["cotizacion_id"] = str(quote_id)
            normalized.setdefault("creado_en", datetime.now(timezone.utc).isoformat())
            normalized.setdefault("actualizado_en", datetime.now(timezone.utc).isoformat())
            normalized_items.append(normalized)
        row = {
            "id": str(quote_id),
            "oportunidad_id": str(oportunidad_id),
            "estatus": estatus,
            "total": total,
            "moneda": moneda,
            "valida_hasta": valida_hasta,
            "metadata": metadata,
            "items": normalized_items,
            "creado_en": datetime.now(timezone.utc).isoformat(),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        }
        self.quotes[str(quote_id)] = row
        return row

    async def mark_quote_entry(
        self,
        *,
        organizacion_id: uuid.UUID,
        quote_id: uuid.UUID,
        estatus: str | None = None,
        metadata_patch: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        quote = self.quotes[str(quote_id)]
        if estatus:
            quote["estatus"] = estatus
        if metadata_patch:
            existing = dict(quote.get("metadata") or {})
            existing.update(metadata_patch)
            quote["metadata"] = existing
        quote["actualizado_en"] = datetime.now(timezone.utc).isoformat()
        return quote

    async def get_opportunity_with_contact(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
    ) -> dict[str, Any] | None:
        return self.opportunities.get(str(oportunidad_id))

    async def get_stage_by_code(
        self,
        *,
        organizacion_id: uuid.UUID,
        codigo: str,
    ) -> dict[str, Any] | None:
        normalized = (codigo or "").strip().lower()
        return self.stage_catalog.get(normalized)

    async def convert_oportunidad_en_cliente(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        usuario_token: str | None = None,
        forzar: bool,
    ) -> dict[str, Any]:
        record = {
            "id": str(uuid.uuid4()),
            "oportunidad_id": str(oportunidad_id),
            "legacy_lead_id": str(oportunidad_id),
            "estado_onboarding": "pendiente",
            "razon_social": "Cliente Demo",
        }
        self.clients[str(oportunidad_id)] = record
        return record

    async def get_cliente_por_oportunidad(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
        usuario_token: str | None = None,
    ) -> dict[str, Any] | None:
        return self.clients.get(str(oportunidad_id))


@pytest.fixture()
def pipeline_repo() -> InMemoryPipelineRepository:
    return InMemoryPipelineRepository()


@pytest.fixture()
def pipeline_app(pipeline_repo: InMemoryPipelineRepository) -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(crm_routes.router)
    fastapi_app.dependency_overrides[crm_routes.get_repository] = lambda: pipeline_repo
    return fastapi_app


@pytest.fixture()
async def pipeline_client(pipeline_app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=pipeline_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as session:
        yield session


def _auth_headers() -> dict[str, str]:
    return {
        "X-Organizacion-Id": str(uuid.uuid4()),
        "X-Usuario-Id": str(uuid.uuid4()),
        "X-User-Token": "test-token",
    }


@pytest.mark.asyncio
async def test_crm_pipeline_end_to_end(
    pipeline_client: AsyncClient,
    pipeline_repo: InMemoryPipelineRepository,
) -> None:
    headers = _auth_headers()
    create_payload = {
        "etapa_id": str(pipeline_repo.stage_catalog["captado"]["id"]),
        "titulo": "Demo oportunidad",
        "contacto_principal_id": str(uuid.uuid4()),
        "metadata": {"lead_source": "unit-test"},
    }
    resp = await pipeline_client.post(
        "/crm/pipeline/opportunities", headers=headers, json=create_payload
    )
    assert resp.status_code == 201
    body = resp.json()
    oportunidad_id = body["card"]["tarjeta_id"]
    assert oportunidad_id

    move_payload = {
        "etapa_id": str(pipeline_repo.stage_catalog["demo"]["id"]),
        "metadata": {"demo_format": "virtual"},
    }
    resp = await pipeline_client.patch(
        f"/crm/pipeline/opportunities/{oportunidad_id}",
        headers=headers,
        json=move_payload,
    )
    assert resp.status_code == 200
    moved = resp.json()
    assert moved["card"]["etapa_id"] == str(pipeline_repo.stage_catalog["demo"]["id"])

    history_resp = await pipeline_client.get(
        f"/crm/pipeline/opportunities/{oportunidad_id}/history",
        headers=headers,
    )
    assert history_resp.status_code == 200
    assert history_resp.json()["items"]

    quote_payload = {
        "titulo": "Implementación",
        "descripcion": "Plan completo",
        "moneda": "MXN",
        "items": [
            {
                "titulo": "Paquete IA",
                "descripcion": "Setup",
                "cantidad": 1,
                "unidad": "servicio",
                "precio_unitario": 1000,
                "moneda": "MXN",
            }
        ],
    }
    quote_resp = await pipeline_client.post(
        f"/crm/oportunidades/{oportunidad_id}/quotes",
        headers=headers,
        json=quote_payload,
    )
    assert quote_resp.status_code == 201
    quote_id = quote_resp.json()["quote"]["id"]

    mark_payload = {"estado": "enviada", "canal": "email"}
    resp = await pipeline_client.post(
        f"/crm/cotizaciones/{quote_id}/mark",
        headers=headers,
        json=mark_payload,
    )
    assert resp.status_code == 200

    accept_payload = {"estado": "aceptada", "canal": "email"}
    resp = await pipeline_client.post(
        f"/crm/cotizaciones/{quote_id}/mark",
        headers=headers,
        json=accept_payload,
    )
    assert resp.status_code == 200
    assert resp.json()["quote"]["estado"] == "aceptada"

    card_resp = await pipeline_client.get(
        f"/crm/pipeline/cards/{oportunidad_id}",
        headers=headers,
    )
    assert card_resp.status_code == 200
    card_data = card_resp.json()["card"]
    assert card_data["etapa_codigo"] == "cerrado_ganado"

    convert_resp = await pipeline_client.post(
        f"/crm/oportunidades/{oportunidad_id}/convertir",
        headers=headers,
        json={"forzar": True},
    )
    assert convert_resp.status_code == 200
    cliente_payload = convert_resp.json()["cliente"]
    assert cliente_payload["oportunidad_id"] == str(oportunidad_id)
    assert cliente_payload["legacy_lead_id"] == str(oportunidad_id)

    cliente_resp = await pipeline_client.get(
        f"/crm/oportunidades/{oportunidad_id}/cliente",
        headers=headers,
    )
    assert cliente_resp.status_code == 200
    assert cliente_resp.json()["cliente"]["estado_onboarding"] == "pendiente"
