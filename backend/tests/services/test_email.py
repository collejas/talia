import base64

from app.core.config import settings
from app.services.email import EmailSendError, send_email


def test_send_email_uses_brevo_adapter(monkeypatch):
    captured: dict[str, object] = {}

    class DummyResponse:
        status_code = 202

        def __init__(self) -> None:
            self._json = {"messageId": "brevo-123"}
            self.text = '{"messageId": "brevo-123"}'

        def json(self):
            return self._json

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            captured["client_kwargs"] = kwargs

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr("app.services.email.httpx.Client", DummyClient)
    monkeypatch.setattr(settings, "brevo_api_key", "test-key", raising=False)
    monkeypatch.setattr(settings, "mail_username", "sender@example.com", raising=False)
    monkeypatch.setattr(settings, "mail_from_name", "Tal IA", raising=False)

    message_id = send_email(
        subject="Hola",
        body_text="Texto plano",
        body_html="<p>Hola</p>",
        recipients=[" usuario@example.com "],
        attachments=[{"filename": "demo.txt", "content": b"hola"}],
    )

    assert message_id == "brevo-123"
    assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
    payload = captured["json"]
    assert payload["sender"]["email"] == "sender@example.com"
    assert payload["to"] == [{"email": "usuario@example.com"}]
    attachment = payload["attachment"][0]
    assert attachment["name"] == "demo.txt"
    assert base64.b64decode(attachment["content"]) == b"hola"


def test_send_email_forces_smtp_when_provider_preference_smtp(monkeypatch):
    called: dict[str, object] = {"smtp": False, "brevo": False}

    def fake_smtp(**kwargs):
        called["smtp"] = True
        return "smtp-123"

    def fake_brevo(**kwargs):
        called["brevo"] = True
        return "brevo-123"

    monkeypatch.setattr("app.services.email._send_email_smtp", fake_smtp)
    monkeypatch.setattr("app.services.email._send_email_brevo", fake_brevo)
    monkeypatch.setattr(settings, "brevo_api_key", "test-key", raising=False)
    monkeypatch.setattr(settings, "mail_username", "sender@example.com", raising=False)
    monkeypatch.setattr(settings, "mail_password", "secret", raising=False)
    monkeypatch.setattr(settings, "mail_outgoing_server", "smtp.example.com", raising=False)
    monkeypatch.setattr(settings, "mail_outgoing_port_smtp", 587, raising=False)

    message_id = send_email(
        subject="Hola",
        body_text="Texto plano",
        recipients=["usuario@example.com"],
        provider_preference="smtp",
    )

    assert message_id == "smtp-123"
    assert called["smtp"] is True
    assert called["brevo"] is False


def test_send_email_forces_brevo_and_fails_when_missing_api_key(monkeypatch):
    monkeypatch.setattr(settings, "brevo_api_key", None, raising=False)
    monkeypatch.setattr(settings, "mail_username", "sender@example.com", raising=False)

    try:
        send_email(
            subject="Hola",
            body_text="Texto plano",
            recipients=["usuario@example.com"],
            provider_preference="brevo",
        )
    except EmailSendError as exc:
        assert "API Key" in str(exc)
    else:  # pragma: no cover - defensivo
        raise AssertionError("Se esperaba EmailSendError por Brevo sin API key")
