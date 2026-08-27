import httpx
import pytest
from uuid import UUID

from app.integrations.postmark.client import PostmarkClient
from app.integrations.postmark.errors import PostmarkRequestError
from app.integrations.postmark.schemas import PostmarkMessage


def _message() -> PostmarkMessage:
    return PostmarkMessage(
        from_email="sender@example.com",
        from_name="Talia",
        to_email="recipient@example.com",
        subject="Hola",
        text_body="Texto",
    )


@pytest.mark.asyncio
async def test_send_message_uses_stream_token_and_normalizes_result():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["token"] = request.headers["X-Postmark-Server-Token"]
        captured["json"] = request.read()
        return httpx.Response(
            200,
            json={"ErrorCode": 0, "MessageID": "11111111-1111-1111-1111-111111111111", "Message": "OK"},
        )

    client = PostmarkClient(
        base_url="https://mail.test",
        transactional_token="transactional-secret",
        transport=httpx.MockTransport(handler),
    )
    result = await client.send_message(_message(), message_kind="transactional")

    assert result.accepted is True
    assert result.provider_message_id == UUID("11111111-1111-1111-1111-111111111111")
    assert captured["url"] == "https://mail.test/email"
    assert captured["token"] == "transactional-secret"
    assert captured["json"] == (
        b'{"From": "Talia <sender@example.com>", "To": "recipient@example.com", '
        b'"Subject": "Hola", "TextBody": "Texto"}'
    )


@pytest.mark.asyncio
async def test_send_batch_keeps_individual_provider_failures():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {"ErrorCode": 0, "MessageID": "11111111-1111-1111-1111-111111111111", "Message": "OK"},
                {"ErrorCode": 406, "MessageID": "", "Message": "Inactive recipient"},
            ],
        )

    client = PostmarkClient(
        base_url="https://mail.test",
        broadcast_token="broadcast-secret",
        transport=httpx.MockTransport(handler),
    )
    result = await client.send_batch([_message(), _message()], message_kind="broadcast")

    assert [item.accepted for item in result.items] == [True, False]
    assert result.items[1].error_code == 406


@pytest.mark.asyncio
async def test_send_requires_token_without_making_request():
    client = PostmarkClient(base_url="https://mail.test", transport=httpx.MockTransport(lambda _: None))

    with pytest.raises(PostmarkRequestError, match="server_token_missing"):
        await client.send_message(_message(), message_kind="transactional")


def test_batch_rejects_more_than_provider_limit():
    client = PostmarkClient(transactional_token="secret")

    with pytest.raises(PostmarkRequestError, match="batch_size_exceeded"):
        # La validación ocurre antes de hacer cualquier petición externa.
        import asyncio

        asyncio.run(client.send_batch([_message()] * 501, message_kind="transactional"))


@pytest.mark.asyncio
async def test_create_domain_uses_account_token_and_normalizes_dns():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["token"] = request.headers["X-Postmark-Account-Token"]
        captured["path"] = request.url.path
        return httpx.Response(
            200,
            json={
                "ID": 123,
                "Name": "Example.COM",
                "DKIMPendingHost": "pm._domainkey.example.com",
                "DKIMPendingTextValue": "v=DKIM1; k=rsa; p=key",
                "ReturnPathDomain": "pm-bounces.example.com",
                "ReturnPathCNAME": "pm.mtasv.net",
                "DKIMVerified": False,
                "ReturnPathVerified": False,
            },
        )

    client = PostmarkClient(
        base_url="https://mail.test",
        account_token="account-secret",
        transport=httpx.MockTransport(handler),
    )
    result = await client.create_domain("example.com")

    assert result.external_domain_id == 123
    assert result.domain_name == "example.com"
    assert captured == {"token": "account-secret", "path": "/domains"}


@pytest.mark.asyncio
async def test_account_request_requires_account_token():
    client = PostmarkClient(base_url="https://mail.test", transport=httpx.MockTransport(lambda _: None))

    with pytest.raises(PostmarkRequestError, match="account_token_missing"):
        await client.create_domain("example.com")
