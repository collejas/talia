import httpx

from app.services.meta_whatsapp_assisted import MetaWhatsAppAssistedClient


def _response(status_code: int, payload: dict[str, object]) -> httpx.Response:
    return httpx.Response(status_code, json=payload)


def test_meta_access_error_is_translated_without_exposing_provider_text() -> None:
    error = MetaWhatsAppAssistedClient._error(
        _response(
            400,
            {"error": {"code": 100, "message": "Unsupported get request. Object does not exist"}},
        ),
        "Meta no pudo completar este paso.",
        operation="validar",
    )

    assert error.code == "meta_asset_not_found"
    assert "Unsupported get request" not in error.message
    assert "WABA" in error.message


def test_pin_error_is_actionable_and_retryable_flag_is_false() -> None:
    error = MetaWhatsAppAssistedClient._error(
        _response(400, {"error": {"code": 100, "message": "Invalid two-step verification PIN"}}),
        "Meta no pudo completar este paso.",
        operation="registrar",
    )

    assert error.code == "whatsapp_pin_rejected"
    assert "PIN" in error.message
    assert error.retryable is False


def test_temporary_meta_error_is_retryable() -> None:
    error = MetaWhatsAppAssistedClient._error(
        _response(503, {"error": {"code": 2, "message": "Service temporarily unavailable"}}),
        "Meta no pudo completar este paso.",
        operation="suscribir",
    )

    assert error.code == "meta_temporarily_unavailable"
    assert error.retryable is True
