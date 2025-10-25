from __future__ import annotations

import httpx
import pytest

from app.api.routes import panel


class StubRepo:
    def __init__(self) -> None:
        self.boards: list[dict[str, object]] = []
        self.stages: list[dict[str, object]] = []
        self.cards: list[dict[str, object]] = []
        self.card_detail: dict[str, object] | None = None
        self.card_by_id: dict[str, object] | None = None
        self.created_payloads: list[dict[str, object]] = []

    async def list_boards(self, *, token: str) -> list[dict[str, object]]:
        return self.boards

    async def fetch_board(self, *, token: str, selector: str | None) -> dict[str, object]:
        if selector:
            for board in self.boards:
                if board.get("slug") == selector or board.get("id") == selector:
                    return board
        if self.boards:
            return self.boards[0]
        return {
            "id": "board-default",
            "nombre": "General",
            "slug": "general",
            "es_default": True,
            "activo": True,
        }

    async def fetch_stages(self, *, board_id: str, token: str) -> list[dict[str, object]]:
        return self.stages

    async def fetch_cards(
        self,
        *,
        board_id: str,
        token: str,
        channels: list[str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, object]]:
        self.last_channels = channels
        self.last_limit = limit
        return self.cards

    async def create_card(
        self,
        *,
        payload: dict[str, object],
        token: str | None,
    ) -> dict[str, object]:
        self.created_payloads.append(payload)
        return {"id": "card-1", **payload}

    async def fetch_card_detail(self, *, card_id: str, token: str) -> dict[str, object] | None:
        return self.card_detail

    async def fetch_card_by_id(self, *, card_id: str, token: str) -> dict[str, object] | None:
        return self.card_by_id

    async def fetch_stage(self, *, stage_id: str, token: str) -> dict[str, object] | None:
        for stage in self.stages:
            if stage.get("id") == stage_id:
                return stage
        return None


class StubPipeline:
    def __init__(self) -> None:
        self.move_calls: list[dict[str, object]] = []
        self.assign_calls: list[dict[str, object]] = []

    async def move_lead(
        self,
        *,
        card_id: str,
        stage_id: str,
        motivo: str | None = None,
        fuente: str = "humano",
        token: str | None = None,
        metadata: dict[str, object] | None = None,
    ) -> dict[str, object]:
        self.move_calls.append(
            {
                "card_id": card_id,
                "stage_id": stage_id,
                "motivo": motivo,
                "fuente": fuente,
                "token": token,
                "metadata": metadata,
            }
        )
        return {"id": card_id, "etapa_id": stage_id}

    async def assign_lead(
        self,
        *,
        card_id: str,
        usuario_id: str | None,
        fuente: str = "humano",
        token: str | None = None,
    ) -> dict[str, object]:
        self.assign_calls.append(
            {
                "card_id": card_id,
                "usuario_id": usuario_id,
                "fuente": fuente,
                "token": token,
            }
        )
        return {"id": card_id, "asignado_a_usuario_id": usuario_id}


@pytest.mark.asyncio
async def test_list_embudo_boards_returns_items(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    repo = StubRepo()
    repo.boards = [
        {
            "id": "b1",
            "nombre": "General",
            "slug": "general",
            "es_default": True,
            "activo": True,
        }
    ]
    monkeypatch.setattr(panel, "_get_leads_repo", lambda: repo)

    response = await async_client.get(
        "/api/embudo/tableros",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["items"][0]["nombre"] == "General"


@pytest.mark.asyncio
async def test_get_embudo_groups_cards(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    repo = StubRepo()
    repo.boards = [
        {"id": "b1", "nombre": "General", "slug": "general", "es_default": True, "activo": True}
    ]
    repo.stages = [
        {"id": "s1", "nombre": "Captado", "categoria": "abierta", "orden": 1, "probabilidad": 10},
        {
            "id": "s2",
            "nombre": "Negociación",
            "categoria": "abierta",
            "orden": 2,
            "probabilidad": 60,
        },
    ]
    repo.cards = [
        {
            "id": "c1",
            "tablero_id": "b1",
            "etapa_id": "s1",
            "contacto_id": "ct-1",
            "contacto_nombre": "Ana",
            "conversacion_id": "conv-1",
            "canal": "whatsapp",
            "probabilidad_override": None,
            "lead_score": 80,
            "tags": ["demo"],
            "metadata": {"siguiente_accion": "Llamar"},
            "asignado_a_usuario_id": "user-1",
            "asignado_nombre": "Ejecutivo",
            "propietario_usuario_id": "user-1",
            "propietario_nombre": "Ejecutivo",
        }
    ]
    monkeypatch.setattr(panel, "_get_leads_repo", lambda: repo)

    response = await async_client.get(
        "/api/embudo",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["board"]["nombre"] == "General"
    assert payload["totals"]["cards"] == 1
    assert payload["stages"][0]["total"] == 1
    assert repo.last_channels is None


@pytest.mark.asyncio
async def test_create_embudo_lead_returns_serialized(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    repo = StubRepo()
    repo.card_detail = {
        "id": "card-1",
        "tablero_id": "b1",
        "etapa_id": "s1",
        "contacto_id": "c1",
        "contacto_nombre": "Ana",
        "conversacion_id": None,
        "canal": "webchat",
        "probabilidad_override": None,
        "lead_score": None,
        "tags": [],
        "metadata": {},
        "asignado_a_usuario_id": "user-1",
        "asignado_nombre": "Ejecutivo",
        "propietario_usuario_id": "user-1",
        "propietario_nombre": "Ejecutivo",
    }
    repo.stages = [
        {"id": "s1", "nombre": "Captado", "categoria": "abierta", "orden": 1, "probabilidad": 10}
    ]
    monkeypatch.setattr(panel, "_get_leads_repo", lambda: repo)
    monkeypatch.setattr(panel, "_jwt_verify_and_sub", lambda token: "user-1")

    response = await async_client.post(
        "/api/embudo/leads",
        headers={"Authorization": "Bearer token"},
        json={"contacto_id": "c1", "canal": "webchat"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["lead"]["contacto"]["id"] == "c1"
    assert repo.created_payloads[0]["propietario_usuario_id"] == "user-1"


@pytest.mark.asyncio
async def test_move_embudo_lead_invokes_pipeline(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    repo = StubRepo()
    repo.card_by_id = {
        "id": "card-1",
        "tablero_id": "b1",
        "etapa_id": "s1",
        "metadata": {"current": True},
    }
    repo.stages = [
        {"id": "s1", "nombre": "Captado", "tablero_id": "b1", "categoria": "abierta", "orden": 1},
        {
            "id": "s2",
            "nombre": "Negociación",
            "tablero_id": "b1",
            "categoria": "abierta",
            "orden": 2,
        },
    ]
    repo.card_detail = {
        "id": "card-1",
        "tablero_id": "b1",
        "etapa_id": "s2",
        "contacto_id": "c1",
        "contacto_nombre": "Ana",
        "canal": "webchat",
        "metadata": {},
        "tags": [],
    }
    pipeline = StubPipeline()
    monkeypatch.setattr(panel, "_get_leads_repo", lambda: repo)
    monkeypatch.setattr(panel, "_get_lead_pipeline", lambda repo: pipeline)

    response = await async_client.patch(
        "/api/embudo/leads/card-1/etapa",
        headers={"Authorization": "Bearer token"},
        json={"etapa_id": "s2", "motivo": "Calificado", "metadata": {"nota": "cerrar pronto"}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lead"]["etapa_id"] == "s2"
    assert pipeline.move_calls[0]["metadata"]["nota"] == "cerrar pronto"


@pytest.mark.asyncio
async def test_assign_embudo_lead(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    repo = StubRepo()
    repo.card_by_id = {
        "id": "card-1",
        "etapa_id": "s1",
        "tablero_id": "b1",
    }
    repo.stages = [
        {"id": "s1", "nombre": "Captado", "tablero_id": "b1", "categoria": "abierta", "orden": 1}
    ]
    repo.card_detail = {
        "id": "card-1",
        "tablero_id": "b1",
        "etapa_id": "s1",
        "contacto_id": "c1",
        "contacto_nombre": "Ana",
        "asignado_a_usuario_id": "user-2",
        "asignado_nombre": "Nuevo",
        "metadata": {},
        "tags": [],
    }
    pipeline = StubPipeline()
    monkeypatch.setattr(panel, "_get_leads_repo", lambda: repo)
    monkeypatch.setattr(panel, "_get_lead_pipeline", lambda repo: pipeline)

    response = await async_client.patch(
        "/api/embudo/leads/card-1/asignacion",
        headers={"Authorization": "Bearer token"},
        json={"usuario_id": "user-2"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["lead"]["asignado"]["id"] == "user-2"
    assert pipeline.assign_calls[0]["usuario_id"] == "user-2"
