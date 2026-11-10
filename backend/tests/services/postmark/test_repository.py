from uuid import UUID
from unittest.mock import AsyncMock

import pytest

from app.repositories.crm import CRMRepository
from app.repositories.crm import CRMRepositoryError
from app.services.postmark.repository import PostmarkRepository


@pytest.mark.asyncio
async def test_queue_messages_bulk_splits_rpc_without_changing_item_order() -> None:
    repository = PostmarkRepository.__new__(PostmarkRepository)
    calls: list[int] = []

    async def fake_rpc(function_name: str, payload: dict[str, object]):
        assert function_name == "tenant_email_queue_messages_bulk"
        chunk = payload["p_items"]
        assert isinstance(chunk, list)
        calls.append(len(chunk))
        return [{"idempotency_key": item["idempotency_key"]} for item in chunk]

    repository._rpc = fake_rpc
    items = [{"idempotency_key": f"key-{index}"} for index in range(121)]

    result = await repository.queue_messages_bulk(
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        items=items,
    )

    assert calls == [50, 50, 21]
    assert [row["idempotency_key"] for row in result] == [item["idempotency_key"] for item in items]


@pytest.mark.asyncio
async def test_materialize_campaign_targets_uses_bounded_idempotent_chunks() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    captured: dict[str, object] = {}
    sizes: list[int] = []

    async def fake_rpc(function_name: str, payload: dict[str, object]):
        captured["function_name"] = function_name
        captured["payload"] = payload
        sizes.append(len(payload["p_manifest"]))
        return len(payload["p_manifest"])

    repository._rpc = fake_rpc
    organization_id = UUID("00000000-0000-0000-0000-000000000001")
    batch_id = UUID("11111111-1111-1111-1111-111111111111")
    manifest = [
        {
            "batch_id": str(batch_id),
            "prospecto_id": str(UUID(int=index + 1)),
            "canal": "correo",
            "ordinal": index,
        }
        for index in range(1427)
    ]

    result = await repository.worker_materialize_postmark_campaign_targets(
        organizacion_id=organization_id,
        batch_id=batch_id,
        manifest=manifest,
    )

    assert result == 1427
    assert captured["function_name"] == "worker_materialize_postmark_campaign_targets"
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["p_organizacion_id"] == str(organization_id)
    assert payload["p_batch_id"] == str(batch_id)
    assert sizes == [50] * 28 + [27]
    assert len(payload["p_manifest"]) == 27


@pytest.mark.asyncio
async def test_materialization_retry_preserves_committed_targets() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    persisted: set[int] = set()
    fail_once = True

    async def fake_rpc(function_name, payload):
        nonlocal fail_once
        chunk = payload['p_manifest']
        if chunk[0]['ordinal'] == 50 and fail_once:
            fail_once = False
            raise CRMRepositoryError('timeout')
        before = len(persisted)
        persisted.update(row['ordinal'] for row in chunk)
        return len(persisted) - before

    repository._rpc = fake_rpc
    kwargs = dict(
        organizacion_id=UUID(int=1), batch_id=UUID(int=2),
        manifest=[{'ordinal': i} for i in range(121)],
    )
    with pytest.raises(CRMRepositoryError):
        await repository.worker_materialize_postmark_campaign_targets(**kwargs)
    assert len(persisted) == 50
    assert await repository.worker_materialize_postmark_campaign_targets(**kwargs) == 71
    assert len(persisted) == 121


@pytest.mark.asyncio
async def test_worker_sync_batch_status_marks_completed_with_errors() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    repository.worker_get_contact_batch = AsyncMock(
        return_value={"preparacion_estado": "completada"}
    )

    async def fake_count(*, batch_id, estados):
        return 3 if "error" in estados else 0

    repository._count_batch_envios = fake_count
    captured: dict[str, object] = {}

    async def fake_request(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs["json"]

    repository._request = fake_request

    result = await repository.worker_sync_batch_status(batch_id=UUID(int=1))

    assert result == "error"
    assert captured["json"]["estado"] == "error"
