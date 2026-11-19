from uuid import UUID

import pytest

from app.repositories.crm import CRMRepository


@pytest.mark.asyncio
async def test_contact_envio_lookup_chunks_large_conversion_map_audience(monkeypatch):
    repository = CRMRepository.__new__(CRMRepository)
    calls = []

    class Response:
        def __init__(self, rows):
            self.rows = rows

        def json(self):
            return self.rows

    async def fake_request(method, path, *, params):
        assert method == "GET"
        assert path == "/rest/v1/prospeccion_contacto_envio"
        assert params["organizacion_id"] == "eq.11111111-1111-1111-1111-111111111111"
        calls.append(params)
        return Response([{"id": str(len(calls))}])

    monkeypatch.setattr(repository, "_request", fake_request)
    envio_ids = [str(UUID(int=index + 1)) for index in range(215)]
    rows = await repository.list_contact_envios_by_ids(
        organizacion_id=UUID("11111111-1111-1111-1111-111111111111"),
        envio_ids=envio_ids + envio_ids[:5],
    )

    assert len(rows) == 3
    assert [int(call["limit"]) for call in calls] == [100, 100, 15]
    assert all(len(call["id"]) < 5000 for call in calls)
