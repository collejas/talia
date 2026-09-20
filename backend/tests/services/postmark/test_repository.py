from uuid import UUID

import pytest

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
