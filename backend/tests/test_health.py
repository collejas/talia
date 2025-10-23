"""Pruebas del endpoint `/health`."""

from httpx import AsyncClient


async def test_health_returns_ok(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
