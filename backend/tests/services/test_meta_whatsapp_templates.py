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


@pytest.mark.asyncio
async def test_meta_whatsapp_template_client_builds_components(monkeypatch):
    captured = {}

    async def fake_request(self, method, resource, *, json_payload=None, params=None, operation):
        captured["json"] = json_payload
        return {"id": "META_TEMPLATE_ID"}

    monkeypatch.setattr(MetaWhatsAppTemplateClient, "_request", fake_request)
    client = MetaWhatsAppTemplateClient(access_token="token")

    await client.create_template(
        waba_id="WABA_ID",
        name="con_foto",
        language_code="es_MX",
        category="marketing",
        body_text="Hola {{1}}",
        header_format="image",
        header_handle="4::sample-handle",
        footer_text="Responde para continuar",
        buttons=[
            {"tipo": "quick_reply", "texto": "Me interesa"},
            {"tipo": "url", "texto": "Ver oferta", "url": "https://talia.mx/oferta"},
        ],
    )

    assert captured["json"]["components"] == [
        {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": ["4::sample-handle"]}},
        {"type": "BODY", "text": "Hola {{1}}"},
        {"type": "FOOTER", "text": "Responde para continuar"},
        {"type": "BUTTONS", "buttons": [
            {"type": "QUICK_REPLY", "text": "Me interesa"},
            {"type": "URL", "text": "Ver oferta", "url": "https://talia.mx/oferta"},
        ]},
    ]


@pytest.mark.asyncio
async def test_meta_whatsapp_template_client_uploads_media(monkeypatch):
    requests = []

    async def fake_request(self, method, resource, *, json_payload=None, params=None, operation):
        requests.append((method, resource, params, operation))
        return {"id": "SESSION_ID"}

    async def fake_binary(self, method, resource, *, content, headers, operation):
        requests.append((method, resource, headers, operation))
        return {"h": "4::sample-handle"}

    monkeypatch.setattr(MetaWhatsAppTemplateClient, "_request", fake_request)
    monkeypatch.setattr(MetaWhatsAppTemplateClient, "_request_binary", fake_binary)
    client = MetaWhatsAppTemplateClient(access_token="token", app_id="APP_ID")

    handle = await client.upload_template_media(content=b"fake-image", mime_type="image/png")

    assert handle == "4::sample-handle"
    assert requests == [
        ("POST", "APP_ID/uploads", {"file_length": "10", "file_type": "image/png"}, "media_session"),
        ("POST", "SESSION_ID", {"Content-Type": "image/png", "file_offset": "0"}, "media_upload"),
    ]
