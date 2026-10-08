from uuid import UUID

import pytest

from app.repositories.crm import CRMRepository
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
async def test_materialize_campaign_targets_uses_one_atomic_manifest_rpc() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    captured: dict[str, object] = {}

    async def fake_rpc(function_name: str, payload: dict[str, object]):
        captured["function_name"] = function_name
        captured["payload"] = payload
        return 1427

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
    assert len(payload["p_manifest"]) == 1427
