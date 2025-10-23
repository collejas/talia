"""Fixtures compartidas para las pruebas."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture(name="async_client")
async def fixture_async_client() -> AsyncClient:
    """Retorna un cliente asíncrono contra la app principal utilizando ASGITransport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
