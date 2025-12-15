"""Pruebas unitarias para el servicio de voz."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest

from app.channels.voice import schemas, service


class DummyRepo:
    """Repositorio simulado para verificar interacciones."""

    def __init__(self, envio_id: str, batch_id: str) -> None:
        self._envio = {
            "id": envio_id,
            "prospecto_id": "44444444-4444-4444-4444-444444444444",
            "batch_id": batch_id,
            "detalle": {"prev": "info"},
        }
        self.complete_calls: list[tuple[UUID, dict[str, Any]]] = []
        self.log_entries: list[dict[str, Any]] = []
        self.synced_batch: UUID | None = None

    async def worker_get_envio_by_mensaje(self, mensaje_id: str):
        assert mensaje_id
        return self._envio

    async def worker_complete_envio(self, envio_id: UUID, payload: dict[str, Any]):
        self.complete_calls.append((envio_id, payload))

    async def worker_insert_contact_logs(self, entries: list[dict[str, Any]]):
        self.log_entries.extend(entries)

    async def worker_sync_batch_status(self, *, batch_id: UUID):
        self.synced_batch = batch_id

    async def worker_get_prospecto(self, *, prospecto_id: UUID):
        assert str(prospecto_id) == self._envio["prospecto_id"]
        return {"id": str(prospecto_id)}


@pytest.mark.asyncio
async def test_sync_envio_status_from_voice_completed(monkeypatch) -> None:
    """Actualiza a entregado sin disparar sincronización de batch."""

    envio_id = "55555555-5555-5555-5555-555555555555"
    batch_id = "66666666-6666-6666-6666-666666666666"
    repo = DummyRepo(envio_id=envio_id, batch_id=batch_id)

    monkeypatch.setattr(service, "CRMRepository", lambda: repo)

    callback = schemas.VoiceStatusCallback(
        call_sid=envio_id,
        call_status="completed",
        direction="outbound-api",
    )
    await service._sync_envio_status_from_voice(callback)

    assert repo.complete_calls, "Debe actualizar el envío"
    envio_uuid, payload = repo.complete_calls[0]
    assert envio_uuid == UUID(envio_id)
    assert payload["estado"] == "entregado"
    assert payload["detalle"]["status"] == "completed"
    assert repo.log_entries and repo.log_entries[0]["estado"] == "entregado"
    assert repo.synced_batch is None


@pytest.mark.asyncio
async def test_sync_envio_status_from_voice_failure(monkeypatch) -> None:
    """Errores de llamada marcan el envío como fallido y sincronizan batch."""

    envio_id = "77777777-7777-7777-7777-777777777777"
    batch_id = "88888888-8888-8888-8888-888888888888"
    repo = DummyRepo(envio_id=envio_id, batch_id=batch_id)

    monkeypatch.setattr(service, "CRMRepository", lambda: repo)

    callback = schemas.VoiceStatusCallback(
        call_sid=envio_id,
        call_status="failed",
        direction="outbound-api",
    )
    await service._sync_envio_status_from_voice(callback)

    envio_uuid, payload = repo.complete_calls[0]
    assert payload["estado"] == "fallido"
    assert repo.log_entries[0]["estado"] == "fallido"
    assert repo.synced_batch == UUID(batch_id)
