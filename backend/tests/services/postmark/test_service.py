from uuid import UUID, uuid4

import pytest

from app.integrations.postmark.errors import PostmarkError, PostmarkRequestError
from app.integrations.postmark.schemas import PostmarkMessage, PostmarkSendResult
from app.services.postmark.service import PostmarkService


class FakeRepository:
    def __init__(self, *, suppressed: bool = False):
        self.suppressed = suppressed

    async def get_migration(self, *, organizacion_id):
        return {"id": str(uuid4()), "feature_enabled": True, "status": "active"}

    async def get_verified_domain(self, *, organizacion_id):
        return {"id": str(uuid4()), "domain_name": "geoactiv.mx", "status": "verified"}

    async def get_active_plan(self, *, organizacion_id):
        return {"id": str(uuid4()), "status": "active"}

    async def is_suppressed(self, *, organizacion_id, email_address):
        return self.suppressed


def message(**overrides):
    values = {
        "from_email": "noreply@geoactiv.mx",
        "to_email": "client@example.com",
        "subject": "Aviso",
        "text_body": "Contenido",
    }
    values.update(overrides)
    return PostmarkMessage(**values)


@pytest.mark.asyncio
async def test_validate_send_requires_own_verified_domain():
    service = PostmarkService(repository=FakeRepository())

    context = await service.validate_send(
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        message=message(),
        message_kind="transactional",
    )

    assert context.domain_name == "geoactiv.mx"
    assert context.stream_name == "outbound"

    with pytest.raises(PostmarkError, match="sender_domain_not_authorized"):
        await service.validate_send(
            organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
            message=message(from_email="noreply@other.mx"),
            message_kind="transactional",
        )


@pytest.mark.asyncio
async def test_validate_send_blocks_suppressed_recipient():
    service = PostmarkService(repository=FakeRepository(suppressed=True))

    with pytest.raises(PostmarkError, match="recipient_suppressed"):
        await service.validate_send(
            organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
            message=message(),
            message_kind="transactional",
        )


@pytest.mark.asyncio
async def test_broadcast_requires_explicit_tag():
    service = PostmarkService(repository=FakeRepository())

    with pytest.raises(PostmarkError, match="broadcast_tag_required"):
        await service.validate_send(
            organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
            message=message(),
            message_kind="broadcast",
        )


@pytest.mark.asyncio
async def test_deliver_queued_message_finishes_provider_attempt():
    class DeliveryRepository(FakeRepository):
        async def start_attempt(self, *, organizacion_id, message_id):
            return {
                "attempt_id": str(uuid4()),
                "from_email": "noreply@geoactiv.mx",
                "to_email": "client@example.com",
                "subject": "Aviso",
                "text_body": "Contenido",
                "message_kind": "transactional",
                "stream_name": "outbound",
                "tag": None,
            }

        async def finish_attempt(self, *, payload):
            assert payload["p_accepted"] is True
            return {"message_status": "submitted"}

    class DeliveryClient:
        async def send_message(self, message, *, message_kind, message_stream):
            assert message.to_email == "client@example.com"
            assert message_kind == "transactional"
            assert message_stream == "outbound"
            return PostmarkSendResult(
                accepted=True,
                provider_message_id=UUID("11111111-1111-1111-1111-111111111111"),
            )

    result = await PostmarkService(repository=DeliveryRepository()).deliver_queued_message(
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        message_id=uuid4(),
        client=DeliveryClient(),
    )

    assert result == {"provider_accepted": True, "state": "submitted"}


@pytest.mark.asyncio
async def test_deliver_queued_message_finishes_rejected_provider_attempt():
    class DeliveryRepository(FakeRepository):
        def __init__(self):
            super().__init__()
            self.finished_payload = None

        async def start_attempt(self, *, organizacion_id, message_id):
            return {
                "attempt_id": str(uuid4()),
                "from_email": "noreply@geoactiv.mx",
                "to_email": "administracion@geoactiv.mx",
                "subject": "Aviso",
                "text_body": "Contenido",
                "message_kind": "transactional",
                "stream_name": "outbound",
                "tag": None,
            }

        async def finish_attempt(self, *, payload):
            self.finished_payload = payload
            return {"message_status": "failed"}

    class DeliveryClient:
        async def send_message(self, message, *, message_kind, message_stream):
            raise PostmarkRequestError(
                "provider_rejected_request",
                status_code=422,
                provider_code=412,
                provider_message="Account pending approval",
            )

    repository = DeliveryRepository()
    with pytest.raises(PostmarkRequestError):
        await PostmarkService(repository=repository).deliver_queued_message(
            organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
            message_id=uuid4(),
            client=DeliveryClient(),
        )

    assert repository.finished_payload["p_accepted"] is False
    assert repository.finished_payload["p_error_code"] == "412"
    assert repository.finished_payload["p_error_message"] == "Account pending approval"


@pytest.mark.asyncio
async def test_queue_message_reserves_with_stream_selected_by_kind():
    class QueueRepository(FakeRepository):
        def __init__(self):
            super().__init__()
            self.payload = None

        async def queue_message(self, *, payload):
            self.payload = payload
            return {
                "message_id": str(uuid4()),
                "usage_period_id": str(uuid4()),
                "created": True,
                "message_status": "queued",
            }

    repository = QueueRepository()
    result = await PostmarkService(repository=repository).queue_message(
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
        message=message(tag="campana-prueba"),
        message_kind="broadcast",
        idempotency_key="campaign-1-recipient-1",
    )

    assert repository.payload["p_message_kind"] == "broadcast"
    assert repository.payload["p_stream_name"] == "broadcasts"
    assert repository.payload["p_idempotency_key"] == "campaign-1-recipient-1"
    assert result["message_status"] == "queued"
    assert result["stream_name"] == "broadcasts"
