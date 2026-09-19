"""Acceso aislado a la configuración Postmark persistida en Supabase."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings


class PostmarkRepositoryError(RuntimeError):
    """Error controlado al consultar la configuración de correo."""


class PostmarkRepository:
    """Repositorio server-side exclusivo de las tablas tenant_email_*."""

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise PostmarkRepositoryError("supabase_not_configured")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def get_migration(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_migrations",
            params={
                "select": "id,organizacion_id,status,feature_enabled,domain_verified_at,production_enabled_at,validated_at",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )

    async def update_migration(self, *, organizacion_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_migrations",
            params={"organizacion_id": f"eq.{organizacion_id}"},
            payload=payload,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("migration_update_failed")
        return data[0]

    async def get_server(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        """Obtiene el servidor Postmark exclusivo del tenant."""
        return await self._get_one(
            "/rest/v1/tenant_email_servers",
            params={
                "select": "id,organizacion_id,postmark_server_id,server_name,server_status,transactional_stream,broadcast_stream,inbound_stream,server_token_secret_key,provisioned_at",
                "organizacion_id": f"eq.{organizacion_id}",
                "server_status": "not.eq.retired",
                "limit": "1",
            },
        )

    async def get_server_by_id(self, *, server_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_servers",
            params={
                "select": "id,organizacion_id,postmark_server_id,server_name,server_status,transactional_stream,broadcast_stream,inbound_stream,server_token_secret_key,provisioned_at",
                "id": f"eq.{server_id}",
                "server_status": "not.eq.retired",
                "limit": "1",
            },
        )

    async def create_server_record(self, *, organizacion_id: UUID, server_name: str) -> dict[str, Any]:
        data = await self._rest_post(
            "/rest/v1/tenant_email_servers",
            payload={
                "organizacion_id": str(organizacion_id),
                "server_name": server_name.strip(),
                "server_status": "provisioning",
            },
            prefer="resolution=merge-duplicates,return=representation",
            params={"on_conflict": "organizacion_id"},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("server_record_create_failed")
        return data[0]

    async def update_server(self, *, server_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_servers",
            params={"id": f"eq.{server_id}"},
            payload=payload,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("server_record_update_failed")
        return data[0]

    async def get_server_webhook(
        self, *, server_id: UUID, message_stream: str
    ) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_server_webhooks",
            params={
                "select": "id,organizacion_id,server_id,message_stream,provider_webhook_id,endpoint_url,status,verified_at,last_error",
                "server_id": f"eq.{server_id}",
                "message_stream": f"eq.{message_stream}",
                "limit": "1",
            },
        )

    async def get_message_by_external_id(
        self, *, organizacion_id: UUID, server_id: UUID, external_message_id: str
    ) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_messages",
            params={
                "select": "id,organizacion_id,server_id,external_message_id,status",
                "organizacion_id": f"eq.{organizacion_id}",
                "server_id": f"eq.{server_id}",
                "external_message_id": f"eq.{external_message_id}",
                "limit": "1",
            },
        )

    async def list_messages_by_external_ids(
        self, *, organizacion_id: UUID, server_id: UUID, external_ids: list[str]
    ) -> list[dict[str, Any]]:
        if not external_ids:
            return []
        values = ",".join(external_ids)
        return await self._get_many(
            "/rest/v1/tenant_email_messages",
            params={
                "select": "id,organizacion_id,server_id,external_message_id,status",
                "organizacion_id": f"eq.{organizacion_id}",
                "server_id": f"eq.{server_id}",
                "external_message_id": f"in.({values})",
            },
        )

    async def upsert_server_webhook(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_post(
            "/rest/v1/tenant_email_server_webhooks",
            payload=payload,
            prefer="resolution=merge-duplicates,return=representation",
            params={"on_conflict": "server_id,message_stream"},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("server_webhook_upsert_failed")
        return data[0]

    async def create_sync_run(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_post(
            "/rest/v1/tenant_email_sync_runs",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("sync_run_create_failed")
        return data[0]

    async def update_sync_run(self, *, run_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_sync_runs",
            params={"id": f"eq.{run_id}"},
            payload=payload,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("sync_run_update_failed")
        return data[0]

    async def upsert_sync_checkpoint(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        payload.setdefault("provider_filter", "HardBounce")
        data = await self._rest_post(
            "/rest/v1/tenant_email_sync_checkpoints",
            payload=payload,
            prefer="resolution=merge-duplicates,return=representation",
            params={"on_conflict": "organizacion_id,server_id,sync_type,message_stream,provider_filter"},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("sync_checkpoint_upsert_failed")
        return data[0]

    async def get_sync_checkpoint(
        self,
        *,
        organizacion_id: UUID,
        server_id: UUID,
        sync_type: str,
        message_stream: str,
        provider_filter: str = "HardBounce",
    ) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_sync_checkpoints",
            params={
                "select": "id,window_from,window_to,next_offset,last_provider_total,last_success_at,locked_at,provider_filter",
                "organizacion_id": f"eq.{organizacion_id}",
                "server_id": f"eq.{server_id}",
                "sync_type": f"eq.{sync_type}",
                "message_stream": f"eq.{message_stream}",
                "provider_filter": f"eq.{provider_filter}",
                "limit": "1",
            },
        )

    async def claim_sync_checkpoint(
        self,
        *,
        organizacion_id: UUID,
        server_id: UUID,
        sync_type: str,
        message_stream: str,
        window_from: str,
        window_to: str,
        provider_filter: str = "HardBounce",
    ) -> dict[str, Any] | None:
        data = await self._rpc(
            "tenant_email_claim_sync_checkpoint",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_server_id": str(server_id),
                "p_sync_type": sync_type,
                "p_message_stream": message_stream,
                "p_window_from": window_from,
                "p_window_to": window_to,
                "p_lock_timeout_seconds": 1800,
                "p_provider_filter": provider_filter,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def record_webhook_receipt(self, *, payload: dict[str, Any]) -> dict[str, Any] | None:
        """Registra una recepción; None significa que fue un reintento duplicado."""
        params = {
            "select": "id,processing_status",
            "organizacion_id": f"eq.{payload.get('organizacion_id')}",
            "server_id": (
                f"eq.{payload['server_id']}" if payload.get("server_id") else "is.null"
            ),
            "event_type": f"eq.{payload.get('event_type')}",
            "external_event_id": f"eq.{payload.get('external_event_id')}",
            "webhook_trace_id": (
                f"eq.{payload['webhook_trace_id']}"
                if payload.get("webhook_trace_id")
                else "is.null"
            ),
            "external_message_id": (
                f"eq.{payload['external_message_id']}"
                if payload.get("external_message_id") else "is.null"
            ),
            "limit": "1",
        }
        existing = await self._get_one("/rest/v1/tenant_email_webhook_receipts", params=params)
        if existing:
            return existing if existing.get("processing_status") != "processed" else None
        try:
            data = await self._rest_post(
                "/rest/v1/tenant_email_webhook_receipts",
                payload=payload,
                prefer="resolution=ignore-duplicates,return=representation",
            )
        except PostmarkRepositoryError:
            # Evita que una carrera entre dos webhooks/sincronizaciones rompa
            # toda la conciliación; la segunda lectura confirma el duplicado.
            existing = await self._get_one("/rest/v1/tenant_email_webhook_receipts", params=params)
            if existing:
                return existing if existing.get("processing_status") != "processed" else None
            raise
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        return None

    async def finish_webhook_receipt(
        self, *, receipt_id: UUID, status: str, error_code: str | None = None
    ) -> None:
        await self._rest_patch(
            "/rest/v1/tenant_email_webhook_receipts",
            params={"id": f"eq.{receipt_id}"},
            payload={
                "processing_status": status,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "error_code": error_code,
            },
        )

    async def create_event(self, *, payload: dict[str, Any]) -> dict[str, Any] | None:
        data = await self._rest_post(
            "/rest/v1/tenant_email_events",
            payload=payload,
            prefer="resolution=ignore-duplicates,return=representation",
            params={"on_conflict": "message_id,event_type,event_at"},
        )
        return data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else None

    async def update_message_from_webhook(
        self,
        *,
        organizacion_id: UUID,
        server_id: UUID,
        external_message_id: str,
        payload: dict[str, Any],
        status_filter: str | None = None,
    ) -> None:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "server_id": f"eq.{server_id}",
            "external_message_id": f"eq.{external_message_id}",
        }
        if status_filter:
            params["status"] = status_filter
        await self._rest_patch(
            "/rest/v1/tenant_email_messages",
            params=params,
            payload=payload,
        )

    async def upsert_suppression(self, *, payload: dict[str, Any]) -> None:
        # El índice de negocio es parcial y usa lower(email_address), por lo
        # que no se puede delegar ciegamente en PostgREST on_conflict. Se
        # actualiza el registro activo existente y solo se inserta si no existe.
        current = await self._get_one(
            "/rest/v1/tenant_email_suppressions",
            params={
                "select": "id",
                "organizacion_id": f"eq.{payload['organizacion_id']}",
                "email_address": f"eq.{payload['email_address']}",
                "suppression_type": f"eq.{payload['suppression_type']}",
                "active": "eq.true",
                "limit": "1",
            },
        )
        if current:
            await self._rest_patch(
                "/rest/v1/tenant_email_suppressions",
                params={"id": f"eq.{current['id']}"},
                payload={key: value for key, value in payload.items() if key not in {"organizacion_id", "email_address", "suppression_type"}},
            )
            return
        await self._rest_post(
            "/rest/v1/tenant_email_suppressions",
            payload=payload,
            prefer="resolution=merge-duplicates,return=representation",
        )

    async def enqueue_server_provision_job(self, *, organizacion_id: UUID, source: str) -> dict[str, Any]:
        current = await self.get_server(organizacion_id=organizacion_id)
        if current and current.get("server_status") == "active" and current.get("postmark_server_id"):
            return {"job_id": None, "job_status": "completed"}
        data = await self._rpc(
            "tenant_email_enqueue_server_provision_job",
            {"p_organizacion_id": str(organizacion_id), "p_source": source[:120]},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("server_provision_job_enqueue_failed")
        return data[0]

    async def claim_server_provision_jobs(self, *, limit: int = 10) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_server_provision_jobs",
            {"p_limit": max(1, min(limit, 100))},
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("server_provision_job_claim_failed")
        return [row for row in data if isinstance(row, dict)]

    async def update_server_provision_job(self, *, job_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_server_provision_jobs",
            params={"id": f"eq.{job_id}"},
            payload=payload,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("server_provision_job_update_failed")
        return data[0]

    async def get_verified_domain(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,server_id,domain_name,external_domain_id,status,verified_at,default_from_email,default_from_name,reply_to_email",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "eq.verified",
                "limit": "1",
            },
        )

    async def list_domains(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        data = await self._get_many(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,server_id,domain_name,status,dkim_host,dkim_record_value,return_path_domain,return_path_cname_target,dkim_verified_at,return_path_verified_at,verified_at,blocked_at,default_from_email,default_from_name,reply_to_email",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "not.eq.removed",
                "order": "created_at.asc",
            },
        )
        return data

    async def get_active_plan(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_plans",
            params={
                "select": "id,organizacion_id,plan_code,status,period_unit,period_limit,daily_limit,overage_allowed,starts_at,ends_at",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "eq.active",
                "order": "starts_at.desc",
                "limit": "1",
            },
        )

    async def get_current_usage(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        return await self._get_one(
            "/rest/v1/tenant_email_usage_periods",
            params={
                "select": "id,plan_id,period_start,period_end,reserved_recipients,accepted_recipients,failed_recipients,delivered_recipients,bounced_recipients,complained_recipients,released_recipients",
                "organizacion_id": f"eq.{organizacion_id}",
                "period_start": f"lte.{now}",
                "period_end": f"gt.{now}",
                "order": "period_start.desc",
                "limit": "1",
            },
        )

    async def is_suppressed(self, *, organizacion_id: UUID, email_address: str) -> bool:
        row = await self._get_one(
            "/rest/v1/tenant_email_suppressions",
            params={
                "select": "id",
                "organizacion_id": f"eq.{organizacion_id}",
                "email_address": f"eq.{email_address.lower()}",
                "active": "eq.true",
                "limit": "1",
            },
        )
        return row is not None

    async def list_suppressed_emails(
        self, *, organizacion_id: UUID, email_addresses: list[str]
    ) -> set[str]:
        """Obtiene las supresiones activas de un conjunto de destinatarios."""

        normalized = sorted({value.strip().lower() for value in email_addresses if value and value.strip()})
        if not normalized:
            return set()
        rows = await self._get_many(
            "/rest/v1/tenant_email_suppressions",
            params={
                "select": "email_address",
                "organizacion_id": f"eq.{organizacion_id}",
                "email_address": "in.(" + ",".join(normalized) + ")",
                "active": "eq.true",
                "limit": str(len(normalized)),
            },
        )
        return {
            str(row.get("email_address")).strip().lower()
            for row in rows
            if row.get("email_address")
        }

    async def ensure_migration(self, *, organizacion_id: UUID) -> dict[str, Any]:
        data = await self._rest_post(
            "/rest/v1/tenant_email_migrations",
            payload={"organizacion_id": str(organizacion_id), "status": "pending", "feature_enabled": False},
            prefer="resolution=merge-duplicates,return=representation",
            params={"on_conflict": "organizacion_id"},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("migration_invalid_response")
        return data[0]

    async def find_domain(self, *, domain_name: str) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,domain_name,status,external_domain_id",
                "domain_name": f"eq.{domain_name}",
                "status": "not.eq.removed",
                "limit": "1",
            },
        )

    async def get_domain(self, *, organizacion_id: UUID, domain_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,server_id,domain_name,external_domain_id,status,dkim_host,dkim_record_value,return_path_domain,return_path_cname_target,dkim_verified_at,return_path_verified_at,verified_at,default_from_email,default_from_name,reply_to_email",
                "id": f"eq.{domain_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )

    async def create_domain(self, *, organizacion_id: UUID, domain: dict[str, Any]) -> dict[str, Any]:
        payload = {"organizacion_id": str(organizacion_id), **domain}
        data = await self._rest_post(
            "/rest/v1/tenant_email_domains",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("domain_create_invalid_response")
        return data[0]

    async def update_domain_verification(
        self,
        *,
        organizacion_id: UUID,
        domain_id: UUID,
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_domains",
            params={"id": f"eq.{domain_id}", "organizacion_id": f"eq.{organizacion_id}"},
            payload=fields,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("domain_update_invalid_response")
        return data[0]

    async def update_domain_sender(
        self,
        *,
        organizacion_id: UUID,
        domain_id: UUID,
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_domains",
            params={"id": f"eq.{domain_id}", "organizacion_id": f"eq.{organizacion_id}"},
            payload=fields,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("sender_update_invalid_response")
        return data[0]

    async def remove_domain(self, *, organizacion_id: UUID, domain_id: UUID) -> dict[str, Any]:
        """Da de baja un dominio del tenant sin borrarlo de la cuenta central."""
        data = await self._rest_patch(
            "/rest/v1/tenant_email_domains",
            params={
                "id": f"eq.{domain_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "not.eq.removed",
            },
            payload={
                "status": "removed",
                "blocked_at": datetime.now(timezone.utc).isoformat(),
                "default_from_email": None,
                "default_from_name": None,
                "reply_to_email": None,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("domain_remove_invalid_response")
        return data[0]

    async def queue_message(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        """Encola y reserva cuota mediante la RPC atómica propia de Postmark."""
        function_name = (
            "tenant_email_queue_message_with_batch"
            if payload.get("p_source_batch_id")
            else "tenant_email_queue_message"
        )
        data = await self._rpc(function_name, payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("queue_invalid_response")
        return data[0]

    async def queue_messages_bulk(
        self, *, organizacion_id: UUID, items: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Encola hasta 500 mensajes en una sola llamada RPC por tenant."""
        if not items or len(items) > 500:
            raise PostmarkRepositoryError("bulk_message_queue_invalid_size")
        data = await self._rpc(
            "tenant_email_queue_messages_bulk",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_items": items,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("bulk_message_queue_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def claim_messages(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_messages",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_limit": limit,
                "p_stale_after_seconds": 600,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("claim_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def claim_messages_for_batch(
        self,
        *,
        organizacion_id: UUID,
        source_batch_id: UUID,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_messages_for_batch",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_source_batch_id": str(source_batch_id),
                "p_limit": max(1, min(limit, 500)),
                "p_stale_after_seconds": 600,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("batch_claim_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_queued_source_batches(self, *, organizacion_id: UUID) -> list[UUID]:
        rows = await self._get_many(
            "/rest/v1/tenant_email_messages",
            params={
                "select": "source_batch_id",
                "organizacion_id": f"eq.{organizacion_id}",
                "source_batch_id": "not.is.null",
                "delivery_batch_id": "is.null",
                "status": "in.(queued,processing)",
                "order": "queued_at.asc",
                "limit": "5000",
            },
        )
        result: list[UUID] = []
        seen: set[UUID] = set()
        for row in rows:
            try:
                batch_id = UUID(str(row.get("source_batch_id")))
            except (TypeError, ValueError):
                continue
            if batch_id not in seen:
                seen.add(batch_id)
                result.append(batch_id)
        return result

    async def prepare_delivery_batches(
        self,
        *,
        organizacion_id: UUID,
        source_batch_id: UUID,
        max_messages: int = 500,
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_prepare_delivery_batches",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_source_batch_id": str(source_batch_id),
                "p_max_messages": max(1, min(max_messages, 500)),
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("delivery_batch_prepare_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_ready_delivery_batches(
        self, *, organizacion_id: UUID, limit: int = 50
    ) -> list[dict[str, Any]]:
        return await self._get_many(
            "/rest/v1/tenant_email_delivery_batches",
            params={
                "select": "id,organizacion_id,source_batch_id,message_kind,message_stream,sequence_number,message_count,status,attempt_count",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "in.(ready,retry_wait)",
                "order": "prepared_at.asc,id.asc",
                "limit": str(max(1, min(limit, 100))),
            },
        )

    async def claim_delivery_batch(
        self,
        *,
        organizacion_id: UUID,
        delivery_batch_id: UUID,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_delivery_batch",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_delivery_batch_id": str(delivery_batch_id),
                "p_limit": max(1, min(limit, 500)),
                "p_stale_after_seconds": 600,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("delivery_batch_claim_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def finish_delivery_batch(
        self,
        *,
        organizacion_id: UUID,
        delivery_batch_id: UUID,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any] | None:
        data = await self._rpc(
            "tenant_email_finish_delivery_batch",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_delivery_batch_id": str(delivery_batch_id),
                "p_error_code": error_code,
                "p_error_message": error_message,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def enqueue_webhook_job(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rpc("tenant_email_enqueue_webhook_job", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("webhook_job_enqueue_invalid_response")
        return data[0]

    async def claim_webhook_jobs(
        self, *, organizacion_id: UUID, limit: int = 25
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_webhook_jobs",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_limit": max(1, min(limit, 100)),
                "p_stale_after_seconds": 300,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("webhook_job_claim_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def finish_webhook_job(
        self,
        *,
        job_id: UUID,
        success: bool,
        error_code: str | None = None,
        error_message: str | None = None,
        retry_seconds: int = 60,
    ) -> None:
        await self._rpc(
            "tenant_email_finish_webhook_job",
            {
                "p_job_id": str(job_id),
                "p_success": success,
                "p_error_code": error_code,
                "p_error_message": error_message,
                "p_retry_seconds": max(1, min(retry_seconds, 3600)),
            },
        )

    async def get_contact_batch(self, *, batch_id: UUID) -> dict[str, Any] | None:
        """Obtiene el estado operativo de un lote de prospección."""
        return await self._get_one(
            "/rest/v1/prospeccion_contacto_batch",
            params={
                "select": "id,organizacion_id,estado,total_prospectos",
                "id": f"eq.{batch_id}",
                "limit": "1",
            },
        )

    async def get_message_idempotency_key(self, *, message_id: UUID) -> str | None:
        row = await self._get_one(
            "/rest/v1/tenant_email_messages",
            params={
                "select": "id,idempotency_key",
                "id": f"eq.{message_id}",
                "limit": "1",
            },
        )
        value = row.get("idempotency_key") if row else None
        return str(value).strip() if value else None

    async def defer_message(self, *, message_id: UUID) -> None:
        await self._rest_patch(
            "/rest/v1/tenant_email_messages",
            params={"id": f"eq.{message_id}", "status": "eq.processing"},
            payload={"status": "queued", "updated_at": datetime.now(timezone.utc).isoformat()},
        )

    async def list_enabled_organizations(self) -> list[UUID]:
        data = await self._get_many(
            "/rest/v1/tenant_email_migrations",
            params={
                "select": "organizacion_id",
                "feature_enabled": "eq.true",
                "status": "in.(active,validated,migrated)",
            },
        )
        result: list[UUID] = []
        for row in data:
            try:
                result.append(UUID(str(row["organizacion_id"])))
            except (KeyError, TypeError, ValueError):
                continue
        return result

    async def start_attempt(self, *, organizacion_id: UUID, message_id: UUID) -> dict[str, Any]:
        data = await self._rpc(
            "tenant_email_start_attempt",
            {"p_organizacion_id": str(organizacion_id), "p_message_id": str(message_id)},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("attempt_start_invalid_response")
        return data[0]

    async def finish_attempt(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rpc("tenant_email_finish_attempt", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("attempt_finish_invalid_response")
        return data[0]

    async def finish_attempts_bulk(
        self,
        *,
        organizacion_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Cierra hasta 500 intentos en una sola transacción/RPC."""
        if not items or len(items) > 500:
            raise PostmarkRepositoryError("attempt_finish_bulk_invalid_size")
        data = await self._rpc(
            "tenant_email_finish_attempts_bulk",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_items": items,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("attempt_finish_bulk_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def set_quota(
        self,
        *,
        organizacion_id: UUID,
        period_limit: int,
        changed_by: UUID,
        reason: str,
    ) -> dict[str, Any]:
        data = await self._rpc(
            "tenant_email_admin_set_quota",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_period_limit": period_limit,
                "p_changed_by": str(changed_by),
                "p_reason": reason,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("quota_invalid_response")
        return data[0]

    async def _get_one(self, path: str, *, params: dict[str, str]) -> dict[str, Any] | None:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self._base_url}{path}", params=params, headers=headers)
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_read_failed")
        data = response.json()
        if not isinstance(data, list):
            raise PostmarkRepositoryError("database_invalid_response")
        return data[0] if data and isinstance(data[0], dict) else None

    async def _get_many(self, path: str, *, params: dict[str, str]) -> list[dict[str, Any]]:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self._base_url}{path}", params=params, headers=headers)
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_read_failed")
        data = response.json()
        if not isinstance(data, list):
            raise PostmarkRepositoryError("database_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def _rest_post(
        self,
        path: str,
        *,
        payload: dict[str, Any],
        prefer: str,
        params: dict[str, str] | None = None,
    ) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}{path}",
                    params=params,
                    json=payload,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_write_failed")
        return response.json()

    async def _rest_patch(self, path: str, *, params: dict[str, str], payload: dict[str, Any]) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.patch(
                    f"{self._base_url}{path}", params=params, json=payload, headers=headers
                )
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_write_failed")
        return response.json()

    async def _rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/rest/v1/rpc/{function_name}",
                    json=payload,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            detail = None
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    detail = payload.get("message") or payload.get("hint") or payload.get("details")
            except ValueError:
                detail = None
            safe_detail = str(detail).strip()[:300] if detail else None
            raise PostmarkRepositoryError(
                f"queue_failed:{response.status_code}:{safe_detail}" if safe_detail else f"queue_failed:{response.status_code}"
            )
        if response.status_code == 204 or not response.content:
            return None
        return response.json()


__all__ = ["PostmarkRepository", "PostmarkRepositoryError"]
