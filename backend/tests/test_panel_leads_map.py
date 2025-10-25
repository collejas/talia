"""Pruebas para los endpoints del KPI Leads por estado/municipio."""

from __future__ import annotations

import httpx
import pytest

from app.api.routes import panel


def _sample_contacts_payload() -> list[dict[str, object]]:
    """Retorna payload simulado que devuelve Supabase REST."""
    return [
        {
            "canal": "whatsapp",
            "contacto_id": "1111-aaaa",
            "contacto": {
                "id": "1111-aaaa",
                "telefono_e164": "+5215512345678",
                "contacto_datos": {
                    "lada": {
                        "cve_ent": "09",
                        "nom_ent": "Ciudad de México",
                        "cve_mun": "010",
                        "nom_mun": "Miguel Hidalgo",
                    }
                },
            },
            "metadatos": None,
        },
        {
            "canal": "whatsapp",
            "contacto_id": "2222-bbbb",
            "contacto": {
                "id": "2222-bbbb",
                "telefono_e164": "+5218134567890",
                # Sin datos adicionales: dependerá del LADA (81 → Nuevo León).
                "contacto_datos": {},
            },
            "metadatos": None,
        },
        {
            "canal": "whatsapp",
            "contacto_id": "3333-cccc",
            "contacto": {
                "id": "3333-cccc",
                "telefono_e164": "+523333000000",  # Lada 333 (Jalisco)
                "contacto_datos": {
                    "lada": {
                        "cve_ent": "14",
                        "nom_ent": "Jalisco",
                        "cve_mun": "063",
                        "nom_mun": "Guadalajara",
                    }
                },
            },
            "metadatos": None,
        },
        {
            # Contacto duplicado con distinta identidad, debe ignorarse.
            "canal": "whatsapp",
            "contacto_id": "1111-aaaa",
            "contacto": {
                "id": "1111-aaaa",
                "telefono_e164": "+5215512345678",
                "contacto_datos": {
                    "lada": {
                        "cve_ent": "09",
                        "nom_ent": "Ciudad de México",
                        "cve_mun": "010",
                        "nom_mun": "Miguel Hidalgo",
                    }
                },
            },
            "metadatos": None,
        },
        {
            # Contacto sin datos ni LADA reconocido → se cuenta como sin ubicación.
            "canal": "whatsapp",
            "contacto_id": "4444-dddd",
            "contacto": {"id": "4444-dddd", "telefono_e164": "+447911123456"},
            "metadatos": None,
        },
    ]


def _sample_webchat_payload() -> list[dict[str, object]]:
    return [
        {
            "canal": "webchat",
            "contacto_id": "9999-eeee",
            "contacto": {
                "id": "9999-eeee",
                "telefono_e164": None,
                "contacto_datos": {"session_id": "demo"},
            },
            "metadatos": {
                "geo": {
                    "country": "MX",
                    "region": "San Luis Potosí",
                    "city": "San Luis Potosí City",
                }
            },
        }
    ]


@pytest.mark.asyncio
async def test_leads_by_state_groups_contacts(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    async def fake_sb_get(path: str, *, params=None, token=None):
        assert "/identidades_canal" in path
        assert params and params.get("canal") == "eq.whatsapp"
        return httpx.Response(200, json=_sample_contacts_payload())

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/kpis/leads/estados",
        headers={"Authorization": "Bearer stubtoken"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["canales"] == ["whatsapp"]
    assert payload["total_contactos"] == 4  # Contacto duplicado y uno sin ubicación
    assert payload["total_ubicados"] == 3
    assert payload["sin_ubicacion"] == 1
    assert payload["totales_por_canal"] == {"whatsapp": 4}
    assert payload["sin_ubicacion_por_canal"] == {"whatsapp": 1}

    estados = {item["cve_ent"]: item for item in payload["items"]}
    # Ciudad de México, Nuevo León, Jalisco
    assert estados["09"]["total"] == 1
    assert estados["19"]["total"] == 1
    assert estados["14"]["total"] == 1
    assert estados["09"]["por_canal"] == {"whatsapp": 1}


@pytest.mark.asyncio
async def test_leads_by_municipality_filters_state(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    async def fake_sb_get(path: str, *, params=None, token=None):
        assert "/identidades_canal" in path
        assert params and params.get("canal") == "eq.whatsapp"
        return httpx.Response(200, json=_sample_contacts_payload())

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/kpis/leads/estados/14/municipios",
        headers={"Authorization": "Bearer stubtoken"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["canales"] == ["whatsapp"]
    assert payload["estado"]["cve_ent"] == "14"
    assert payload["total_ubicados"] == 1
    assert payload["total_contactos"] == 1
    assert payload["sin_ubicacion"] == 0
    assert payload["totales_por_canal"] == {"whatsapp": 1}
    assert payload["sin_ubicacion_por_canal"] == {}
    municipios = payload["items"]
    assert municipios[0]["cvegeo"].startswith("14")
    assert municipios[0]["total"] == 1
    assert municipios[0]["por_canal"] == {"whatsapp": 1}


@pytest.mark.asyncio
async def test_leads_geo_states_serves_feature_collection(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/kpis/leads/geo/estados")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["geojson"]["type"] == "FeatureCollection"
    assert len(payload["geojson"]["features"]) >= 32


@pytest.mark.asyncio
async def test_leads_by_state_accepts_webchat_channel(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    async def fake_sb_get(path: str, *, params=None, token=None):
        assert "/identidades_canal" in path
        assert params and params.get("canal") == "eq.webchat"
        return httpx.Response(200, json=_sample_webchat_payload())

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/kpis/leads/estados?canales=webchat",
        headers={"Authorization": "Bearer stubtoken"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["canales"] == ["webchat"]
    assert payload["total_ubicados"] == 1
    assert payload["total_contactos"] == 1
    assert payload["totales_por_canal"] == {"webchat": 1}
    assert payload["items"][0]["cve_ent"] == "24"
    assert payload["items"][0]["nombre"] == "San Luis Potosí"
    assert payload["items"][0]["por_canal"] == {"webchat": 1}


@pytest.mark.asyncio
async def test_leads_by_state_all_channels(
    monkeypatch: pytest.MonkeyPatch, async_client: httpx.AsyncClient
) -> None:
    async def fake_sb_get(path: str, *, params=None, token=None):
        assert "/identidades_canal" in path
        assert params and params.get("canal") == "in.(whatsapp,webchat)"
        combined = _sample_contacts_payload() + _sample_webchat_payload()
        return httpx.Response(200, json=combined)

    monkeypatch.setattr(panel, "_sb_get", fake_sb_get)

    response = await async_client.get(
        "/api/kpis/leads/estados?canales=whatsapp,webchat",
        headers={"Authorization": "Bearer stubtoken"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["canales"] == ["whatsapp", "webchat"]
    assert payload["total_contactos"] == 5
    assert payload["total_ubicados"] == 4
    assert payload["sin_ubicacion"] == 1
    assert payload["totales_por_canal"] == {"whatsapp": 4, "webchat": 1}
    assert payload["sin_ubicacion_por_canal"] == {"whatsapp": 1}
    by_state = {item["cve_ent"]: item for item in payload["items"]}
    assert by_state["09"]["por_canal"] == {"whatsapp": 1}
    assert by_state["24"]["por_canal"] == {"webchat": 1}
