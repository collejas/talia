"""Cobertura para endpoints del embudo en el panel."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient

from app.api.routes import panel


class DummyResponse:
    """Respuesta fake que imita httpx.Response para las pruebas."""

    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:  # pragma: no cover - simple getter
        return self._payload


@pytest.mark.asyncio
async def test_listar_embudo_tableros_ok(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_get(
        path: str,
        *,
        params: dict[str, str] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured["path"] = path
        captured["params"] = params or {}
        captured["token"] = token
        captured["prefer"] = prefer
        payload = [
            {
                "id": "board-1",
                "nombre": "General",
                "slug": "general",
                "descripcion": "Tablero principal",
                "es_default": True,
                "activo": True,
            }
        ]
        return DummyResponse(status_code=200, payload=payload)

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/embudo/tableros",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "ok": True,
        "items": [
            {
                "id": "board-1",
                "nombre": "General",
                "slug": "general",
                "descripcion": "Tablero principal",
                "es_default": True,
                "activo": True,
            }
        ],
    }
    assert captured["path"] == "/rest/v1/lead_tableros"
    assert captured["token"] == "test-token"
    select = captured["params"]["select"]
    assert "id" in select and "nombre" in select


@pytest.mark.asyncio
async def test_listar_embudo_tableros_translates_error(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    async def fake_sb_get(
        path: str,
        *,
        params: dict[str, str] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        return DummyResponse(status_code=500, payload={"error": "boom"})

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/embudo/tableros",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Error consultando tableros"


@pytest.mark.asyncio
async def test_obtener_embudo_success(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    board_payload = {
        "id": "board-123",
        "nombre": "Ventas",
        "slug": "ventas",
        "descripcion": "Pipeline de ventas",
    }
    etapas_payload = [
        {
            "id": "stage-open",
            "codigo": "open",
            "nombre": "Abiertas",
            "orden": 1,
            "categoria": "abierta",
            "metadatos": {},
        },
        {
            "id": "stage-visit",
            "codigo": "visit",
            "nombre": "Visitantes",
            "orden": 2,
            "categoria": "visitantes",
            "metadatos": {"is_counter_only": True, "categoria_resumen": "visitantes"},
        },
    ]
    cards_payload = [
        {
            "id": "card-1",
            "tablero_id": "board-123",
            "etapa_id": "stage-open",
            "contacto_id": "contact-1",
            "contacto_nombre": "Ada Lovelace",
            "contacto_estado": "nuevo",
            "contacto_telefono": "+100000000",
            "contacto_correo": "ada@example.com",
            "conversacion_id": "conv-1",
            "canal": "whatsapp",
            "conversacion_estado": "abierta",
            "ultimo_mensaje_en": "2025-01-02T10:00:00+00:00",
            "lead_score": 42,
            "tags": ["vip"],
            "metadata": {"siguiente_accion": "Llamar"},
            "probabilidad_override": 0.75,
            "resumen": "Resumen corto",
            "intencion": "Compra",
            "sentimiento": "positivo",
            "siguiente_accion": "Enviar propuesta",
        }
    ]

    captured_fetch_cards: dict[str, Any] = {}
    captured_visitantes: dict[str, Any] = {}

    async def fake_fetch_tablero(token: str, tablero_hint: str | None) -> dict[str, Any]:
        assert token == "test-token"
        assert tablero_hint == "demo-board"
        return board_payload

    async def fake_fetch_etapas(token: str, tablero_id: str) -> list[dict[str, Any]]:
        assert token == "test-token"
        assert tablero_id == "board-123"
        return etapas_payload

    async def fake_fetch_cards(
        token: str,
        tablero_id: str,
        canales: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[dict[str, Any]]:
        captured_fetch_cards.update(
            {
                "token": token,
                "tablero_id": tablero_id,
                "canales": canales,
                "date_from": date_from,
                "date_to": date_to,
            }
        )
        return cards_payload

    async def fake_fetch_visitantes_total(
        token: str | None,
        canales: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> int:
        captured_visitantes.update(
            {
                "token": token,
                "canales": canales,
                "date_from": date_from,
                "date_to": date_to,
            }
        )
        return 5

    monkeypatch.setattr(panel, "_fetch_tablero", fake_fetch_tablero)
    monkeypatch.setattr(panel, "_fetch_etapas", fake_fetch_etapas)
    monkeypatch.setattr(panel, "_fetch_embudo_cards", fake_fetch_cards)
    monkeypatch.setattr(panel, "_fetch_visitantes_total", fake_fetch_visitantes_total)

    response = await async_client.get(
        "/api/embudo",
        params={
            "tablero": "demo-board",
            "canales": "whatsapp,WEBCHAT",
            "rango": "fechas",
            "desde": "2025-01-01",
            "hasta": "2025-01-02",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["board"]["id"] == "board-123"
    assert payload["totals"] == {
        "cards": 1,
        "por_categoria": {"abierta": 1, "visitantes": 5},
        "visitors": 5,
    }

    stages = payload["stages"]
    assert len(stages) == 2
    open_stage = stages[0]
    assert open_stage["counter_only"] is False
    assert open_stage["total"] == 1
    assert len(open_stage["cards"]) == 1
    card = open_stage["cards"][0]
    assert card["contacto"]["nombre"] == "Ada Lovelace"
    assert card["conversacion"]["canal"] == "whatsapp"
    assert card["insights"]["siguiente_accion"] == "Enviar propuesta"
    visit_stage = stages[1]
    assert visit_stage["counter_only"] is True
    assert visit_stage["total"] == 5
    assert visit_stage["cards"] == []
    assert visit_stage["categoria_resumen"] == "visitantes"

    data_range = payload["range"]
    assert data_range["preset"] == "fechas"
    assert data_range["from"] == "2025-01-01T00:00:00+00:00"
    assert data_range["to"] == "2025-01-02T23:59:59.999999+00:00"

    assert captured_fetch_cards["token"] == "test-token"
    assert captured_fetch_cards["tablero_id"] == "board-123"
    assert captured_fetch_cards["canales"] == ["whatsapp", "webchat"]
    assert captured_visitantes["token"] == "test-token"
    assert captured_visitantes["canales"] == ["whatsapp", "webchat"]

    for dt_value in (
        captured_fetch_cards["date_from"],
        captured_fetch_cards["date_to"],
        captured_visitantes["date_from"],
        captured_visitantes["date_to"],
    ):
        assert isinstance(dt_value, datetime)
        assert dt_value.tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_fetch_visitantes_total_skips_non_webchat(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail_sb_post(*args: Any, **kwargs: Any) -> DummyResponse:
        pytest.fail("RPC should not be invoked when canal no incluye webchat")

    monkeypatch.setattr(panel, "_sb_post", fail_sb_post)

    total = await panel._fetch_visitantes_total("token", ["whatsapp"], None, None)

    assert total == 0


@pytest.mark.asyncio
async def test_fetch_visitantes_total_calls_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_sb_post(
        path: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
        prefer: str | None = None,
    ) -> DummyResponse:
        captured["path"] = path
        captured["json"] = json
        captured["token"] = token
        captured["prefer"] = prefer
        return DummyResponse(status_code=200, payload=[{"total": 7}])

    monkeypatch.setattr(panel, "_sb_post", fake_sb_post)

    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    total = await panel._fetch_visitantes_total("jwt-token", ["webchat"], start, None)

    assert total == 7
    assert captured["path"] == "/rest/v1/rpc/embudo_visitantes_contador"
    assert captured["token"] == "jwt-token"
    assert captured["json"] == {"p_closed_after": "2025-01-01T00:00:00+00:00"}
