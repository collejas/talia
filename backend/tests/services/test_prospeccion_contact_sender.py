from app.services.prospeccion_contact_sender import (
    ContactEnvioResult,
    ProspeccionContactSender,
    _apply_tenant_public_base_url_defaults,
    _build_booking_url,
    _build_twilio_numeric_variables_from_body,
    _compose_twilio_template_variables,
    _find_blank_twilio_variables,
    _render_twilio_variables,
)
from uuid import UUID
from urllib.parse import parse_qs, urlparse

import pytest

import app.services.prospeccion_contact_sender as sender_module


def test_render_twilio_variables_keeps_literal_text_for_variable_6() -> None:
    rendered = _render_twilio_variables(
        {"6": "Vendes por redes sociales? Puedo ayudarte 24/7."},
        {"nombre": "Jorge", "nombre_ia": "Tal-IA"},
    )

    assert rendered == {"6": "Vendes por redes sociales? Puedo ayudarte 24/7."}
    assert _find_blank_twilio_variables(rendered) == []


def test_render_twilio_variables_still_resolves_known_aliases() -> None:
    rendered = _render_twilio_variables(
        {"1": "nombre", "2": "nombre_ia"},
        {"nombre": "Jorge", "nombre_ia": "Tal-IA"},
    )

    assert rendered == {"1": "Jorge", "2": "Tal-IA"}


def test_render_twilio_variables_does_not_keep_literal_text_for_non_6_keys() -> None:
    rendered = _render_twilio_variables(
        {"7": "Texto libre que no debe pasar para otras variables"},
        {"nombre": "Jorge", "nombre_ia": "Tal-IA"},
    )

    assert rendered == {"7": ""}
    assert _find_blank_twilio_variables(rendered) == ["7"]


def test_build_twilio_numeric_variables_from_body_keeps_unknown_as_blank() -> None:
    rendered = _build_twilio_numeric_variables_from_body(
        body="Hola {{1}} {{6}}",
        context={"nombre": "Jorge"},
    )

    assert rendered == {"1": "Jorge", "6": ""}
    assert _find_blank_twilio_variables(rendered) == ["6"]


def test_compose_twilio_variables_keeps_var6_literal_and_autofills_var1() -> None:
    rendered = _compose_twilio_template_variables(
        definition={"6": "Texto libre para CTA"},
        body="Hola {{1}}. {{6}}",
        context={"nombre": "Jorge"},
    )

    assert rendered == {"1": "Jorge", "6": "Texto libre para CTA"}


def test_compose_twilio_variables_explicit_overrides_inferred_value() -> None:
    rendered = _compose_twilio_template_variables(
        definition={"1": "nombre_ia"},
        body="Hola {{1}}",
        context={"nombre": "Jorge", "nombre_ia": "Tal-IA"},
    )

    assert rendered == {"1": "Tal-IA"}


def test_build_booking_url_uses_demo_default_and_tracking_params() -> None:
    payload = {
        "metadata": {
            "campana_id": "11111111-1111-1111-1111-111111111111",
            "template_id": "22222222-2222-2222-2222-222222222222",
        }
    }
    booking_url = _build_booking_url(
        context={"segmento": "inmobiliario"},
        payload=payload,
        envio_id="33333333-3333-3333-3333-333333333333",
        prospecto_id="44444444-4444-4444-4444-444444444444",
    )

    parsed = urlparse(booking_url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "talia.mx"
    assert parsed.path == "/demo.html"
    assert query.get("utm_source") == ["prospeccion"]
    assert query.get("utm_medium") == ["email"]
    assert query.get("cid") == ["11111111-1111-1111-1111-111111111111"]
    assert query.get("tid") == ["22222222-2222-2222-2222-222222222222"]
    assert query.get("eid") == ["33333333-3333-3333-3333-333333333333"]
    assert query.get("pid") == ["44444444-4444-4444-4444-444444444444"]
    assert query.get("intent") == ["demo_booking"]


def test_build_booking_url_respects_booking_base_and_existing_query() -> None:
    payload = {
        "metadata": {
            "booking_base_url": "https://agenda.talia.mx/reservar?source=mail&utm_medium=custom",
            "campana_id": "11111111-1111-1111-1111-111111111111",
        }
    }
    booking_url = _build_booking_url(
        context={"segmento": "retail"},
        payload=payload,
        tracking_url="https://talia.mx/?utm_source=prospeccion&utm_medium=email&utm_campaign=cold_outreach&eid=555",
    )

    parsed = urlparse(booking_url)
    query = parse_qs(parsed.query)
    assert parsed.netloc == "agenda.talia.mx"
    assert parsed.path == "/reservar"
    assert query.get("source") == ["mail"]
    assert query.get("utm_medium") == ["custom"]
    assert query.get("utm_source") == ["prospeccion"]
    assert query.get("utm_campaign") == ["cold_outreach"]


def test_build_booking_url_includes_tenant_context_when_available() -> None:
    payload = {
        "metadata": {
            "tenant_alias": "geoactiv",
            "organizacion_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }
    }
    booking_url = _build_booking_url(
        context={},
        payload=payload,
        tracking_url="https://talia.mx/?utm_source=prospeccion",
    )
    query = parse_qs(urlparse(booking_url).query)
    assert query.get("ta") == ["geoactiv"]
    assert query.get("oid") == ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]


def test_apply_tenant_public_base_url_defaults_promotes_public_domain() -> None:
    payload = {"metadata": {"campana_id": "11111111-1111-1111-1111-111111111111"}}
    effective_payload = _apply_tenant_public_base_url_defaults(
        payload,
        "https://pui.geoactiv.mx",
    )

    metadata = effective_payload["metadata"]
    assert metadata["tracking_base_url"] == "https://pui.geoactiv.mx"
    assert metadata["booking_base_url"] == "https://pui.geoactiv.mx"
    assert metadata["website_url"] == "https://pui.geoactiv.mx"
    assert metadata["dominio_principal"] == "https://pui.geoactiv.mx"
    assert metadata["sitio_web"] == "https://pui.geoactiv.mx"

    booking_url = _build_booking_url(
        context={"segmento": "pui"},
        payload=effective_payload,
        tracking_url="https://pui.geoactiv.mx/?utm_source=prospeccion",
    )

    parsed = urlparse(booking_url)
    assert parsed.netloc == "pui.geoactiv.mx"
    assert parsed.path == "/demo.html"


@pytest.mark.asyncio
async def test_campaign_whatsapp_uses_meta_transport_directly(monkeypatch) -> None:
    calls = []

    async def fake_meta_send(**kwargs):
        calls.append(kwargs)
        return sender_module.TwilioSendResult(
            sid="wamid.test",
            status="sent",
            provider="meta",
        )

    monkeypatch.setattr(sender_module, "_send_meta_whatsapp_reply", fake_meta_send)

    result = await sender_module._send_whatsapp_message(
        to_number="5215555555555",
        body="Hola",
        content_sid="HISTORICAL_TWILIO_SID",
        template_name="foto_1",
        template_language="es_MX",
    )

    assert result.provider == "meta"
    assert result.sid == "wamid.test"
    assert calls[0]["template_name"] == "foto_1"
    assert calls[0]["template_language"] == "es_MX"
    assert calls[0]["content_sid"] is None


@pytest.mark.asyncio
async def test_postmark_prospeccion_queues_without_loading_legacy_provider(monkeypatch) -> None:
    calls = {}

    class FakePostmarkRepository:
        async def get_verified_domain(self, *, organizacion_id):
            return {
                "default_from_email": "talia@talia.mx",
                "default_from_name": "Tal-IA",
                "reply_to_email": "talia@talia.mx",
            }

    class FakePostmarkService:
        def __init__(self, *, repository):
            calls["repository"] = repository

        async def queue_message(self, **kwargs):
            calls["message"] = kwargs["message"]
            calls["kind"] = kwargs["message_kind"]
            calls["idempotency_key"] = kwargs["idempotency_key"]
            calls["template_id"] = kwargs["template_id"]
            return {"message_id": "11111111-1111-1111-1111-111111111111", "stream_name": "outbound"}

    monkeypatch.setattr(sender_module, "PostmarkRepository", FakePostmarkRepository)
    monkeypatch.setattr(sender_module, "PostmarkService", FakePostmarkService)

    result = await sender_module._queue_postmark_prospeccion_email(
        envio={
            "id": "22222222-2222-2222-2222-222222222222",
            "prospecto_id": "33333333-3333-3333-3333-333333333333",
            "email": "prospecto@example.com",
        },
        payload={
            "template_id": "44444444-4444-4444-4444-444444444444",
            "email_message_kind": "broadcast",
            "metadata": {"template_slug": "demo-inicial"},
        },
        subject="Hola",
        body="Contenido",
        body_html="<p>Contenido</p>",
        organizacion_id=UUID("00000000-0000-0000-0000-000000000001"),
    )

    assert result.estado == "enviado"
    assert result.mensaje_id_interno == "11111111-1111-1111-1111-111111111111"
    assert calls["kind"] == "broadcast"
    assert calls["message"].from_email == "talia@talia.mx"
    assert calls["template_id"] is None
    assert calls["idempotency_key"] == "prospeccion-envio:22222222-2222-2222-2222-222222222222"


def test_build_envio_update_payload_persists_local_and_provider_message_ids() -> None:
    sender = ProspeccionContactSender()

    payload = sender._build_envio_update_payload(
        envio={"detalle": {}},
        envio_id="11111111-1111-1111-1111-111111111111",
        result=ContactEnvioResult(
            estado="enviado",
            detalle={"email": "collejas1@gmail.com"},
            mensaje_id="brevo-123@smtp-relay.sendinblue.com",
            mensaje_id_interno="local-123@sinergialidera.com",
        ),
        intento=1,
        max_reintentos=3,
    )

    assert payload["mensaje_id"] == "brevo-123@smtp-relay.sendinblue.com"
    assert payload["mensaje_id_interno"] == "local-123@sinergialidera.com"
