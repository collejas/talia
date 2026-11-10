from app.services.email_validation import validate_postmark_email


def test_validate_postmark_email_rejects_utf8_local_part() -> None:
    normalized, error = validate_postmark_email("nereyda.lópez@tamaulipas.gob.mx")

    assert normalized is None
    assert error == "postmark_email_invalid"


def test_validate_postmark_email_accepts_ascii_mailbox() -> None:
    normalized, error = validate_postmark_email("ana.lopez@tamaulipas.gob.mx")

    assert normalized == "ana.lopez@tamaulipas.gob.mx"
    assert error is None
