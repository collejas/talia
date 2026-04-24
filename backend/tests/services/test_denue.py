import httpx

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
