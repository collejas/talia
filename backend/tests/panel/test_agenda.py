"""Pruebas para los endpoints de agenda de demos."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.api.routes import panel


class DummyResponse:
    """Pequeño stub compatible con httpx.Response usado en las pruebas."""

    def __init__(self, status_code: int, payload: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text or ""

    def json(self) -> Any:  # pragma: no cover - simple getter
        return self._payload


@pytest.mark.asyncio
async def test_crear_cita_demo_envia_a_tabla_citas(
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
        return DummyResponse(status_code=201, payload=[{"id": "cita-123"}])

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

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
    assert captured["path"] == "/rest/v1/citas"
    assert captured["token"] == "test-token"
    assert captured["prefer"] == "return=representation"
    body = captured["json"]
    assert body["tarjeta_id"] == cita_payload["tarjeta_id"]
    assert body["contacto_id"] == cita_payload["contacto_id"]
    assert body["conversacion_id"] == cita_payload["conversacion_id"]
    assert body["created_by"] == "user-123"
    assert body["updated_by"] == "user-123"


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
        return DummyResponse(status_code=409, payload={"message": "dup"})

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-123")

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
async def test_actualizar_cita_demo_envia_patch_a_citas(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_patch(
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update(
            {
                "path": path,
                "params": params or {},
                "json": json or {},
                "token": token,
                "prefer": prefer,
            }
        )
        return DummyResponse(
            status_code=200, payload=[{"id": "cita-123", "estado": "reprogramada"}]
        )

    monkeypatch.setattr(panel, "_sb_patch", fake_sb_patch)
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
    assert captured["path"] == "/rest/v1/citas"
    assert captured["params"] == {"id": f"eq.{cita_id}", "limit": "1"}
    assert captured["token"] == "test-token"
    assert captured["prefer"] == "return=representation"
    assert captured["json"]["updated_by"] == "user-123"
    assert captured["json"]["estado"] == "reprogramada"


@pytest.mark.asyncio
async def test_eliminar_cita_demo_envia_delete_a_citas(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_delete(
        path: str,
        *,
        params: dict[str, str] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured.update({"path": path, "params": params or {}, "token": token, "prefer": prefer})
        return DummyResponse(status_code=204, payload=None)

    monkeypatch.setattr(panel, "_sb_delete", fake_sb_delete)

    cita_id = str(uuid4())
    response = await async_client.delete(
        f"/api/agenda/demos/{cita_id}",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert captured["path"] == "/rest/v1/citas"
    assert captured["params"] == {"id": f"eq.{cita_id}"}
    assert captured["token"] == "test-token"
    assert captured["prefer"] == "return=representation"
