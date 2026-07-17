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

    def fake_fetch_mailbox_events(**kwargs):
        fetched_hosts.append(kwargs["host"])
        if kwargs["host"] == "mail.sinergialidera.com":
            return [
                inbound_reader.ImapFolderFetchResult(
                    folder_name="INBOX",
                    selected_name="INBOX",
                    last_seen_uid=4,
                    events=[
                        {
                            "from": "cliente@externo.com",
                            "subject": "Hola",
                            "text": "mensaje",
                            "__folder_name": "INBOX",
                            "__folder_selected_name": "INBOX",
                            "__message_uid": 4,
                        }
                    ],
                )
            ]
        return []

    async def fake_process_brevo_inbound_emails(*, repo, events, organizacion_id):
        assert organizacion_id == tenant_org_id
        return 0

    async def fake_record_unmatched_inbox_email(*, repo, organizacion_id: UUID, event):
        unmatched_org_ids.append(organizacion_id)
        return True

    class DummyRepo:
        async def get_email_inbound_sync_state(self, *, organizacion_id: UUID, mailbox_email: str, folder_name: str):
            return None

        async def upsert_email_inbound_sync_state(
            self,
            *,
            organizacion_id: UUID,
            mailbox_email: str,
            folder_name: str,
            last_seen_uid: int,
            last_sync_at: str | None = None,
            last_error: str | None = None,
        ):
            return {"last_seen_uid": last_seen_uid}

        async def get_inbox_message_by_provider_message_id(self, *, provider_message_id: str, organizacion_id: UUID):
            return None

        pass

    monkeypatch.setattr(inbound_reader, "get_mail_runtime_settings", fake_get_mail_runtime_settings)
    monkeypatch.setattr(
        inbound_reader,
        "list_tenant_mail_runtime_settings",
        fake_list_tenant_mail_runtime_settings,
    )
    monkeypatch.setattr(inbound_reader.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(inbound_reader, "_imap_fetch_mailbox_events", fake_fetch_mailbox_events)
    monkeypatch.setattr(inbound_reader, "process_brevo_inbound_emails", fake_process_brevo_inbound_emails)
    monkeypatch.setattr(inbound_reader, "_record_unmatched_inbox_email", fake_record_unmatched_inbox_email)
    monkeypatch.setattr(inbound_reader, "CRMRepository", DummyRepo)

    reader = inbound_reader.ProspeccionEmailInboundReader()
    await reader._process_once()

    assert fetched_hosts == ["mail.talia.mx", "mail.sinergialidera.com"]
    assert unmatched_org_ids == [tenant_org_id]


@pytest.mark.asyncio
async def test_process_once_skips_already_recorded_message_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    processed_events: list[dict[str, str]] = []

    async def fake_get_mail_runtime_settings(*, organizacion_id: UUID | None = None) -> MailRuntimeSettings:
        assert organizacion_id == inbound_reader.MASTER_ORGANIZACION_ID
        return _mail_settings(username="master@talia.mx", incoming_server="mail.talia.mx")

    async def fake_list_tenant_mail_runtime_settings() -> list[TenantMailRuntimeMailbox]:
        return []

    async def fake_to_thread(func, /, *args, **kwargs):
        return func(*args, **kwargs)

    def fake_fetch_mailbox_events(**kwargs):
        return [
            inbound_reader.ImapFolderFetchResult(
                folder_name="INBOX",
                selected_name="INBOX",
                last_seen_uid=6,
                events=[
                    {
                        "from": "cliente@externo.com",
                        "subject": "Hola",
                        "text": "mensaje",
                        "Message-Id": "<already-recorded@example.com>",
                        "__folder_name": "INBOX",
                        "__folder_selected_name": "INBOX",
                        "__message_uid": 6,
                    }
                ],
            )
        ]

    async def fake_process_brevo_inbound_emails(*, repo, events, organizacion_id):
        assert organizacion_id == inbound_reader.MASTER_ORGANIZACION_ID
        processed_events.extend(events)
        return 0

    async def fake_record_unmatched_inbox_email(*, repo, organizacion_id: UUID, event):
        raise AssertionError("No debio intentar guardar un correo ya registrado")

    class DummyRepo:
        async def get_email_inbound_sync_state(self, *, organizacion_id: UUID, mailbox_email: str, folder_name: str):
            return None

        async def upsert_email_inbound_sync_state(
            self,
            *,
            organizacion_id: UUID,
            mailbox_email: str,
            folder_name: str,
            last_seen_uid: int,
            last_sync_at: str | None = None,
            last_error: str | None = None,
        ):
            return {"last_seen_uid": last_seen_uid}

        async def get_inbox_message_by_provider_message_id(self, *, provider_message_id: str, organizacion_id: UUID):
            assert provider_message_id == "already-recorded@example.com"
            assert organizacion_id == inbound_reader.MASTER_ORGANIZACION_ID
            return {"id": "existing"}

    monkeypatch.setattr(inbound_reader, "get_mail_runtime_settings", fake_get_mail_runtime_settings)
    monkeypatch.setattr(
        inbound_reader,
        "list_tenant_mail_runtime_settings",
        fake_list_tenant_mail_runtime_settings,
    )
    monkeypatch.setattr(inbound_reader.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(inbound_reader, "_imap_fetch_mailbox_events", fake_fetch_mailbox_events)
    monkeypatch.setattr(inbound_reader, "process_brevo_inbound_emails", fake_process_brevo_inbound_emails)
    monkeypatch.setattr(inbound_reader, "_record_unmatched_inbox_email", fake_record_unmatched_inbox_email)
    monkeypatch.setattr(inbound_reader, "CRMRepository", DummyRepo)

    reader = inbound_reader.ProspeccionEmailInboundReader()
    await reader._process_once()

    assert processed_events == []


@pytest.mark.asyncio
async def test_process_once_moves_known_reply_from_spam_to_inbox(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant_org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    move_calls: list[dict[str, object]] = []

    async def fake_get_mail_runtime_settings(*, organizacion_id: UUID | None = None) -> MailRuntimeSettings:
        assert organizacion_id == inbound_reader.MASTER_ORGANIZACION_ID
        return _mail_settings(username="master@talia.mx", incoming_server="mail.talia.mx")

    async def fake_list_tenant_mail_runtime_settings() -> list[TenantMailRuntimeMailbox]:
        return [
            TenantMailRuntimeMailbox(
                organizacion_id=tenant_org_id,
                settings=_mail_settings(
                    username="tal-ia@sinergialidera.com",
                    incoming_server="mail.sinergialidera.com",
                ),
            )
        ]

    async def fake_to_thread(func, /, *args, **kwargs):
        return func(*args, **kwargs)

    def fake_fetch_mailbox_events(**kwargs):
        if kwargs["host"] != "mail.sinergialidera.com":
            return []
        return [
            inbound_reader.ImapFolderFetchResult(
                folder_name="Spam",
                selected_name="Spam",
                last_seen_uid=12,
                events=[
                    {
                        "from": "cliente@externo.com",
                        "subject": "Re: Hola",
                        "text": "respuesta",
                        "In-Reply-To": "<known-envio@example.com>",
                        "__folder_name": "Spam",
                        "__folder_selected_name": "Spam",
                        "__message_uid": 12,
                    }
                ],
            )
        ]

    def fake_move_message_to_inbox(**kwargs):
        move_calls.append(kwargs)
        return True

    async def fake_process_brevo_inbound_emails(*, repo, events, organizacion_id):
        assert organizacion_id == tenant_org_id
        return 1

    class DummyRepo:
        async def get_email_inbound_sync_state(self, *, organizacion_id: UUID, mailbox_email: str, folder_name: str):
            return None

        async def upsert_email_inbound_sync_state(
            self,
            *,
            organizacion_id: UUID,
            mailbox_email: str,
            folder_name: str,
            last_seen_uid: int,
            last_sync_at: str | None = None,
            last_error: str | None = None,
        ):
            return {"last_seen_uid": last_seen_uid}

        async def get_inbox_message_by_provider_message_id(self, *, provider_message_id: str, organizacion_id: UUID):
            return None

        async def worker_get_envio_by_mensaje(self, *, mensaje_id: str, organizacion_id: UUID | None = None):
            assert mensaje_id == "known-envio@example.com"
            assert organizacion_id == tenant_org_id
            return {"id": "envio-1", "organizacion_id": str(tenant_org_id)}

    monkeypatch.setattr(inbound_reader, "get_mail_runtime_settings", fake_get_mail_runtime_settings)
    monkeypatch.setattr(
        inbound_reader,
        "list_tenant_mail_runtime_settings",
        fake_list_tenant_mail_runtime_settings,
    )
    monkeypatch.setattr(inbound_reader.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(inbound_reader, "_imap_fetch_mailbox_events", fake_fetch_mailbox_events)
    monkeypatch.setattr(inbound_reader, "_imap_move_message_to_inbox", fake_move_message_to_inbox)
    monkeypatch.setattr(inbound_reader, "process_brevo_inbound_emails", fake_process_brevo_inbound_emails)
    monkeypatch.setattr(inbound_reader, "CRMRepository", DummyRepo)

    reader = inbound_reader.ProspeccionEmailInboundReader()
    await reader._process_once()

    assert move_calls == [
        {
            "host": "mail.sinergialidera.com",
            "port": 993,
            "username": "tal-ia@sinergialidera.com",
            "password": "secret",
            "use_ssl": True,
            "source_folder": "Spam",
            "message_uid": 12,
        }
    ]


@pytest.mark.asyncio
async def test_ensure_general_email_inbox_context_uses_unlinked_email_thread() -> None:
    organizacion_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    created_payloads: list[dict[str, object]] = []

    class DummyRepo:
        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            assert organizacion_id == UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
            assert correo_remitente == "cliente@externo.com"
            assert canal == "correo"
            return None

        async def create_conversation(self, **kwargs):
            created_payloads.append(kwargs)
            return {"id": "8cb4f4db-7f10-43a8-b8e4-1234567890ab"}

    context = await inbound_reader._ensure_general_email_inbox_context(
        repo=DummyRepo(),
        organizacion_id=organizacion_id,
        sender_email="cliente@externo.com",
        sender_name="Cliente Externo",
    )

    assert context == (
        organizacion_id,
        UUID("8cb4f4db-7f10-43a8-b8e4-1234567890ab"),
    )
    assert created_payloads == [
        {
            "organizacion_id": organizacion_id,
            "correo_remitente": "cliente@externo.com",
            "nombre_remitente": "Cliente Externo",
            "canal": "correo",
            "estado": "abierta",
            "inbox_context": {
                "source": "correo_general",
                "sender_email": "cliente@externo.com",
                "sender_name": "Cliente Externo",
                "unlinked_email_inbox": True,
            },
        }
    ]


@pytest.mark.asyncio
async def test_record_unmatched_inbox_email_normalizes_message_ids() -> None:
    organizacion_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    inserted_payloads: list[dict[str, object]] = []

    class DummyRepo:
        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            return {
                "id": "8cb4f4db-7f10-43a8-b8e4-1234567890ab",
            }

        async def insert_inbox_message(
            self,
            *,
            conversation_id: UUID,
            direction: str,
            text: str,
            datos: dict[str, object] | None = None,
            tipo_contenido: str = "texto",
            estado: str = "entregada",
            provider_message_id: str | None = None,
            organizacion_id: UUID | None = None,
            occurred_at: str | None = None,
        ):
            inserted_payloads.append(
                {
                    "conversation_id": conversation_id,
                    "direction": direction,
                    "text": text,
                    "datos": datos or {},
                    "provider_message_id": provider_message_id,
                    "organizacion_id": organizacion_id,
                    "occurred_at": occurred_at,
                }
            )
            return {"id": "msg-1"}

    saved = await inbound_reader._record_unmatched_inbox_email(
        repo=DummyRepo(),
        organizacion_id=organizacion_id,
        event={
            "from": "cliente@externo.com",
            "subject": "Hola",
            "text": "mensaje directo",
            "Message-Id": "<direct-1@example.com>",
            "In-Reply-To": "<seed-1@example.com>",
            "References": "<seed-1@example.com> <seed-0@example.com>",
            "Date": "2026-07-16T20:58:36-06:00",
        },
    )

    assert saved is True
    assert inserted_payloads == [
        {
            "conversation_id": UUID("8cb4f4db-7f10-43a8-b8e4-1234567890ab"),
            "direction": "entrante",
            "text": "mensaje directo",
            "datos": {
                "channel": "correo",
                "source": "correo_general",
                "action": "inbound_email",
                "sender_email": "cliente@externo.com",
                "subject": "Hola",
                "message_id": "direct-1@example.com",
                "in_reply_to": "seed-1@example.com",
                "references": "<seed-1@example.com> <seed-0@example.com>",
                "received_at": "2026-07-16T20:58:36-06:00",
            },
            "provider_message_id": "direct-1@example.com",
            "organizacion_id": organizacion_id,
            "occurred_at": "2026-07-16T20:58:36-06:00",
        }
    ]
