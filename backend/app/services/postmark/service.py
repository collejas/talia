"""Prevalidaciones de negocio para un envío de correo."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.core.config import settings
from app.integrations.postmark.client import PostmarkClient
from app.integrations.postmark.errors import PostmarkError
from app.integrations.postmark.schemas import MessageKind, PostmarkMessage

from .repository import PostmarkRepository


@dataclass(frozen=True)
class PostmarkSendContext:
    """Referencias internas necesarias antes de persistir un envío."""

    organizacion_id: UUID
    migration_id: UUID
    domain_id: UUID
    plan_id: UUID
    domain_name: str
    stream_name: str


class PostmarkService:
    """Reglas Postmark sin dependencia del sistema de correo legado."""

    def __init__(self, *, repository: PostmarkRepository) -> None:
        self.repository = repository

    async def queue_message(
        self,
        *,
        organizacion_id: UUID,
        message: PostmarkMessage,
        message_kind: MessageKind,
        idempotency_key: str,
        template_id: UUID | None = None,
        template_version: int | None = None,
        max_attempts: int = 3,
    ) -> dict[str, object]:
        """Valida y reserva cuota para un mensaje Postmark sin enviarlo."""
        context = await self.validate_send(
            organizacion_id=organizacion_id,
            message=message,
            message_kind=message_kind,
        )
        queued = await self.repository.queue_message(
            payload={
                "p_organizacion_id": str(organizacion_id),
                "p_migration_id": str(context.migration_id),
                "p_domain_id": str(context.domain_id),
                "p_plan_id": str(context.plan_id),
                "p_template_id": str(template_id) if template_id else None,
                "p_template_version": template_version,
                "p_message_kind": message_kind,
                "p_stream_name": context.stream_name,
                "p_idempotency_key": idempotency_key.strip(),
                "p_from_email": message.from_email,
                "p_from_name": message.from_name,
                "p_reply_to_email": message.reply_to,
                "p_to_email": message.to_email,
                "p_subject": message.subject,
                "p_html_body": message.html_body,
                "p_text_body": message.text_body,
                "p_tag": message.tag,
                "p_max_attempts": max_attempts,
            }
        )
        return {
            "message_id": queued.get("message_id"),
            "usage_period_id": queued.get("usage_period_id"),
            "created": bool(queued.get("created")),
            "message_status": queued.get("message_status"),
            "stream_name": context.stream_name,
        }

    async def deliver_queued_message(
        self,
        *,
        organizacion_id: UUID,
        message_id: UUID,
        client: PostmarkClient,
    ) -> dict[str, object]:
        """Entrega un mensaje previamente encolado y cierra su intento."""
        attempt = await self.repository.start_attempt(
            organizacion_id=organizacion_id,
            message_id=message_id,
        )
        message = PostmarkMessage(
            from_email=str(attempt["from_email"]),
            from_name=attempt.get("from_name"),
            reply_to=attempt.get("reply_to_email"),
            to_email=str(attempt["to_email"]),
            subject=str(attempt["subject"]),
            html_body=attempt.get("html_body"),
            text_body=attempt.get("text_body"),
            tag=attempt.get("tag"),
        )
        kind = attempt.get("message_kind")
        if kind not in {"transactional", "broadcast"}:
            raise PostmarkError("email_message_kind_invalid")
        stream_name = str(attempt.get("stream_name") or "").strip()
        if not stream_name:
            raise PostmarkError("message_stream_missing")
        result = await client.send_message(
            message,
            message_kind=kind,
            message_stream=stream_name,
        )
        finish = await self.repository.finish_attempt(
            payload={
                "p_organizacion_id": str(organizacion_id),
                "p_message_id": str(message_id),
                "p_attempt_id": str(attempt["attempt_id"]),
                "p_accepted": result.accepted,
                "p_external_message_id": (
                    str(result.provider_message_id) if result.provider_message_id else None
                ),
                "p_error_code": str(result.error_code) if result.error_code is not None else None,
                "p_error_message": result.error_message,
            }
        )
        return {"provider_accepted": result.accepted, "state": finish.get("message_status")}

    async def validate_send(
        self,
        *,
        organizacion_id: UUID,
        message: PostmarkMessage,
        message_kind: MessageKind,
    ) -> PostmarkSendContext:
        """Valida que el tenant pueda enviar, sin llamar aún al proveedor."""
        migration = await self.repository.get_migration(organizacion_id=organizacion_id)
        if not migration or not migration.get("feature_enabled") or migration.get("status") not in {
            "active",
            "validated",
            "migrated",
        }:
            raise PostmarkError("email_service_not_enabled")

        domain = await self.repository.get_verified_domain(organizacion_id=organizacion_id)
        if not domain:
            raise PostmarkError("verified_sending_domain_required")
        plan = await self.repository.get_active_plan(organizacion_id=organizacion_id)
        if not plan:
            raise PostmarkError("active_email_plan_required")

        domain_name = str(domain.get("domain_name") or "").strip().lower()
        from_domain = message.from_email.rsplit("@", 1)[-1].lower()
        if not domain_name or from_domain != domain_name:
            raise PostmarkError("sender_domain_not_authorized")
        if await self.repository.is_suppressed(
            organizacion_id=organizacion_id,
            email_address=message.to_email,
        ):
            raise PostmarkError("recipient_suppressed")

        if message_kind == "broadcast" and not message.tag:
            raise PostmarkError("broadcast_tag_required")

        stream_name = self._stream_name_for(message_kind)

        try:
            return PostmarkSendContext(
                organizacion_id=organizacion_id,
                migration_id=UUID(str(migration["id"])),
                domain_id=UUID(str(domain["id"])),
                plan_id=UUID(str(plan["id"])),
                domain_name=domain_name,
                stream_name=stream_name,
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise PostmarkError("email_configuration_invalid") from exc

    @staticmethod
    def _stream_name_for(message_kind: MessageKind) -> str:
        stream_name = (
            settings.postmark_transactional_stream
            if message_kind == "transactional"
            else settings.postmark_broadcast_stream
        ).strip()
        if not stream_name:
            raise PostmarkError("message_stream_missing")
        return stream_name


__all__ = ["PostmarkService", "PostmarkSendContext"]
