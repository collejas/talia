import pytest

from app.services.prospeccion_plantilla_ai import (
    EmailTemplateAiResult,
    _sanitize_html,
    _validate_html,
    _validate_placeholders,
)


def test_email_html_keeps_safe_inline_design_and_dimensions() -> None:
    html = (
        '<table role="presentation" width="100%" style="background-color:#f4f7fb;padding:24px">'
        '<tr><td align="center" style="font-family:Arial;color:#172033">'
        '<img src="{{hero_image_url}}" width="600" style="display:block;width:100%;max-width:600px;height:auto">'
        '<a href="{{booking_url}}" target="_blank" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Agendar</a>'
        "</td></tr></table>"
    )

    sanitized = _validate_html(html)

    assert 'style="background-color:#f4f7fb;padding:24px"' in sanitized
    assert 'width="100%"' in sanitized
    assert "max-width:600px" in sanitized
    assert 'href="{{booking_url}}"' in sanitized


def test_email_html_removes_unsafe_styles_and_attributes() -> None:
    html = (
        '<p style="position:fixed;background-image:url(https://evil.test/x);color:red">Hola</p>'
        '<img src="javascript:alert(1)" onerror="alert(1)" style="display:block">'
    )

    sanitized = _sanitize_html(html)

    assert "position" not in sanitized
    assert "url(" not in sanitized
    assert "javascript:" not in sanitized
    assert "onerror" not in sanitized
    assert 'style="color:red"' in sanitized


def test_selected_cta_urls_must_be_used() -> None:
    result = EmailTemplateAiResult(
        nombre_sugerido="Demo",
        descripcion="Demo",
        asunto="Hola {{nombre}}",
        cuerpo_texto="Hola {{nombre}} {{booking_link_text}}",
        cuerpo_html="<p>Hola {{nombre}} {{booking_link_text}}</p>",
        variables_usadas=["nombre", "booking_link_text"],
    )

    with pytest.raises(ValueError, match="template_ai_selected_cta_not_used"):
        _validate_placeholders(result, {"nombre", "website_url", "whatsapp_url", "booking_link_text"}, "correo")
