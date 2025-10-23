"""Fixtures compartidas para las pruebas."""
import pytest
from httpx import AsyncClient

from app.main import app


@pytest.fixture(name="async_client")
async def fixture_async_client() -> AsyncClient:
    """Retorna un cliente asíncrono contra la app principal."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
