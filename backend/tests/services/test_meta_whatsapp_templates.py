import httpx
import pytest

from app.services.meta_whatsapp_templates import MetaWhatsAppTemplateClient, MetaWhatsAppTemplateError


@pytest.mark.asyncio
async def test_meta_whatsapp_template_client_builds_create_payload(monkeypatch):
    captured = {}

    async def fake_request(self, method, resource, *, json_payload=None, params=None, operation):
        captured.update(method=method, resource=resource, json_payload=json_payload, operation=operation)
        return {"id": "META_TEMPLATE_ID", "status": "PENDING"}

    monkeypatch.setattr(MetaWhatsAppTemplateClient, "_request", fake_request)
    client = MetaWhatsAppTemplateClient(access_token="token")

    response = await client.create_template(
        waba_id="WABA_ID",
        name=" Seguimiento_Demo ",
        language_code="es_MX",
        category="marketing",
        body_text="Hola {{1}}, te damos seguimiento.",
    )

    assert response["id"] == "META_TEMPLATE_ID"
    assert captured == {
        "method": "POST",
        "resource": "WABA_ID/message_templates",
        "operation": "create",
        "json_payload": {
            "name": "seguimiento_demo",
            "language": "es_MX",
            "category": "MARKETING",
            "components": [{"type": "BODY", "text": "Hola {{1}}, te damos seguimiento."}],
        },
    }


@pytest.mark.asyncio
async def test_meta_whatsapp_template_client_normalizes_rate_limit_error(monkeypatch):
    response = httpx.Response(
        429,
        json={"error": {"code": 613, "message": "Calls to this API have exceeded the rate limit."}},
        request=httpx.Request("GET", "https://graph.facebook.com/v25.0/META_TEMPLATE_ID"),
    )

    async def fake_request(self, *args, **kwargs):
        raise MetaWhatsAppTemplateClient._normalize_error(response, operation="get")

    monkeypatch.setattr(MetaWhatsAppTemplateClient, "_request", fake_request)
    client = MetaWhatsAppTemplateClient(access_token="token")

    with pytest.raises(MetaWhatsAppTemplateError) as error:
        await client.get_template(template_id="META_TEMPLATE_ID")

    assert error.value.code == "meta_template_rate_limited"
    assert error.value.retryable is True
