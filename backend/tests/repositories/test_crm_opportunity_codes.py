import uuid
from types import SimpleNamespace

import pytest

from app.repositories.crm import CRMRepository, CRMRepositoryError


@pytest.mark.asyncio
async def test_create_opportunity_retries_on_duplicate_codigo(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    calls: list[dict[str, object]] = []
    opportunity_id = uuid.uuid4()

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        del params, prefer, organizacion_id
        assert method == "POST"
        assert path == "/rest/v1/oportunidades"
        assert json is not None
        calls.append(dict(json))
        if len(calls) == 1:
            raise CRMRepositoryError(
                'Supabase respondió error 409 en /rest/v1/oportunidades: '
                '{"code":"23505","message":"duplicate key value violates unique constraint '
                '"oportunidades_org_codigo_oportunidad_uidx""}'
            )
        return SimpleNamespace(
            status_code=201,
            json=lambda: [
                {
                    "id": str(opportunity_id),
                    "organizacion_id": json["organizacion_id"],
                    "titulo": json["titulo"],
                    "etapa_id": json["etapa_id"],
                    "estado": json.get("estado", "abierta"),
                    "codigo_oportunidad": "Opo-0002",
                }
            ],
        )

    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.create_opportunity(
        organizacion_id=uuid.uuid4(),
        payload={
            "etapa_id": uuid.uuid4(),
            "titulo": "Oportunidad demo",
            "metadata": {"created_via": "test"},
        },
    )

    assert result["id"] == str(opportunity_id)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_create_opportunity_returns_existing_row_on_duplicate_request_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    request_id = str(uuid.uuid4())
    existing_row = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(uuid.uuid4()),
        "request_id": request_id,
        "titulo": "Oportunidad existente",
        "etapa_id": str(uuid.uuid4()),
        "estado": "abierta",
        "codigo_oportunidad": "Opo-0099",
    }
    seen_paths: list[tuple[str, str]] = []

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        del prefer, organizacion_id
        seen_paths.append((method, path))
        if method == "POST" and path == "/rest/v1/oportunidades":
            assert json is not None
            assert json.get("request_id") == request_id
            raise CRMRepositoryError(
                'Supabase respondió error 409 en /rest/v1/oportunidades: '
                '{"code":"23505","message":"duplicate key value violates unique constraint '
                '"oportunidades_request_id_uidx""}'
            )
        if method == "GET" and path == "/rest/v1/oportunidades":
            assert params is not None
            assert params.get("request_id") == f"eq.{request_id}"
            return SimpleNamespace(status_code=200, json=lambda: [existing_row])
        raise AssertionError(f"Unexpected request {method} {path}")

    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.create_opportunity(
        organizacion_id=uuid.uuid4(),
        payload={
            "request_id": request_id,
            "etapa_id": uuid.uuid4(),
            "titulo": "Oportunidad demo",
            "metadata": {"created_via": "test"},
        },
    )

    assert result["id"] == existing_row["id"]
    assert seen_paths[0] == ("POST", "/rest/v1/oportunidades")
    assert seen_paths[1] == ("GET", "/rest/v1/oportunidades")


@pytest.mark.asyncio
async def test_create_opportunity_retries_without_request_id_when_schema_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    opportunity_id = uuid.uuid4()
    calls: list[dict[str, object]] = []

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        del params, prefer, organizacion_id
        assert method == "POST"
        assert path == "/rest/v1/oportunidades"
        assert json is not None
        calls.append(dict(json))
        if len(calls) == 1:
            raise CRMRepositoryError(
                'Supabase respondió error 400 en /rest/v1/oportunidades: '
                '{"code":"PGRST204","message":"Could not find the \'request_id\' column of '
                '\'oportunidades\' in the schema cache"}'
            )
        assert "request_id" not in json
        return SimpleNamespace(
            status_code=201,
            json=lambda: [
                {
                    "id": str(opportunity_id),
                    "organizacion_id": json["organizacion_id"],
                    "titulo": json["titulo"],
                    "etapa_id": json["etapa_id"],
                    "estado": json.get("estado", "abierta"),
                    "codigo_oportunidad": "Opo-0100",
                }
            ],
        )

    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.create_opportunity(
        organizacion_id=uuid.uuid4(),
        payload={
            "etapa_id": uuid.uuid4(),
            "titulo": "Oportunidad demo",
            "metadata": {"created_via": "test"},
        },
    )

    assert result["id"] == str(opportunity_id)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_create_persona_returns_existing_row_on_duplicate_request_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    request_id = str(uuid.uuid4())
    existing_row = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(uuid.uuid4()),
        "request_id": request_id,
        "codigo_contacto": "Con123",
        "nombre_completo": "Contacto existente",
    }
    seen_paths: list[tuple[str, str]] = []

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        del prefer, organizacion_id
        seen_paths.append((method, path))
        if method == "POST" and path == "/rest/v1/personas":
            assert json is not None
            assert json.get("request_id") == request_id
            raise CRMRepositoryError(
                'Supabase respondió error 409 en /rest/v1/personas: '
                '{"code":"23505","message":"duplicate key value violates unique constraint '
                '"personas_request_id_uidx""}'
            )
        raise AssertionError(f"Unexpected request {method} {path}")

    monkeypatch.setattr(repo, "_request", fake_request)

    async def fake_get_persona_by_request_id(**_: object) -> dict[str, object]:
        return existing_row

    monkeypatch.setattr(repo, "get_persona_by_request_id", fake_get_persona_by_request_id)

    result = await repo.create_persona(
        organizacion_id=uuid.uuid4(),
        payload={
            "request_id": request_id,
            "nombre_completo": "Contacto demo",
            "origen": "test",
        },
    )

    assert result["id"] == existing_row["id"]
    assert seen_paths[0] == ("POST", "/rest/v1/personas")


@pytest.mark.asyncio
async def test_create_persona_retries_without_request_id_when_schema_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    request_id = str(uuid.uuid4())
    created_row = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(uuid.uuid4()),
        "request_id": request_id,
        "codigo_contacto": "Con456",
        "nombre_completo": "Contacto nuevo",
    }
    calls: list[tuple[str, str, dict[str, object] | None]] = []

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        del prefer, organizacion_id
        calls.append((method, path, params))
        if method == "POST" and path == "/rest/v1/personas":
            assert json is not None
            if len([item for item in calls if item[0] == "POST"]) == 1:
                assert json.get("request_id") == request_id
                raise CRMRepositoryError(
                    'Supabase respondió error 400 en /rest/v1/personas: '
                    '{"code":"PGRST204","message":"Could not find the \'request_id\' column of '
                    '\'personas\' in the schema cache"}'
                )
            assert "request_id" not in json
            return SimpleNamespace(status_code=201, json=lambda: [created_row])
        if method == "GET" and path == "/rest/v1/personas":
            return SimpleNamespace(status_code=200, json=lambda: [created_row])
        if method == "GET" and path == "/rest/v1/cuenta_personas":
            return SimpleNamespace(status_code=200, json=lambda: [])
        raise AssertionError(f"Unexpected request {method} {path}")

    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.create_persona(
        organizacion_id=uuid.uuid4(),
        payload={
            "request_id": request_id,
            "nombre_completo": "Contacto demo",
            "origen": "test",
        },
    )

    assert result["id"] == created_row["id"]
    assert any(method == "POST" and path == "/rest/v1/personas" for method, path, _ in calls)
