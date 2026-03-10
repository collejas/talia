import uuid

import pytest

from app.services import brevo as brevo_service


class RepoStub:
    def __init__(self) -> None:
        envio_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        prospecto_id = uuid.uuid4()
        self.envios = {
            "brevo-1": {
                "id": str(envio_id),
                "detalle": {},
                "estado": "enviado",
                "batch_id": str(batch_id),
                "prospecto_id": str(prospecto_id),
            }
        }
        self.updates: list[tuple[str, dict]] = []
        self.logs: list[dict] = []
        self.synced: list[uuid.UUID] = []
        self.duplicate_keys: set[tuple[str, str, str, str, str | None]] = set()

    async def worker_get_envio_by_mensaje(self, mensaje_id: str):
        return self.envios.get(mensaje_id)

    async def worker_complete_envio(self, *, envio_id: uuid.UUID, payload: dict):
        self.updates.append((str(envio_id), payload))
        return payload

    async def worker_insert_contact_logs(self, entries):
        self.logs.extend(entries)

    async def worker_sync_batch_status(self, *, batch_id: uuid.UUID):
        self.synced.append(batch_id)
        return "completado"

    async def worker_get_prospecto(self, *, prospecto_id: uuid.UUID):
        return {"id": str(prospecto_id)}

    async def worker_has_brevo_log_event(
        self,
        *,
        envio_id: uuid.UUID,
        estado: str,
        message_id: str,
        event_name: str,
        event_date: str | None = None,
    ) -> bool:
        key = (str(envio_id), estado, message_id, event_name.strip().lower(), event_date)
        return key in self.duplicate_keys


@pytest.mark.anyio
async def test_process_brevo_events_updates_envio(monkeypatch):
    repo = RepoStub()

    published: list[tuple[str, dict]] = []

    async def fake_publish(batch_id: str, payload: dict):
        published.append((batch_id, payload))

    monkeypatch.setattr(brevo_service.progress_hub, "publish", fake_publish)
    increments: list[tuple[str, str]] = []
    monkeypatch.setattr(
        brevo_service.metrics,
        "increment",
        lambda canal, estado: increments.append((canal, estado)),
    )

    processed = await brevo_service.process_brevo_events(
        repo=repo,
        events=[{"event": "delivered", "message-id": "brevo-1", "email": "demo@example.com"}],
    )

    assert processed == 1
    assert repo.updates[0][1]["estado"] == "entregado"
    assert repo.logs[0]["estado"] == "entregado"
    assert increments == [("correo", "entregado")]
    assert published and published[0][1]["estado"] == "entregado"


@pytest.mark.anyio
async def test_process_brevo_events_ignores_unknown(monkeypatch):
    repo = RepoStub()

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(brevo_service.progress_hub, "publish", _noop)

    def _noop_metric(*args, **kwargs):
        return None

    monkeypatch.setattr(brevo_service.metrics, "increment", _noop_metric)

    processed = await brevo_service.process_brevo_events(
        repo=repo,
        events=[{"event": "custom", "message-id": "brevo-1"}],
    )
    assert processed == 0
    assert not repo.updates


@pytest.mark.anyio
async def test_process_brevo_events_deferred_does_not_requeue(monkeypatch):
    repo = RepoStub()

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(brevo_service.progress_hub, "publish", _noop)
    monkeypatch.setattr(brevo_service.metrics, "increment", lambda *args, **kwargs: None)

    processed = await brevo_service.process_brevo_events(
        repo=repo,
        events=[{"event": "deferred", "message-id": "brevo-1", "email": "demo@example.com"}],
    )

    assert processed == 1
    assert repo.updates[0][1]["estado"] == "enviado"
    assert repo.logs[0]["estado"] == "enviado"


@pytest.mark.anyio
async def test_process_brevo_events_blocks_state_regression(monkeypatch):
    repo = RepoStub()
    repo.envios["brevo-1"]["estado"] = "entregado"

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(brevo_service.progress_hub, "publish", _noop)
    monkeypatch.setattr(brevo_service.metrics, "increment", lambda *args, **kwargs: None)

    processed = await brevo_service.process_brevo_events(
        repo=repo,
        events=[{"event": "deferred", "message-id": "brevo-1", "email": "demo@example.com"}],
    )

    assert processed == 0
    assert not repo.updates
    assert not repo.logs


@pytest.mark.anyio
async def test_process_brevo_events_skips_duplicates(monkeypatch):
    repo = RepoStub()
    envio_id = uuid.UUID(str(repo.envios["brevo-1"]["id"]))
    repo.duplicate_keys.add(
        (
            str(envio_id),
            "entregado",
            "brevo-1",
            "delivered",
            "2026-03-10 18:00:00",
        )
    )

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(brevo_service.progress_hub, "publish", _noop)
    monkeypatch.setattr(brevo_service.metrics, "increment", lambda *args, **kwargs: None)

    processed = await brevo_service.process_brevo_events(
        repo=repo,
        events=[
            {
                "event": "delivered",
                "message-id": "brevo-1",
                "email": "demo@example.com",
                "date": "2026-03-10 18:00:00",
            }
        ],
    )

    assert processed == 0
    assert not repo.updates
    assert not repo.logs
