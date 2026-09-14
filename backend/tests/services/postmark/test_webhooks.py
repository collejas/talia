from uuid import UUID, uuid4

import pytest

from app.services.postmark.webhooks import process_postmark_event


class WebhookRepository:
    def __init__(self):
        self.suppressions = []

    async def get_message_by_external_id(self, **kwargs):
        return None

    async def record_webhook_receipt(self, *, payload):
        return {"id": str(uuid4()), "processing_status": "received"}

    async def finish_webhook_receipt(self, **kwargs):
        return None

    async def upsert_suppression(self, *, payload):
        self.suppressions.append(payload)


@pytest.mark.asyncio
async def test_subscription_change_unsubscribe_creates_local_suppression():
    repository = WebhookRepository()

    result = await process_postmark_event(
        repository=repository,
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        server_id=uuid4(),
        message_stream="broadcast",
        payload={
            "RecordType": "SubscriptionChange",
            "MessageID": str(uuid4()),
            "Recipient": "person@example.com",
            "Origin": "Recipient",
            "SuppressSending": True,
            "SuppressionReason": "ManualSuppression",
            "ChangedAt": "2026-09-14T03:00:00Z",
        },
        trace_id="test-unsubscribe",
    )

    assert result["event_type"] == "SubscriptionChange"
    assert repository.suppressions[0]["suppression_type"] == "unsubscribe"
    assert repository.suppressions[0]["email_address"] == "person@example.com"
