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
async def test_list_pipeline_opportunities_filters_by_email() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert path == "/rest/v1/oportunidades"
        return DummyResponse(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "titulo": "Match",
                    "contacto": {
                        "correo_principal": "collejas1@gmail.com",
                        "correo_secundario": None,
                    },
                    "cuenta": {"correo": None},
                    "metadata": {},
                },
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "titulo": "Miss",
                    "contacto": {
                        "correo_principal": "otro@gmail.com",
                        "correo_secundario": None,
                    },
                    "cuenta": {"correo": None},
                    "metadata": {},
                },
            ]
        )

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    rows, total = await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        correo="collejas1@gmail.com",
        include_contact_rows=False,
    )

    assert total == 1
    assert [row["id"] for row in rows] == ["11111111-1111-1111-1111-111111111111"]
    repo._attach_contact_rows.assert_not_awaited()


@pytest.mark.asyncio
async def test_list_sale_ready_opportunities_excludes_won_opportunities() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert path == "/rest/v1/oportunidades"
        return DummyResponse(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "titulo": "Activa",
                    "estado": "abierta",
                    "contacto_principal_id": "contact-open",
                    "contacto": {
                        "correo_principal": "open@example.com",
                        "telefono_e164": None,
                    },
                    "etapa": {
                        "codigo": "captado",
                        "categoria": "abierta",
                    },
                },
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "titulo": "Ganada",
                    "estado": "ganada",
                    "contacto_principal_id": "contact-won",
                    "contacto": {
                        "correo_principal": "won@example.com",
                        "telefono_e164": "+521111111111",
                    },
                    "etapa": {
                        "codigo": "cerrado_ganado",
                        "categoria": "ganada",
                    },
                },
            ]
        )

    async def fake_list_contact_ids_by_captura_estado(
        organizacion_id: uuid.UUID,
        captura_estado: str,
    ) -> list[str]:
        assert captura_estado == "completo"
        return ["contact-open", "contact-won"]

    repo._request = AsyncMock(side_effect=fake_request)
    repo._list_contact_ids_by_captura_estado = AsyncMock(side_effect=fake_list_contact_ids_by_captura_estado)

    rows = await repo.list_sale_ready_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        limit=50,
        contacto_captura_estado="completo",
    )

    assert [row["id"] for row in rows] == ["11111111-1111-1111-1111-111111111111"]


@pytest.mark.asyncio
async def test_get_latest_conversation_id_by_contact_orders_by_iniciada_en() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([{"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}])

    repo._request = AsyncMock(side_effect=fake_request)

    convo_id = await repo.get_latest_conversation_id_by_contact(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        contacto_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
    )

    assert convo_id == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/conversaciones"
    params = captured["params"]
    assert isinstance(params, dict)
    assert params.get("order") == "iniciada_en.desc"


@pytest.mark.asyncio
async def test_list_pipeline_opportunities_ignores_vendor_email_for_email_filter() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert path == "/rest/v1/oportunidades"
        return DummyResponse(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "titulo": "Vendor only",
                    "contacto": {
                        "correo_principal": "otro-contacto@gmail.com",
                        "correo_secundario": None,
                    },
                    "cuenta": {"correo": None},
                    "asignado": {"correo": "collejas1@gmail.com"},
                    "propietario": {"correo": None},
                    "metadata": {},
                }
            ]
        )

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    rows, total = await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        correo="collejas1@gmail.com",
        include_contact_rows=False,
    )

    assert total == 0
    assert rows == []
    repo._attach_contact_rows.assert_not_awaited()


@pytest.mark.asyncio
async def test_list_pipeline_opportunities_filters_only_real_bookings() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert path == "/rest/v1/oportunidades"
        return DummyResponse(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "titulo": "Only notification",
                    "contacto": {"correo_principal": "a@example.com"},
                    "cuenta": {"correo": None},
                    "metadata": {"sales_notifications": {"booking_confirmed": True}},
                },
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "titulo": "Real booking",
                    "contacto": {"correo_principal": "b@example.com"},
                    "cuenta": {"correo": None},
                    "metadata": {
                        "stage_prep": {
                            "demo": {
                                "demo_booking_id": "booking-123",
                                "demo_scheduled_at": "2026-06-08T10:00:00Z",
                            }
                        }
                    },
                },
            ]
        )

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    con_cita_rows, con_cita_total = await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        tiene_cita="con_cita",
        include_contact_rows=False,
    )
    sin_cita_rows, sin_cita_total = await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        tiene_cita="sin_cita",
        include_contact_rows=False,
    )

    assert con_cita_total == 1
    assert [row["id"] for row in con_cita_rows] == ["22222222-2222-2222-2222-222222222222"]
    assert sin_cita_total == 1
    assert [row["id"] for row in sin_cita_rows] == ["11111111-1111-1111-1111-111111111111"]


@pytest.mark.asyncio
async def test_list_pipeline_opportunities_counts_general_demo_schedule_as_booking() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert path == "/rest/v1/oportunidades"
        return DummyResponse(
            [
                {
                    "id": "33333333-3333-3333-3333-333333333333",
                    "titulo": "General demo",
                    "contacto": {"correo_principal": "c@example.com"},
                    "cuenta": {"correo": None},
                    "metadata": {
                        "stage_prep": {
                            "general_demo": {
                                "demo_format": "virtual",
                                "demo_scheduled_at": "2026-06-08T10:00:00Z",
                            }
                        }
                    },
                }
            ]
        )

    repo._request = AsyncMock(side_effect=fake_request)
    repo._attach_contact_rows = AsyncMock()

    rows, total = await repo.list_pipeline_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        tiene_cita="con_cita",
        include_contact_rows=False,
    )

    assert total == 1
    assert [row["id"] for row in rows] == ["33333333-3333-3333-3333-333333333333"]


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
async def test_list_prospecto_query_metadata_supplements_manual_import_taxonomy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository()

    async def fake_request_with_user(method: str, path: str, **kwargs):
        if method == "POST" and path == "/rest/v1/rpc/prospeccion_queries_resumen":
            return DummyResponse([])
        if method == "POST" and path == "/rest/v1/rpc/prospeccion_activities_resumen":
            return DummyResponse([])
        if method == "POST" and path == "/rest/v1/rpc/prospeccion_segmentos_resumen":
            return DummyResponse([])
        if method == "GET" and path == "/rest/v1/prospeccion_prospectos":
            params = kwargs.get("params") or {}
            assert params.get("organizacion_id") == "eq.11111111-1111-1111-1111-111111111111"
            if params.get("fuente") != "eq.usuario":
                raise AssertionError(f"unexpected fuente filter: {params!r}")
            offset = params.get("offset")
            if offset == "0":
                return DummyResponse(
                    [
                        {
                            "id": "11111111-1111-1111-1111-111111111111",
                            "actividad": "Consultoría",
                            "segmento": "Industrial",
                        },
                        {
                            "id": "22222222-2222-2222-2222-222222222222",
                            "actividad": "Consultoría",
                            "segmento": "Industrial",
                        },
                        {
                            "id": "33333333-3333-3333-3333-333333333333",
                            "actividad": "Servicios",
                            "segmento": "PyME",
                        },
                    ]
                )
            if offset != "0":
                return DummyResponse([])
        raise AssertionError(f"unexpected request: {method} {path} {kwargs!r}")

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    payload = await repo.list_prospecto_query_metadata(
        usuario_token="token",
        organizacion_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        fuente="usuario",
    )

    assert payload["queries"] == []
    assert payload["activities"] == ["Consultoría", "Servicios"]
    assert payload["segmentos"] == ["Industrial", "PyME"]


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


@pytest.mark.asyncio
async def test_create_propiedad_unidad_movimiento_uses_service_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository(user_token="user-token")
    captured: dict[str, object] = {}

    async def fake_request_service_role(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        captured["json"] = kwargs.get("json")
        return DummyResponse([{"id": str(uuid.uuid4())}])

    monkeypatch.setattr(repo, "_request_service_role", fake_request_service_role)

    await repo.create_propiedad_unidad_movimiento(
        organizacion_id=uuid.uuid4(),
        payload={
            "organizacion_id": str(uuid.uuid4()),
            "unidad_id": str(uuid.uuid4()),
            "estado_anterior": "disponible",
            "estado_nuevo": "reservado",
        },
    )

    assert captured["method"] == "POST"
    assert captured["path"] == "/rest/v1/propiedad_unidad_movimientos"
    assert captured["json"]["estado_nuevo"] == "reservado"
