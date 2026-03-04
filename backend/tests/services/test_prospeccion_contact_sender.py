from app.services.prospeccion_contact_sender import (
    _build_twilio_numeric_variables_from_body,
    _compose_twilio_template_variables,
    _find_blank_twilio_variables,
    _render_twilio_variables,
)


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
