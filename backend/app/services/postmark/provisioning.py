"""Provisión idempotente de un servidor Postmark por tenant."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.core.config import settings
from app.core.secrets_crypto import encrypt_secret
from app.integrations.postmark.client import PostmarkClient
from app.integrations.postmark.errors import PostmarkError
from app.repositories.platform_admin import PlatformRepository
from app.services.tenant_runtime import invalidate_runtime_cache

from .repository import PostmarkRepository


class PostmarkProvisioningError(PostmarkError):
    """La cuenta externa o el almacenamiento seguro no pudieron completarse."""


class PostmarkProvisioningService:
    """Crea el servidor externo y guarda su token únicamente cifrado."""

    def __init__(self, *, repository: PostmarkRepository | None = None) -> None:
        self.repository = repository or PostmarkRepository()

    async def provision_tenant_server(
        self,
        *,
        organizacion_id: UUID,
        server_name: str,
    ) -> dict[str, object]:
        current = await self.repository.get_server(organizacion_id=organizacion_id)
        if current and current.get("server_status") == "active":
            return self._public_status(current)
        if current and current.get("postmark_server_id"):
            raise PostmarkProvisioningError("postmark_server_reconciliation_required")

        record = current or await self.repository.create_server_record(
            organizacion_id=organizacion_id,
            server_name=server_name,
        )
        server_id = UUID(str(record["id"]))
        await self.repository.update_server(
            server_id=server_id,
            payload={"server_status": "provisioning", "provisioning_error_code": None, "provisioning_error_message": None},
        )

        try:
            provider = await PostmarkClient().create_server(server_name)
            # Persistir el ID antes de cifrar el token evita crear un segundo
            # servidor si el almacenamiento seguro falla después de la alta.
            await self.repository.update_server(
                server_id=server_id,
                payload={
                    "postmark_server_id": provider.external_server_id,
                    "server_name": provider.server_name,
                },
            )
            secret_key = str(record.get("server_token_secret_key") or "postmark.server_token").strip().lower()
            master_key = settings.secrets_master_key
            if not master_key:
                raise PostmarkProvisioningError("secrets_master_key_missing")
            aad = f"org:{organizacion_id}:key:{secret_key}:tier:A"
            nonce, ciphertext = encrypt_secret(
                plaintext=provider.server_token,
                master_key=master_key,
                aad=aad,
            )
            platform_repository = PlatformRepository()
            existing_secret = await platform_repository.get_secret_row(
                organizacion_id=organizacion_id,
                clave=secret_key,
            )
            try:
                version = int(existing_secret.get("version") or 0) + 1 if existing_secret else 1
            except (TypeError, ValueError):
                version = 1
            await platform_repository.upsert_secret(
                organizacion_id=organizacion_id,
                clave=secret_key,
                valor_cifrado=ciphertext,
                nonce=nonce,
                etiqueta="A",
                version=version,
            )
            updated = await self.repository.update_server(
                server_id=server_id,
                payload={
                    "postmark_server_id": provider.external_server_id,
                    "server_name": provider.server_name,
                    "server_status": "active",
                    "provisioned_at": datetime.now(timezone.utc).isoformat(),
                    "provisioning_error_code": None,
                    "provisioning_error_message": None,
                },
            )
            invalidate_runtime_cache(organizacion_id=organizacion_id)
            return self._public_status(updated)
        except Exception as exc:
            await self.repository.update_server(
                server_id=server_id,
                payload={
                    "server_status": "failed",
                    "provisioning_error_code": type(exc).__name__,
                    "provisioning_error_message": str(exc)[:500],
                },
            )
            if isinstance(exc, PostmarkError):
                raise
            raise PostmarkProvisioningError("postmark_server_provision_failed") from exc

    @staticmethod
    def _public_status(row: dict[str, object]) -> dict[str, object]:
        return {
            "server_id": row.get("id"),
            "postmark_server_id": row.get("postmark_server_id"),
            "server_name": row.get("server_name"),
            "server_status": row.get("server_status"),
            "transactional_stream": row.get("transactional_stream"),
            "broadcast_stream": row.get("broadcast_stream"),
        }


__all__ = ["PostmarkProvisioningError", "PostmarkProvisioningService"]
