import uuid
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.repositories.crm import (
    CRMRepository,
    _build_geo_postgrest_filters,
    _build_prospectos_ids_cache_key,
    _row_matches_geo_filters,
)


class DummyResponse:
    def __init__(self, payload=None):
        self._payload = payload if payload is not None else []
        self.headers = {}

    def json(self):
        return self._payload


@pytest.mark.asyncio
async def test_list_opportunities_builds_combined_and_filters() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request = AsyncMock(side_effect=fake_request)

    await repo.list_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        canal="WhatsApp",
        q="Demo",
        monto_min=10.0,
        monto_max=20.0,
        cierre_desde="2026-03-04T10:00:00+00:00",
        cierre_hasta="2026-03-05T09:59:59.999999+00:00",
        creado_desde="2026-03-04T10:00:00+00:00",
        creado_hasta="2026-03-05T09:59:59.999999+00:00",
        reinicio_min=2,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/oportunidades"
    params = captured["params"]
    assert isinstance(params, dict)
    and_clause = params.get("and")
    assert isinstance(and_clause, str)
    assert "monto_estimado.gte.10.0" in and_clause
    assert "monto_estimado.lte.20.0" in and_clause
    assert "fecha_cierre_probable.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "fecha_cierre_probable.lte.2026-03-05T09:59:59.999999+00:00" in and_clause
    assert "creado_en.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "creado_en.lte.2026-03-05T09:59:59.999999+00:00" in and_clause
    assert params.get("canal") == "eq.whatsapp"
    assert params.get("restart_sequence") == "gte.2"
    assert params.get("or") == "(titulo.ilike.*Demo*,contacto_nombre.ilike.*Demo*)"
    assert all(
        "metadata->>" not in str(value)
        for value in params.values()
        if isinstance(value, str)
    )


@pytest.mark.asyncio
async def test_list_opportunities_can_skip_contact_enrichment() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    rows = await repo.list_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        limit=10,
        include_contact_rows=False,
    )

    assert rows == []
    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/oportunidades"
    repo._attach_contact_rows.assert_not_awaited()


@pytest.mark.asyncio
async def test_list_pipeline_opportunities_uses_materialized_columns() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request = AsyncMock(side_effect=fake_request)

    await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        canal="WhatsApp",
        q="Demo",
        limit=25,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/oportunidades"
    params = captured["params"]
    assert isinstance(params, dict)
    assert params.get("canal") == "eq.whatsapp"
    and_clause = params.get("and")
    assert isinstance(and_clause, str)
    assert "titulo.ilike.*Demo*" in and_clause
    assert "descripcion.ilike.*Demo*" in and_clause
    assert "contacto_nombre.ilike.*Demo*" in and_clause
    assert "metadata->>" not in and_clause


@pytest.mark.asyncio
async def test_list_pipeline_opportunities_can_skip_exact_count_and_contact_enrichment() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        captured["prefer"] = kwargs.get("prefer")
        return DummyResponse([])

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        limit=25,
        include_contact_rows=False,
        count_exact=False,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/oportunidades"
    assert captured["prefer"] is None
    repo._attach_contact_rows.assert_not_awaited()


@pytest.mark.asyncio
async def test_whatsapp_metrics_filters_use_raw_iso_and_and_clause() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    await repo.list_whatsapp_atribucion_eventos_for_metrics(
        usuario_token="token",
        date_from_iso="2026-03-04T10:00:00+00:00",
        date_to_iso="2026-03-05T09:59:59.999999+00:00",
        limit=10,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/prospeccion_whatsapp_atribucion_eventos"
    params = captured["params"]
    assert isinstance(params, dict)
    and_clause = params.get("and")
    assert isinstance(and_clause, str)
    assert "creado_en.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "creado_en.lte.2026-03-05T09:59:59.999999+00:00" in and_clause
    assert "%3A" not in and_clause
    assert "%2B" not in and_clause


@pytest.mark.asyncio
async def test_list_prospectos_scopes_request_to_organizacion_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    org_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    await repo.list_prospectos(usuario_token="token", organizacion_id=org_id, limit=10, offset=0)

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/prospeccion_prospectos"
    params = captured["params"]
    assert isinstance(params, dict)
    assert params.get("organizacion_id") == f"eq.{org_id}"
    select = params.get("select")
    assert isinstance(select, str)
    assert select != "*"
    assert "display_name" in select
    assert "busqueda_ref" in select
    assert "scraper_ejecutado" not in select
    assert "scraper_ultimo_en" not in select
    assert "contact_indicators" not in select


@pytest.mark.asyncio
async def test_list_prospectos_excluding_ids_scans_past_a_capped_first_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository()
    excluded_ids = {str(value) for value in range(1, 1001)}
    seen_requests: list[tuple[str, dict[str, str] | None]] = []

    async def fake_request_with_user(method: str, path: str, **kwargs):
        params = kwargs.get("params")
        seen_requests.append((f"{method} {path}", params if isinstance(params, dict) else None))
        if method == "HEAD":
            response = DummyResponse([])
            response.headers = {"content-range": "0-0/2000"}
            return response
        if method == "GET" and path == "/rest/v1/prospeccion_prospectos":
            if not isinstance(params, dict):
                raise AssertionError("missing params")
            limit = int(params.get("limit", "0"))
            offset = int(params.get("offset", "0"))
            if limit != 1000 or offset not in {0, 1000}:
                raise AssertionError(f"unexpected scan params: {params!r}")
            start = offset + 1
            rows = [
                {"id": str(value), "email_lookup_status": "valido"}
                for value in range(start, start + 1000)
            ]
            return DummyResponse(rows)
        raise AssertionError(f"unexpected request: {method} {path} {kwargs!r}")

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    rows, total = await repo._list_prospectos_excluding_ids(
        usuario_token="token",
        params={"organizacion_id": "eq.00000000-0000-0000-0000-000000000001"},
        excluded_ids=excluded_ids,
        limit=10,
        offset=0,
    )

    assert total == 1000
    assert len(rows) == 10
    assert all(int(row["id"]) > 1000 for row in rows)
    assert any(
        entry[0] == "GET /rest/v1/prospeccion_prospectos" and entry[1] and entry[1].get("offset") == "1000"
        for entry in seen_requests
    )


def test_prospectos_cache_key_includes_organizacion_id() -> None:
    token = "token"
    org_a = uuid.UUID("11111111-1111-1111-1111-111111111111")
    org_b = uuid.UUID("22222222-2222-2222-2222-222222222222")

    key_a = _build_prospectos_ids_cache_key(usuario_token=token, organizacion_id=org_a, suffix="scraper")
    key_b = _build_prospectos_ids_cache_key(usuario_token=token, organizacion_id=org_b, suffix="scraper")

    assert key_a != key_b


def test_geo_postgrest_filters_use_exact_geo_columns() -> None:
    filters = _build_geo_postgrest_filters(geo_estado="24", geo_municipio="028")

    assert any(item.startswith("or(") and "estado_cve.eq.24" in item for item in filters)
    assert any(item.startswith("or(") and "municipio_cve.eq.028" in item for item in filters)
    assert all("metadata->" not in item for item in filters)
    assert all("address" not in item for item in filters)


def test_geo_row_matching_prefers_exact_geo_columns_over_text() -> None:
    row = {
        "estado_cve": "24",
        "estado_nombre": "Querétaro",
        "municipio_cve": "028",
        "municipio_nombre": "Querétaro",
        "address": "Algo en Puebla",
        "metadata": {
            "estado_nombre": "Puebla",
            "municipio_nombre": "Puebla",
            "ubicacion": {"estado": "Puebla", "municipio": "Puebla"},
        },
    }

    assert _row_matches_geo_filters(row, geo_estado="24", geo_municipio="028")
    assert not _row_matches_geo_filters(row, geo_estado="21", geo_municipio=None)


@pytest.mark.asyncio
async def test_get_propiedad_capa_does_not_filter_by_organizacion_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}
    capa_id = uuid.uuid4()

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([{"id": str(capa_id)}])

    monkeypatch.setattr(repo, "_request", fake_request)

    await repo.get_propiedad_capa(
        organizacion_id=uuid.uuid4(),
        capa_id=capa_id,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/propiedad_capas"
    assert captured["params"] == {"id": f"eq.{capa_id}", "limit": "1"}
