from uuid import UUID

import pytest

from app.services import brevo


@pytest.mark.asyncio
async def test_ensure_email_inbox_context_falls_back_to_unlinked_prospect_thread() -> None:
    org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    prospecto_id = UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
    created_payloads: list[dict[str, object]] = []

    class DummyRepo:
        async def get_email_conversation_by_envio_id(
            self,
            *,
            organizacion_id: UUID,
            envio_id: UUID,
            canal: str | None = None,
        ):
            assert organizacion_id == org_id
            assert envio_id == UUID("b7cfea7f-eef3-4526-88ac-962c41ec847a")
            assert canal == "correo"
            return None

        async def worker_get_prospecto(self, *, prospecto_id: UUID):
            assert prospecto_id == UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
            return {
                "display_name": "Saul Martinez",
                "segmento": "Sinergia Lidera",
                "metadata": {},
            }

        async def worker_find_persona_by_prospecto(self, *, organizacion_id: UUID, prospecto_id: UUID):
            assert organizacion_id == org_id
            assert prospecto_id == UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
            return None

        async def get_persona_by_email(self, *, email: str, organizacion_id: UUID):
            assert email == "collejas1@gmail.com"
            assert organizacion_id == org_id
            return None

        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            assert organizacion_id == org_id
            assert correo_remitente == "collejas1@gmail.com"
            assert canal == "correo"
            return None

        async def create_conversation(self, **kwargs):
            created_payloads.append(kwargs)
            return {"id": "b5f6aa51-f299-4a30-a744-3c45aaf6833d"}

    context = await brevo._ensure_email_inbox_context(
        repo=DummyRepo(),
        envio={
            "id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
            "organizacion_id": str(org_id),
            "prospecto_id": str(prospecto_id),
            "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
        },
        inbound={
            "sender_email": "collejas1@gmail.com",
            "sender_name": "Saul Martinez",
        },
    )

    assert context == (org_id, UUID("b5f6aa51-f299-4a30-a744-3c45aaf6833d"))
    assert created_payloads == [
        {
            "organizacion_id": org_id,
            "correo_remitente": "collejas1@gmail.com",
            "nombre_remitente": "Saul Martinez",
            "canal": "correo",
            "estado": "abierta",
            "inbox_context": {
                "source": "prospeccion",
                "sender_email": "collejas1@gmail.com",
                "sender_name": "Saul Martinez",
                "unlinked_email_inbox": True,
                "envio_id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
                "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
                "prospecto_id": str(prospecto_id),
            },
        }
    ]


@pytest.mark.asyncio
async def test_ensure_email_inbox_context_reuses_existing_general_email_thread_and_adopts_it() -> None:
    org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    prospecto_id = UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
    update_calls: list[dict[str, object]] = []

    class DummyRepo:
        async def get_email_conversation_by_envio_id(
            self,
            *,
            organizacion_id: UUID,
            envio_id: UUID,
            canal: str | None = None,
        ):
            assert organizacion_id == org_id
            assert envio_id == UUID("b7cfea7f-eef3-4526-88ac-962c41ec847a")
            assert canal == "correo"
            return None

        async def worker_get_prospecto(self, *, prospecto_id: UUID):
            assert prospecto_id == UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
            return {
                "display_name": "Pedro Parra",
                "segmento": "Sinergia Lidera",
                "metadata": {},
            }

        async def worker_find_persona_by_prospecto(self, *, organizacion_id: UUID, prospecto_id: UUID):
            assert organizacion_id == org_id
            assert prospecto_id == UUID("ce003bab-9535-4a82-9b00-f8b43172da2e")
            return None

        async def get_persona_by_email(self, *, email: str, organizacion_id: UUID):
            assert email == "collejas1@gmail.com"
            assert organizacion_id == org_id
            return None

        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            assert organizacion_id == org_id
            assert correo_remitente == "collejas1@gmail.com"
            assert canal == "correo"
            return {
                "id": "b5f6aa51-f299-4a30-a744-3c45aaf6833d",
                "inbox_context": {
                    "source": "correo_general",
                    "sender_email": "collejas1@gmail.com",
                    "sender_name": "Jorge Torre Collejas",
                    "unlinked_email_inbox": True,
                },
            }

        async def update_conversation(self, *, conversation_id: str, patch: dict[str, object]):
            update_calls.append({"conversation_id": conversation_id, "patch": patch})
            return {
                "id": conversation_id,
                "inbox_context": patch.get("inbox_context"),
            }

    context = await brevo._ensure_email_inbox_context(
        repo=DummyRepo(),
        envio={
            "id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
            "organizacion_id": str(org_id),
            "prospecto_id": str(prospecto_id),
            "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
        },
        inbound={
            "sender_email": "collejas1@gmail.com",
            "sender_name": "Pedro Parra",
        },
    )

    assert context == (org_id, UUID("b5f6aa51-f299-4a30-a744-3c45aaf6833d"))
    assert update_calls == [
        {
            "conversation_id": "b5f6aa51-f299-4a30-a744-3c45aaf6833d",
            "patch": {
                "nombre_remitente": "Pedro Parra",
                "inbox_context": {
                    "source": "prospeccion",
                    "sender_email": "collejas1@gmail.com",
                    "sender_name": "Pedro Parra",
                    "unlinked_email_inbox": True,
                    "envio_id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
                    "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
                    "prospecto_id": str(prospecto_id),
                    "source_detail": "correo_general",
                },
            },
        }
    ]


@pytest.mark.asyncio
async def test_process_brevo_inbound_emails_scopes_envio_lookup_to_mailbox_org() -> None:
    org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    lookup_calls: list[tuple[str, str, str | None]] = []
    complete_calls: list[dict[str, object]] = []
    inbox_calls: list[dict[str, object]] = []

    class DummyRepo:
        async def worker_get_envio_by_mensaje(
            self,
            *,
            mensaje_id: str,
            organizacion_id: UUID | None = None,
        ):
            lookup_calls.append(("mensaje", mensaje_id, str(organizacion_id) if organizacion_id else None))
            return {
                "id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
                "organizacion_id": str(org_id),
                "prospecto_id": "ce003bab-9535-4a82-9b00-f8b43172da2e",
                "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
                "detalle": {},
            }

        async def worker_get_latest_envio_by_email(
            self,
            *,
            email: str,
            canal: str | None = None,
            organizacion_id: UUID | None = None,
        ):
            lookup_calls.append(("email", email, str(organizacion_id) if organizacion_id else None))
            raise AssertionError("No debio usar fallback global por email si ya hubo match por message-id")

        async def worker_complete_envio(self, *, envio_id: UUID, payload: dict[str, object]):
            complete_calls.append({"envio_id": str(envio_id), **payload})
            return payload

        async def worker_insert_contact_logs(self, entries):
            return entries

        async def worker_sync_batch_status(self, *, batch_id: UUID):
            return "respondido"

        async def get_persona_by_id(self, *, persona_id: str, organizacion_id: UUID):
            return None

        async def worker_get_prospecto(self, *, prospecto_id: UUID):
            return {"metadata": {}, "display_name": "Pedro Parra"}

        async def worker_find_persona_by_prospecto(self, *, organizacion_id: UUID, prospecto_id: UUID):
            return None

        async def get_persona_by_email(self, *, email: str, organizacion_id: UUID):
            return None

        async def get_email_conversation_by_envio_id(
            self,
            *,
            organizacion_id: UUID,
            envio_id: UUID,
            canal: str | None = None,
        ):
            assert organizacion_id == org_id
            assert envio_id == UUID("b7cfea7f-eef3-4526-88ac-962c41ec847a")
            assert canal == "correo"
            return {"id": "11850f5e-0225-4e2d-a4bc-5327c7a7addb"}

        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            return {"id": "11850f5e-0225-4e2d-a4bc-5327c7a7addb"}

        async def insert_inbox_message(self, **kwargs):
            inbox_calls.append(kwargs)
            return {"id": "msg-1"}

    processed = await brevo.process_brevo_inbound_emails(
        repo=DummyRepo(),
        organizacion_id=org_id,
        events=[
            {
                "from": "Pedro Parra <collejas1@gmail.com>",
                "text": "Respuesta de prueba",
                "subject": "Re: prueba",
                "Message-Id": "<new-reply@example.com>",
                "In-Reply-To": "<orig-send@example.com>",
                "Date": "2026-07-17T04:10:49+00:00",
            }
        ],
    )

    assert processed == 1
    assert lookup_calls == [("mensaje", "orig-send@example.com", str(org_id))]
    assert complete_calls
    assert inbox_calls and inbox_calls[0]["organizacion_id"] == org_id
    assert inbox_calls[0]["provider_message_id"] == "new-reply@example.com"


@pytest.mark.asyncio
async def test_process_brevo_inbound_emails_falls_back_by_email_within_same_org_when_reply_headers_do_not_match() -> None:
    org_id = UUID("a2f79c76-340a-4fe7-b05a-6ff4dd532325")
    lookup_calls: list[tuple[str, str, str | None]] = []
    complete_calls: list[dict[str, object]] = []
    inbox_calls: list[dict[str, object]] = []

    class DummyRepo:
        async def worker_get_envio_by_mensaje(
            self,
            *,
            mensaje_id: str,
            organizacion_id: UUID | None = None,
        ):
            lookup_calls.append(("mensaje", mensaje_id, str(organizacion_id) if organizacion_id else None))
            return None

        async def worker_get_latest_envio_by_email(
            self,
            *,
            email: str,
            canal: str | None = None,
            organizacion_id: UUID | None = None,
            before_iso: str | None = None,
        ):
            lookup_calls.append(("email", email, str(organizacion_id) if organizacion_id else None))
            assert before_iso == "2026-07-17T04:10:49+00:00"
            return {
                "id": "b7cfea7f-eef3-4526-88ac-962c41ec847a",
                "organizacion_id": str(org_id),
                "prospecto_id": "ce003bab-9535-4a82-9b00-f8b43172da2e",
                "batch_id": "bcc40a67-8f39-4f1a-a75e-0f914c52724a",
                "detalle": {},
            }

        async def worker_complete_envio(self, *, envio_id: UUID, payload: dict[str, object]):
            complete_calls.append({"envio_id": str(envio_id), **payload})
            return payload

        async def worker_insert_contact_logs(self, entries):
            return entries

        async def worker_sync_batch_status(self, *, batch_id: UUID):
            return "respondido"

        async def worker_get_prospecto(self, *, prospecto_id: UUID):
            return {"metadata": {}, "display_name": "Pedro Parra"}

        async def worker_find_persona_by_prospecto(self, *, organizacion_id: UUID, prospecto_id: UUID):
            return None

        async def get_persona_by_email(self, *, email: str, organizacion_id: UUID):
            return None

        async def get_email_conversation_by_envio_id(
            self,
            *,
            organizacion_id: UUID,
            envio_id: UUID,
            canal: str | None = None,
        ):
            return {"id": "11850f5e-0225-4e2d-a4bc-5327c7a7addb"}

        async def get_latest_unlinked_email_conversation(
            self,
            *,
            organizacion_id: UUID,
            correo_remitente: str,
            canal: str = "correo",
        ):
            return {"id": "11850f5e-0225-4e2d-a4bc-5327c7a7addb"}

        async def insert_inbox_message(self, **kwargs):
            inbox_calls.append(kwargs)
            return {"id": "msg-1"}

    processed = await brevo.process_brevo_inbound_emails(
        repo=DummyRepo(),
        organizacion_id=org_id,
        events=[
            {
                "from": "Pedro Parra <collejas1@gmail.com>",
                "text": "Respuesta de prueba",
                "subject": "Re: prueba",
                "Message-Id": "<new-reply@example.com>",
                "In-Reply-To": "<missing-send@example.com>",
                "Date": "2026-07-17T04:10:49+00:00",
            }
        ],
    )

    assert processed == 1
    assert lookup_calls == [
        ("mensaje", "missing-send@example.com", str(org_id)),
        ("email", "collejas1@gmail.com", str(org_id)),
    ]
    assert complete_calls
    assert inbox_calls and inbox_calls[0]["organizacion_id"] == org_id
