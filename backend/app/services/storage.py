"""Punto de entrada para acceso a almacenamiento (Supabase/Postgres)."""
from typing import Any


class StorageClient:
    """Placeholder para un cliente de almacenamiento."""

    def __init__(self, dsn: str | None) -> None:
        self.dsn = dsn

    async def save_event(self, payload: dict[str, Any]) -> None:
        _ = (self.dsn, payload)  # Implementación pendiente


async def get_storage_client() -> StorageClient:
    """Retorna una instancia temporal sin conexión real."""
    return StorageClient(dsn=None)
