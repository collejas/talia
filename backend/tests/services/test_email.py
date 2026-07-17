import base64

from app.core.config import settings
from app.services.tenant_runtime import BrevoRuntimeSettings
from app.services.email import (
    EmailSendError,
    EmailSendResult,
    _build_smtp_email_message,
    _send_email_smtp,
    send_email,
    send_email_detailed,
)


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
    assert payload["sender"]["name"] == "Tal IA"
    assert payload["to"] == [{"email": "usuario@example.com"}]
    attachment = payload["attachment"][0]
    assert attachment["name"] == "demo.txt"
    assert base64.b64decode(attachment["content"]) == b"hola"


def test_send_email_detailed_keeps_local_and_provider_message_ids(monkeypatch):
    class DummyResponse:
        status_code = 202
        text = '{"messageId": "<brevo-456@smtp-relay.sendinblue.com>"}'

        def json(self):
            return {"messageId": "<brevo-456@smtp-relay.sendinblue.com>"}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json=None, headers=None):
            return DummyResponse()

    monkeypatch.setattr("app.services.email.httpx.Client", DummyClient)
    monkeypatch.setattr("app.services.email.make_msgid", lambda domain=None: "<local-123@sinergialidera.com>")
    monkeypatch.setattr(settings, "brevo_api_key", "test-key", raising=False)
    monkeypatch.setattr(settings, "mail_username", "sender@example.com", raising=False)

    result = send_email_detailed(
        subject="Hola",
        body_text="Texto plano",
        recipients=["usuario@example.com"],
        provider_preference="brevo",
    )

    assert result == EmailSendResult(
        provider="brevo",
        local_message_id="local-123@sinergialidera.com",
        provider_message_id="brevo-456@smtp-relay.sendinblue.com",
    )


def test_send_email_uses_tenant_brevo_sender_when_available(monkeypatch):
    captured: dict[str, object] = {}

    class DummyResponse:
        status_code = 202

        def __init__(self) -> None:
            self._json = {"messageId": "brevo-tenant-123"}
            self.text = '{"messageId": "brevo-tenant-123"}'

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
    monkeypatch.setattr(settings, "mail_username", "creator@example.com", raising=False)
    monkeypatch.setattr(settings, "mail_from_name", "Creator App", raising=False)

    message_id = send_email(
        subject="Hola",
        body_text="Texto plano",
        recipients=["usuario@example.com"],
        brevo_settings=BrevoRuntimeSettings(
            api_key="tenant-key",
            base_url="https://api.brevo.com/v3",
            sender_email="pui@geoactiv.mx",
            sender_name="PUI - Geoactiv",
        ),
    )

    assert message_id == "brevo-tenant-123"
    payload = captured["json"]
    assert payload["sender"]["email"] == "pui@geoactiv.mx"
    assert payload["sender"]["name"] == "PUI - Geoactiv"


def test_send_email_brevo_401_returns_actionable_message(monkeypatch):
    class DummyResponse:
        status_code = 401
        text = '{"message":"invalid api key"}'

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json=None, headers=None):
            return DummyResponse()

    monkeypatch.setattr("app.services.email.httpx.Client", DummyClient)
    monkeypatch.setattr(settings, "brevo_api_key", "test-key", raising=False)
    monkeypatch.setattr(settings, "mail_username", "sender@example.com", raising=False)

    try:
        send_email(
            subject="Hola",
            body_text="Texto plano",
            recipients=["usuario@example.com"],
            provider_preference="brevo",
        )
    except EmailSendError as exc:
        message = str(exc)
        assert "Brevo rechazó la autenticación" in message
        assert "API key" in message
    else:  # pragma: no cover - defensivo
        raise AssertionError("Se esperaba EmailSendError por Brevo 401")


def test_send_email_forces_smtp_when_provider_preference_smtp(monkeypatch):
    called: dict[str, object] = {"smtp": False, "brevo": False}

    def fake_smtp(**kwargs):
        called["smtp"] = True
        return EmailSendResult(
            provider="smtp",
            local_message_id="smtp-123",
            provider_message_id="smtp-123",
        )

    def fake_brevo(**kwargs):
        called["brevo"] = True
        return EmailSendResult(
            provider="brevo",
            local_message_id="local-brevo-123",
            provider_message_id="brevo-123",
        )

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


def test_send_email_uses_sender_domain_for_message_id(monkeypatch):
    captured: dict[str, object] = {}

    def fake_make_msgid(domain=None):
        captured["domain"] = domain
        return f"<test-message-id@{domain}>"

    def fake_smtp(**kwargs):
        return EmailSendResult(
            provider="smtp",
            local_message_id="smtp-123",
            provider_message_id="smtp-123",
        )

    monkeypatch.setattr("app.services.email.make_msgid", fake_make_msgid)
    monkeypatch.setattr("app.services.email._send_email_smtp", fake_smtp)
    monkeypatch.setattr(settings, "brevo_api_key", None, raising=False)
    monkeypatch.setattr(settings, "mail_username", "hola@talia.mx", raising=False)
    monkeypatch.setattr(settings, "mail_password", "secret", raising=False)
    monkeypatch.setattr(settings, "mail_outgoing_server", "mail.talia.mx", raising=False)
    monkeypatch.setattr(settings, "mail_outgoing_port_smtp", 465, raising=False)

    message_id = send_email(
        subject="Hola",
        body_text="Texto plano",
        recipients=["usuario@example.com"],
        provider_preference="smtp",
    )

    assert message_id == "smtp-123"
    assert captured["domain"] == "talia.mx"


def test_build_smtp_email_message_uses_7bit_for_ascii_body():
    from app.services.tenant_runtime import MailRuntimeSettings

    message = _build_smtp_email_message(
        message_id="<test@talia.mx>",
        subject="ASCII subject",
        body_text="ASCII body only",
        body_html=None,
        recipients=["user@example.com"],
        attachments=(),
        headers={},
        mail_settings=MailRuntimeSettings(
            username="hola@talia.mx",
            password="secret",
            incoming_server="mail.talia.mx",
            incoming_port_imap=993,
            outgoing_server="mail.talia.mx",
            outgoing_port_smtp=465,
            use_ssl=True,
            use_tls=False,
            from_name=None,
            reply_to=None,
        ),
    )

    assert message["From"] == "hola@talia.mx"
    assert message["Date"]
    assert "X-AuthUser" not in message
    assert message.get_body(preferencelist=("plain",)).get_content_type() == "text/plain"
    assert message.get_body(preferencelist=("plain",)).get("Content-Transfer-Encoding") == "7bit"
    assert message.get_body(preferencelist=("plain",)).get_content_charset() == "us-ascii"


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


def test_send_email_smtp_retries_with_ssl_for_port_465(monkeypatch):
    from app.services.tenant_runtime import MailRuntimeSettings

    attempts: list[tuple[str, int, bool]] = []

    class DummySMTP:
        def __init__(self, host, port, timeout=None):
            attempts.append((host, port, False))
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self, context=None):
            raise RuntimeError("wrong transport")

        def login(self, username, password):
            return None

        def send_message(self, message):
            return None

    class DummySMTPSSL:
        def __init__(self, host, port, context=None, timeout=None):
            attempts.append((host, port, True))

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def login(self, username, password):
            return None

        def send_message(self, message):
            return None

    monkeypatch.setattr("app.services.email.smtplib.SMTP", DummySMTP)
    monkeypatch.setattr("app.services.email.smtplib.SMTP_SSL", DummySMTPSSL)

    message_id = _send_email_smtp(
        message_id="<test@imlux.mx>",
        subject="Hola",
        body_text="Texto plano",
        body_html=None,
        recipients=["cliente@example.com"],
        attachments=(),
        headers={},
        mail_settings=MailRuntimeSettings(
            username="ventas.5qro@imlux.mx",
            password="secret",
            incoming_server="mail.imlux.mx",
            incoming_port_imap=993,
            outgoing_server="mail.imlux.mx",
            outgoing_port_smtp=465,
            use_ssl=False,
            use_tls=True,
            from_name="Haidee",
            reply_to=None,
        ),
    )

    assert message_id == EmailSendResult(
        provider="smtp",
        local_message_id="test@imlux.mx",
        provider_message_id="test@imlux.mx",
    )
    assert attempts == [
        ("mail.imlux.mx", 465, False),
        ("mail.imlux.mx", 465, True),
    ]
