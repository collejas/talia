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
from app.services.tenant_runtime import get_secret_plaintext

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
            await self.ensure_webhooks(organizacion_id=organizacion_id, server=current)
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
            await self.ensure_webhooks(organizacion_id=organizacion_id, server=updated, token=provider.server_token)
            invalidate_runtime_cache(organizacion_id=organizacion_id)
            final = await self.repository.get_server(organizacion_id=organizacion_id) or updated
            return self._public_status(final)
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

    async def ensure_webhooks(
        self,
        *,
        organizacion_id: UUID,
        server: dict[str, object] | None = None,
        token: str | None = None,
    ) -> None:
        """Configura los hooks salientes de cada stream del servidor del tenant."""
        server = server or await self.repository.get_server(organizacion_id=organizacion_id)
        if not server or not server.get("postmark_server_id"):
            raise PostmarkProvisioningError("postmark_server_not_created")
        base_url = (settings.postmark_webhook_base_url or "").strip().rstrip("/")
        username = (settings.postmark_webhook_username or "").strip()
        password = settings.postmark_webhook_password or ""
        if not base_url or not username or not password:
            raise PostmarkProvisioningError("postmark_webhook_configuration_missing")
        if not token:
            token = await get_secret_plaintext(
                organizacion_id=organizacion_id,
                clave=str(server.get("server_token_secret_key") or "postmark.server_token"),
                force_refresh=True,
            )
        if not token:
            raise PostmarkProvisioningError("postmark_server_token_missing")
        client = PostmarkClient(
            server_token=token,
            transactional_stream=str(server.get("transactional_stream") or "outbound"),
            broadcast_stream=str(server.get("broadcast_stream") or "broadcast"),
        )
        for stream in (
            str(server.get("transactional_stream") or "outbound"),
            str(server.get("broadcast_stream") or "broadcast"),
        ):
            existing = await self.repository.get_server_webhook(
                server_id=UUID(str(server["id"])), message_stream=stream
            )
            if existing and existing.get("status") == "verified":
                continue
            endpoint = f"{base_url}/webhooks/postmark/{server['id']}/{stream}"
            try:
                if existing and existing.get("provider_webhook_id"):
                    response = await client.edit_webhook(
                        webhook_id=int(existing["provider_webhook_id"]),
                        url=endpoint,
                        username=username,
                        password=password,
                    )
                else:
                    response = await client.create_webhook(
                        url=endpoint,
                        message_stream=stream,
                        username=username,
                        password=password,
                    )
                status = str(response.get("Status") or "pending").lower()
                await self.repository.upsert_server_webhook(
                    payload={
                        "organizacion_id": str(organizacion_id),
                        "server_id": str(server["id"]),
                        "message_stream": stream,
                        "provider_webhook_id": int(response["ID"]),
                        "endpoint_url": endpoint,
                        "status": "verified" if status == "verified" else "pending",
                        "verified_at": datetime.now(timezone.utc).isoformat() if status == "verified" else None,
                        "last_error": None,
                    }
                )
                if status != "verified":
                    raise PostmarkProvisioningError("postmark_webhook_not_verified")
            except Exception as exc:
                if "response" in locals() and response.get("ID"):
                    await self.repository.upsert_server_webhook(
                        payload={
                            "organizacion_id": str(organizacion_id),
                            "server_id": str(server["id"]),
                            "message_stream": stream,
                            "provider_webhook_id": int(response["ID"]),
                            "endpoint_url": endpoint,
                            "status": "failed",
                            "last_error": str(exc)[:500],
                        }
                    )
                raise

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
