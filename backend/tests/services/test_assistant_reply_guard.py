from app.services.assistant_reply_guard import evaluate_reply_quality


def test_numbered_list_closers_are_not_treated_as_unbalanced_parentheses() -> None:
    text = "Tal-IA ofrece: 1) atención, 2) campañas, 3) CRM y 4) seguimiento."

    assert evaluate_reply_quality(text) == (True, "ok")


def test_real_unbalanced_parentheses_are_still_rejected() -> None:
    assert evaluate_reply_quality("Consulta nuestros planes (básico y profesional.") == (
        False,
        "unbalanced_parentheses",
    )


def test_balanced_real_parentheses_are_still_accepted() -> None:
    assert evaluate_reply_quality("Consulta nuestros planes (básico y profesional).") == (
        True,
        "ok",
    )
