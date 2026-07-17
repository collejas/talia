from uuid import UUID

import pytest

from app.services import prospeccion_email_inbound_reader as inbound_reader
from app.services.tenant_runtime import MailRuntimeSettings, TenantMailRuntimeMailbox


def _mail_settings(*, username: str, incoming_server: str) -> MailRuntimeSettings:
    return MailRuntimeSettings(
        username=username,
        password="secret",
        incoming_server=incoming_server,
        incoming_port_imap=993,
        outgoing_server="smtp.example.com",
        outgoing_port_smtp=465,
        use_ssl=True,
        use_tls=False,
        from_name=None,
        reply_to=None,
    )


@pytest.mark.asyncio
async def test_process_once_reads_tenant_assistant_mailboxes(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant_org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    fetched_hosts: list[str] = []
    unmatched_org_ids: list[UUID] = []

    async def fake_get_mail_runtime_settings(*, organizacion_id: UUID | None = None) -> MailRuntimeSettings:
        assert organizacion_id == inbound_reader.MASTER_ORGANIZACION_ID
        return _mail_settings(username="master@talia.mx", incoming_server="mail.talia.mx")

    async def fake_list_tenant_mail_runtime_settings() -> list[TenantMailRuntimeMailbox]:
        return [
            TenantMailRuntimeMailbox(
                organizacion_id=tenant_org_id,
                settings=_mail_settings(
                    username="asistente@sinergialidera.com",
                    incoming_server="mail.sinergialidera.com",
                ),
            )
        ]

    async def fake_to_thread(func, /, *args, **kwargs):
        return func(*args, **kwargs)

    def fake_fetch_unseen_events(**kwargs):
        fetched_hosts.append(kwargs["host"])
        if kwargs["host"] == "mail.sinergialidera.com":
            return [{"from": "cliente@externo.com", "subject": "Hola", "text": "mensaje"}]
        return []

    async def fake_process_brevo_inbound_emails(*, repo, events):
        return 0

    async def fake_record_unmatched_inbox_email(*, repo, organizacion_id: UUID, event):
        unmatched_org_ids.append(organizacion_id)
        return True

    class DummyRepo:
        pass

    monkeypatch.setattr(inbound_reader, "get_mail_runtime_settings", fake_get_mail_runtime_settings)
    monkeypatch.setattr(
        inbound_reader,
        "list_tenant_mail_runtime_settings",
        fake_list_tenant_mail_runtime_settings,
    )
    monkeypatch.setattr(inbound_reader.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(inbound_reader, "_imap_fetch_unseen_events", fake_fetch_unseen_events)
    monkeypatch.setattr(inbound_reader, "process_brevo_inbound_emails", fake_process_brevo_inbound_emails)
    monkeypatch.setattr(inbound_reader, "_record_unmatched_inbox_email", fake_record_unmatched_inbox_email)
    monkeypatch.setattr(inbound_reader, "CRMRepository", DummyRepo)

    reader = inbound_reader.ProspeccionEmailInboundReader()
    await reader._process_once()

    assert fetched_hosts == ["mail.talia.mx", "mail.sinergialidera.com"]
    assert unmatched_org_ids == [tenant_org_id]
