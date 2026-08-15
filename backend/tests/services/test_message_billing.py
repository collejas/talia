from __future__ import annotations

from typing import Any

import pytest

from app.services.message_billing import extract_meta_pricing_fields, register_message_consumption


class FakeRepository:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def register_billing_message(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {"duplicado": False, "cargo_app_importe": 0.09}


@pytest.mark.asyncio
async def test_registers_meta_message_with_explicit_billing_fields() -> None:
    repo = FakeRepository()

    result = await register_message_consumption(
        repo=repo,  # type: ignore[arg-type]
        organizacion_id="tenant-1",
        mensaje_id="message-1",
        proveedor_mensaje_id="wamid-1",
        direccion="saliente",
        metadata={
            "provider": "meta",
            "delivery_status": "accepted",
            "es_plantilla": True,
            "template_name": "demo_template",
            "template_language": "es_MX",
        },
    )

    assert result == {"duplicado": False, "cargo_app_importe": 0.09}
    assert repo.calls == [
        {
            "organizacion_id": "tenant-1",
            "mensaje_id": "message-1",
            "proveedor": "meta",
            "canal": "whatsapp",
            "proveedor_mensaje_id": "wamid-1",
                "estado_proveedor": "accepted",
                "categoria_meta": "unknown",
                "categoria_meta_configurada": None,
                "tipo_pricing_meta": None,
            "billable_meta": None,
            "es_plantilla": True,
            "nombre_plantilla": "demo_template",
            "idioma_plantilla": "es_MX",
            "fuente_registro": "whatsapp_message_registration",
            "fecha_evento": None,
        }
    ]


@pytest.mark.asyncio
async def test_detects_meta_from_incoming_cloud_api_payload_without_storing_payload() -> None:
    repo = FakeRepository()

    await register_message_consumption(
        repo=repo,  # type: ignore[arg-type]
        organizacion_id="tenant-1",
        mensaje_id="message-2",
        proveedor_mensaje_id="wamid-2",
        direccion="entrante",
        webhook_payload={"entry": [{"changes": [{"value": {}}]}]},
    )

    assert repo.calls[0]["proveedor"] == "meta"
    assert "webhook_payload" not in repo.calls[0]


@pytest.mark.asyncio
async def test_detects_meta_from_wamid_when_outbound_metadata_is_missing() -> None:
    repo = FakeRepository()

    await register_message_consumption(
        repo=repo,  # type: ignore[arg-type]
        organizacion_id="tenant-1",
        mensaje_id="message-wamid",
        proveedor_mensaje_id="wamid.HBg123",
        direccion="saliente",
    )

    assert repo.calls[0]["proveedor"] == "meta"


@pytest.mark.asyncio
async def test_skips_message_without_provider_identity() -> None:
    repo = FakeRepository()

    result = await register_message_consumption(
        repo=repo,
        organizacion_id="tenant-1",
        mensaje_id="message-3",
        proveedor_mensaje_id=None,
        direccion="entrante",
    )

    assert result is None
    assert repo.calls == []


def test_extracts_meta_pricing_columns_only() -> None:
    assert extract_meta_pricing_fields(
        {
            "status": {
                "pricing": {
                    "billable": True,
                    "pricing_model": "CBP",
                    "category": "marketing",
                    "unrelated_provider_field": "ignored",
                }
            }
        }
    ) == {
        "categoria_meta": "marketing",
        "tipo_pricing_meta": "CBP",
        "billable_meta": True,
    }
