"""Pruebas para los endpoints de agenda de demos."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.api.routes import panel
from app.services import storage


class DummyResponse:
    """Pequeño stub compatible con httpx.Response usado en las pruebas."""

    def __init__(self, status_code: int, payload: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text or ""

    def json(self) -> Any:  # pragma: no cover - simple getter
        return self._payload


@pytest.mark.asyncio
async def test_crear_cita_demo_usa_rpc_upsert(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "json": json or {}, "token": token, "prefer": prefer})
        return DummyResponse(status_code=200, payload={"id": "cita-123"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

    async def fake_context(_tarjeta_id: str, _token: str) -> dict[str, str]:
        return {"contacto_id": str(uuid4()), "conversacion_id": str(uuid4())}

    monkeypatch.setattr(panel, "_resolve_lead_card_context", fake_context)

    cita_payload = {
        "tarjeta_id": str(uuid4()),
        "contacto_id": str(uuid4()),
        "conversacion_id": str(uuid4()),
        "start_at": datetime(2025, 1, 2, 15, tzinfo=timezone.utc).isoformat(),
        "timezone": "America/Mexico_City",
        "estado": "confirmada",
        "provider": "google",
        "notes": "Revisión inicial",
        "metadata": {"fuente": "tal-ia"},
    }

    response = await async_client.post(
        "/api/agenda/demos",
        json=cita_payload,
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 201
    assert response.json() == {"ok": True, "item": {"id": "cita-123"}}
    assert captured["path"] == "/rest/v1/rpc/fn_cita_upsert"
    assert captured["token"] == "test-token"
    assert captured["prefer"] is None
    body = captured["json"]
    assert body["p_tarjeta_id"] == cita_payload["tarjeta_id"]
    assert body["p_contacto_id"] == cita_payload["contacto_id"]
    assert body["p_conversacion_id"] == cita_payload["conversacion_id"]
    assert body["p_created_by"] == "user-123"
    assert body["p_updated_by"] == "user-123"


@pytest.mark.asyncio
async def test_crear_cita_demo_traduce_error_supabase(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        assert path == "/rest/v1/rpc/fn_cita_upsert"
        return DummyResponse(status_code=409, payload={"message": "dup"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

    async def fake_context(_tarjeta_id: str, _token: str) -> dict[str, str]:
        return {"contacto_id": str(uuid4()), "conversacion_id": str(uuid4())}

    monkeypatch.setattr(panel, "_resolve_lead_card_context", fake_context)

    response = await async_client.post(
        "/api/agenda/demos",
        json={
            "tarjeta_id": str(uuid4()),
            "contacto_id": str(uuid4()),
            "conversacion_id": str(uuid4()),
            "start_at": datetime(2025, 1, 2, 15, tzinfo=timezone.utc).isoformat(),
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Error creando cita demo"


@pytest.mark.asyncio
async def test_crear_cita_demo_con_campos_extra(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "json": json or {}, "token": token, "prefer": prefer})
        return DummyResponse(status_code=200, payload={"id": "cita-999"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

    async def fake_context(_tarjeta_id: str, _token: str) -> dict[str, str]:
        return {"contacto_id": str(uuid4()), "conversacion_id": str(uuid4())}

    monkeypatch.setattr(panel, "_resolve_lead_card_context", fake_context)

    start_iso = datetime(2025, 2, 1, 14, tzinfo=timezone.utc).isoformat()
    response = await async_client.post(
        "/api/agenda/demos",
        json={
            "tarjeta_id": str(uuid4()),
            "contacto_id": str(uuid4()),
            "start_at": start_iso,
            "scheduled_via": "api",
            "reminder_status": "programado",
            "reminder_sent_at": start_iso,
            "external_join_url": "https://meet.example/id",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 201
    body = captured["json"]
    assert body["p_reminder_status"] == "programado"
    assert body["p_reminder_sent_at"] == start_iso
    assert body["p_external_join_url"] == "https://meet.example/id"
    assert body["p_scheduled_via"] == "api"


@pytest.mark.asyncio
async def test_actualizar_cita_demo_usa_rpc_upsert(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update(
            {
                "path": path,
                "json": json or {},
                "token": token,
                "prefer": prefer,
            }
        )
        return DummyResponse(status_code=200, payload={"id": "cita-123", "estado": "reprogramada"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

    cita_id = str(uuid4())
    response = await async_client.patch(
        f"/api/agenda/demos/{cita_id}",
        json={
            "start_at": datetime(2025, 1, 3, 18, tzinfo=timezone.utc).isoformat(),
            "estado": "reprogramada",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "item": {"id": "cita-123", "estado": "reprogramada"}}
    assert captured["path"] == "/rest/v1/rpc/fn_cita_upsert"
    assert captured["token"] == "test-token"
    assert captured["prefer"] is None
    body = captured["json"]
    assert body["p_id"] == str(cita_id)
    assert body["p_updated_by"] == "user-123"
    assert body["p_estado"] == "reprogramada"


@pytest.mark.asyncio
async def test_actualizar_cita_demo_envia_flags_extra(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "json": json or {}, "token": token, "prefer": prefer})
        payload = json or {}
        return DummyResponse(status_code=200, payload={"id": payload.get("p_id", "cita-xyz")})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

    cita_id = str(uuid4())
    timestamp = datetime(2025, 1, 4, 12, 0, tzinfo=timezone.utc).isoformat()
    response = await async_client.patch(
        f"/api/agenda/demos/{cita_id}",
        json={
            "metadata": {"notas": "algo"},
            "merge_metadata": False,
            "expected_updated_at": timestamp,
            "remove_provider_event": True,
            "reminder_sent_at": timestamp,
            "reminder_status": "enviado",
            "external_join_url": "https://zoom.example/123",
            "scheduled_via": "ia",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert captured["path"] == "/rest/v1/rpc/fn_cita_upsert"
    body = captured["json"]
    assert body["p_merge_metadata"] is False
    assert body["p_expected_updated_at"] == timestamp
    assert body["p_remove_provider_event"] is True
    assert body["p_reminder_sent_at"] == timestamp
    assert body["p_reminder_status"] == "enviado"
    assert body["p_external_join_url"] == "https://zoom.example/123"
    assert body["p_scheduled_via"] == "ia"


@pytest.mark.asyncio
async def test_eliminar_cita_demo_usa_rpc_cancel(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "json": json or {}, "token": token, "prefer": prefer})
        payload = json or {}
        return DummyResponse(
            status_code=200, payload={"id": payload.get("p_id"), "estado": "cancelada"}
        )

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)

    cita_id = str(uuid4())
    response = await async_client.delete(
        f"/api/agenda/demos/{cita_id}",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "item": {"id": cita_id, "estado": "cancelada"}}
    assert captured["path"] == "/rest/v1/rpc/fn_cita_cancel"
    assert captured["json"] == {"p_id": cita_id}
    assert captured["token"] == "test-token"
    assert captured["prefer"] is None


@pytest.mark.asyncio
async def test_eliminar_cita_demo_con_motivo_y_flag(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "json": json or {}, "token": token, "prefer": prefer})
        return DummyResponse(status_code=200, payload={"id": json["p_id"], "estado": "cancelada"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)

    async def fake_get_demo_cita(_: str) -> dict[str, Any]:
        return {"id": str(uuid4()), "provider": "caldav", "provider_event_id": "evt-123"}

    async def fake_sync_cancel(**_: Any) -> None:
        return None

    monkeypatch.setattr(storage, "get_demo_cita", fake_get_demo_cita)
    monkeypatch.setattr(panel, "sync_cita_after_cancel", fake_sync_cancel)

    cita_id = str(uuid4())
    response = await async_client.delete(
        f"/api/agenda/demos/{cita_id}?remove_provider_event=true&reason=Cambio%20de%20agenda",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json()["item"]["id"] == cita_id
    assert captured["json"]["p_id"] == cita_id
    assert captured["json"]["p_reason"] == "Cambio de agenda"
    assert captured["json"]["p_remove_provider_event"] is True
