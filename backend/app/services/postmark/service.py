"""Prevalidaciones de negocio para un envío de correo."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

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


class PostmarkService:
    """Reglas Postmark sin dependencia del sistema de correo legado."""

    def __init__(self, *, repository: PostmarkRepository) -> None:
        self.repository = repository

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

        try:
            return PostmarkSendContext(
                organizacion_id=organizacion_id,
                migration_id=UUID(str(migration["id"])),
                domain_id=UUID(str(domain["id"])),
                plan_id=UUID(str(plan["id"])),
                domain_name=domain_name,
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise PostmarkError("email_configuration_invalid") from exc


__all__ = ["PostmarkService", "PostmarkSendContext"]
