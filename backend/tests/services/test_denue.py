import httpx
import pytest
from app.services.denue import DenueError
from app.services.denue import expand_denue_activity_codes
from app.services.denue import expand_state_to_municipalities
from app.services.denue import expand_targets_for_area_act
from app.services.denue import normalize_denue_place

import app.services.denue as denue_module
from app.services.denue import DenueClient


def test_build_activity_segments_preserves_higher_specificity_levels() -> None:
    assert DenueClient._build_activity_segments(None) == ("0", "0", "0", "0")
    assert DenueClient._build_activity_segments("46") == ("46", "0", "0", "0")
    assert DenueClient._build_activity_segments("464") == ("46", "464", "0", "0")
    assert DenueClient._build_activity_segments("4641") == ("46", "464", "4641", "0")
    assert DenueClient._build_activity_segments("46411") == ("46", "464", "4641", "46411")
    assert DenueClient._build_activity_segments("464112") == ("46", "464", "4641", "464112")


def test_build_activity_segments_ignores_non_digits() -> None:
    assert DenueClient._build_activity_segments(" 46-41.12 ") == ("46", "464", "4641", "464112")


def test_expand_denue_activity_codes_expands_sector_range() -> None:
    assert expand_denue_activity_codes(["48-49"]) == ["48", "49"]


def test_normalize_denue_place_materializes_address_columns() -> None:
    normalized = normalize_denue_place(
        {
            "Id": "ABC123",
            "Nombre": "Talia MX",
            "Razon_social": "Tal IA MX SA de CV",
            "Clase_actividad": "Consultoria",
            "Estrato": "micro",
            "Telefono": "55 1234 5678",
            "Correo_e": "hola@example.com",
            "Sitio_internet": "https://talia.mx",
            "Tipo_vialidad": "Avenida",
            "Nombre_vialidad": "Juarez",
            "Numero_exterior": "100",
            "Numero_interior": "Int 2",
            "Colonia": "Centro",
            "CP": "20000",
            "Cve_ent": "01",
            "Entidad": "Aguascalientes",
            "Cve_mun": "001",
            "Municipio": "Jesus Maria",
            "Cve_loc": "0001",
            "Localidad": "Aguascalientes",
            "Cvegeo": "010010001",
            "Asentamiento": "Urbano",
            "Entre_calles": "Madero y Allende",
            "Referencia": "Frente al jardin",
            "Latitud": "21.885",
            "Longitud": "-102.291",
            "Ubicacion": "https://maps.example/test",
        }
    )

    assert normalized["address"] == "Avenida Juarez, 100 Int 2, Centro, 20000, Jesus Maria, Aguascalientes"
    assert normalized["address_full"] == normalized["address"]
    assert normalized["tipo_vialidad"] == "Avenida"
    assert normalized["nombre_vialidad"] == "Juarez"
    assert normalized["numero_exterior"] == "100"
    assert normalized["numero_interior"] == "Int 2"
    assert normalized["colonia"] == "Centro"
    assert normalized["codigo_postal"] == "20000"
    assert normalized["estado_cve"] == "01"
    assert normalized["estado_nombre"] == "Aguascalientes"
    assert normalized["municipio_cve"] == "001"
    assert normalized["municipio_nombre"] == "Jesus Maria"
    assert normalized["localidad_cve"] == "0001"
    assert normalized["localidad"] == "Aguascalientes"
    assert normalized["cvegeo"] == "010010001"
    assert normalized["asentamiento"] == "Urbano"
    assert normalized["entre_calles"] == "Madero y Allende"
    assert normalized["referencia"] == "Frente al jardin"


async def test_get_discards_shared_client_after_remote_protocol_error(monkeypatch) -> None:
    client = DenueClient(token="token", base_url="https://example.com")

    class FirstClient:
        async def get(self, url: str) -> httpx.Response:
            raise httpx.RemoteProtocolError("InformationalResponse status_code should be in range [100, 200), not 0")

    class SecondClient:
        async def get(self, url: str) -> httpx.Response:
            return httpx.Response(200, json=[{"Id": "1"}])

    first_client = FirstClient()
    second_client = SecondClient()
    denue_module._DENUE_HTTP_CLIENT = first_client  # type: ignore[assignment]

    def fake_get_denue_http_client(timeout: float) -> object:
        if denue_module._DENUE_HTTP_CLIENT is None:
            denue_module._DENUE_HTTP_CLIENT = second_client  # type: ignore[assignment]
        return denue_module._DENUE_HTTP_CLIENT

    monkeypatch.setattr(denue_module, "_get_denue_http_client", fake_get_denue_http_client)

    resp = await client._get("https://example.com/test", method="Buscar")

    assert resp.status_code == 200
    assert denue_module._DENUE_HTTP_CLIENT is second_client


@pytest.mark.anyio
async def test_request_list_splits_large_paginated_windows(monkeypatch) -> None:
    client = DenueClient(token="token", base_url="https://example.com")

    async def fake_get(url: str, *, method: str, segments: list[str] | None = None) -> httpx.Response:
        assert segments is not None
        start = int(segments[10])
        end = int(segments[11])
        if end - start + 1 > denue_module._DENUE_MIN_SPLIT_WINDOW:
            raise DenueError("denue_request_failed")
        return httpx.Response(200, json=[{"Id": f"{start}-{end}"}])

    monkeypatch.setattr(client, "_get", fake_get)

    rows = await client._request_list(
        "BuscarAreaAct",
        ["01", "0", "0", "0", "0", "61", "611", "6114", "611411", "0", "1", "50", "0"],
    )

    assert [row["Id"] for row in rows] == ["1-25", "26-50"]


@pytest.mark.anyio
async def test_request_list_splits_large_windows_for_remote_protocol_error(monkeypatch) -> None:
    client = DenueClient(token="token", base_url="https://example.com")

    async def fake_get(url: str, *, method: str, segments: list[str] | None = None) -> httpx.Response:
        assert segments is not None
        start = int(segments[10])
        end = int(segments[11])
        if end - start + 1 > denue_module._DENUE_MIN_SPLIT_WINDOW:
            raise DenueError("denue_remote_protocol_error")
        return httpx.Response(200, json=[{"Id": f"{start}-{end}"}])

    monkeypatch.setattr(client, "_get", fake_get)

    rows = await client._request_list(
        "BuscarAreaAct",
        ["24", "001", "0", "0", "0", "48", "484", "4849", "0", "0", "1", "50", "0"],
    )

    assert [row["Id"] for row in rows] == ["1-25", "26-50"]


@pytest.mark.anyio
async def test_request_list_treats_known_remote_protocol_error_as_empty_for_small_area_windows(monkeypatch) -> None:
    client = DenueClient(token="token", base_url="https://example.com")

    async def fake_get(url: str, *, method: str, segments: list[str] | None = None) -> httpx.Response:
        raise DenueError("denue_remote_protocol_error")

    monkeypatch.setattr(client, "_get", fake_get)

    rows = await client._request_list(
        "BuscarAreaAct",
        ["01", "0", "0", "0", "0", "61", "611", "6111", "611141", "0", "1", "15", "0"],
    )

    assert rows == []


def test_expand_state_to_municipalities_returns_aguscalientes_municipalities() -> None:
    targets = expand_state_to_municipalities("01")

    assert targets
    assert all(state == "01" and municipality for state, municipality in targets)
    assert len(targets) >= 11


def test_expand_targets_for_area_act_expands_aguascalientes_state_only() -> None:
    targets = expand_targets_for_area_act([("01", None), ("24", None), ("01", "001")])

    assert ("24", None) in targets
    assert ("01", "001") in targets
    assert ("01", None) not in targets
    assert all(pair[0] != "01" or pair[1] is not None for pair in targets)


def test_coerce_rows_treats_zero_count_dict_as_empty() -> None:
    assert DenueClient._coerce_rows({"total": 0}, method="BuscarAreaAct", url="https://example.com") == []
    assert DenueClient._coerce_rows({}, method="BuscarAreaAct", url="https://example.com") == []


def test_coerce_rows_raises_on_real_error_message() -> None:
    with pytest.raises(DenueError, match="denue_error"):
        DenueClient._coerce_rows({"message": "denue_error"}, method="BuscarAreaAct", url="https://example.com")
