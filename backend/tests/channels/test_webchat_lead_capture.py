"""Pruebas puntuales del manejo de tool calls para captura de leads."""

from __future__ import annotations

import pytest

from app.channels.webchat import service
from app.services.storage import WebchatConversationInfo


@pytest.mark.asyncio
async def test_process_lead_capture_success_with_email_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, dict[str, object]] = {}

    async def fake_fetch_conv(_: str) -> WebchatConversationInfo:
        return WebchatConversationInfo(
            conversation_id="conv-db", session_id="sess-123", contact_id="cont-1"
        )

    async def fake_fetch_contact(_: str) -> dict[str, object]:
        return {
            "id": "cont-1",
            "nombre_completo": "Visitante Webchat",
            "correo": None,
            "telefono_e164": None,
            "contacto_datos": {"previous": "data"},
        }

    async def fake_update_contact(contact_id: str, patch: dict[str, object]) -> dict[str, object]:
        calls["update_contact"] = {"contact_id": contact_id, "patch": patch}
        return {"id": contact_id, **patch}

    async def fake_ensure_card(**kwargs) -> None:
        calls["ensure_card"] = kwargs

    monkeypatch.setattr(
        "app.channels.webchat.service.storage.fetch_webchat_conversation_info",
        fake_fetch_conv,
    )
    monkeypatch.setattr("app.channels.webchat.service.storage.fetch_contact", fake_fetch_contact)
    monkeypatch.setattr("app.channels.webchat.service.storage.update_contact", fake_update_contact)
    monkeypatch.setattr(
        "app.channels.webchat.service._lead_pipeline.ensure_card_for_conversation",
        fake_ensure_card,
    )

    call = service.ToolCall(
        id="tool-1",
        name="register_lead",
        arguments={
            "full_name": "Ana Cliente",
            "email": "ana@example.com",
            "company_name": "Ejemplo SA",
        },
    )

    result = await service._process_lead_capture_tool(
        call=call,
        talia_conversation_id="00000000-0000-0000-0000-000000000001",
    )

    assert result["status"] == "success"
    assert calls["update_contact"]["contact_id"] == "cont-1"
    patch = calls["update_contact"]["patch"]
    assert patch["nombre_completo"] == "Ana Cliente"
    assert patch["correo"] == "ana@example.com"
    assert patch["contacto_datos"]["company_name"] == "Ejemplo SA"
    assert patch["company_name"] == "Ejemplo SA"
    # No teléfono disponible, no se debe crear metadata lead_phone
    ensure_kwargs = calls["ensure_card"]
    assert ensure_kwargs["conversation_id"] == "00000000-0000-0000-0000-000000000001"
    assert ensure_kwargs["metadata"]["lead_email"] == "ana@example.com"
    assert "lead_phone" not in ensure_kwargs["metadata"]


@pytest.mark.asyncio
async def test_process_lead_capture_requires_contact_info(monkeypatch: pytest.MonkeyPatch) -> None:
    """Si no hay correo ni teléfono, debe devolver error sin tocar el almacenamiento."""

    calls: list[str] = []

    async def fail_if_called(*args, **kwargs):  # pragma: no cover - seguridad
        calls.append("called")

    monkeypatch.setattr(
        "app.channels.webchat.service.storage.fetch_webchat_conversation_info",
        fail_if_called,
    )
    monkeypatch.setattr("app.channels.webchat.service.storage.fetch_contact", fail_if_called)

    call = service.ToolCall(
        id="tool-2",
        name="register_lead",
        arguments={
            "full_name": "Cliente",
            "company_name": "Sin datos",
        },
    )

    result = await service._process_lead_capture_tool(call=call, talia_conversation_id="conv-id")

    assert result["status"] == "error"
    assert result["message"] == "contact_info_required"
    assert not calls  # ninguna llamada a almacenamiento


@pytest.mark.asyncio
async def test_process_lead_capture_invalid_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un correo con formato inválido debe regresar error sin escribir datos."""

    call = service.ToolCall(
        id="tool-3",
        name="register_lead",
        arguments={
            "email": "correo-invalido",
        },
    )

    result = await service._process_lead_capture_tool(call=call, talia_conversation_id="conv-id")

    assert result["status"] == "error"
    assert result["message"] == "invalid_email"
