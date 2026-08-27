"""Consulta tenant-scoped del servicio central de correo."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.routes.admin import require_master_tenant_owner, require_user_token
from app.api.routes.tenant import TenantContext, require_permission, require_tenant_context
from app.schemas.postmark import (
    EmailDnsRecord,
    TenantEmailDomain,
    TenantEmailPlan,
    TenantEmailServiceResponse,
    TenantEmailUsage,
    TenantEmailQuotaResponse,
    TenantEmailQuotaUpdate,
)
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError

router = APIRouter(prefix="/tenant/me/email-service", tags=["email-service"])
admin_router = APIRouter(prefix="/admin/tenants", tags=["email-service-admin"])


def get_postmark_repository() -> PostmarkRepository:
    try:
        return PostmarkRepository()
    except PostmarkRepositoryError as exc:
        raise HTTPException(status_code=500, detail="email_service_unavailable") from exc


def _dns_records(row: dict[str, object]) -> list[EmailDnsRecord]:
    records: list[EmailDnsRecord] = []
    dkim_host = str(row.get("dkim_host") or "").strip()
    dkim_value = str(row.get("dkim_record_value") or "").strip()
    if dkim_host and dkim_value:
        records.append(EmailDnsRecord(host=dkim_host, record_type="TXT", value=dkim_value))
    return_host = str(row.get("return_path_domain") or "").strip()
    return_target = str(row.get("return_path_cname_target") or "").strip()
    if return_host and return_target:
        records.append(EmailDnsRecord(host=return_host, record_type="CNAME", value=return_target))
    return records


async def _read_email_service(
    organizacion_id: UUID,
    repository: PostmarkRepository,
) -> TenantEmailServiceResponse:
    try:
        migration = await repository.get_migration(organizacion_id=organizacion_id)
        domains = await repository.list_domains(organizacion_id=organizacion_id)
        plan = await repository.get_active_plan(organizacion_id=organizacion_id)
        usage = await repository.get_current_usage(organizacion_id=organizacion_id)
    except PostmarkRepositoryError as exc:
        raise HTTPException(status_code=502, detail="email_service_read_failed") from exc

    if not migration:
        return TenantEmailServiceResponse(migration_status="pending", feature_enabled=False, domains=[])

    domain_items = [
        TenantEmailDomain(
            id=row["id"],
            domain=str(row.get("domain_name") or ""),
            status=str(row.get("status") or "pending_dns"),
            verified_at=row.get("verified_at"),
            from_email=row.get("default_from_email"),
            from_name=row.get("default_from_name"),
            reply_to_email=row.get("reply_to_email"),
            dns_records=_dns_records(row),
        )
        for row in domains
    ]
    plan_item = (
        TenantEmailPlan(
            code=str(plan["plan_code"]),
            period_unit=str(plan["period_unit"]),
            period_limit=int(plan["period_limit"]),
            daily_limit=int(plan["daily_limit"]) if plan.get("daily_limit") is not None else None,
            overage_allowed=bool(plan["overage_allowed"]),
        )
        if plan
        else None
    )
    usage_item = None
    if usage:
        reserved = int(usage["reserved_recipients"])
        released = int(usage["released_recipients"])
        available = max((plan_item.period_limit if plan_item else 0) - reserved + released, 0)
        usage_item = TenantEmailUsage(
            period_start=usage["period_start"],
            period_end=usage["period_end"],
            reserved=reserved,
            accepted=int(usage["accepted_recipients"]),
            failed=int(usage["failed_recipients"]),
            delivered=int(usage["delivered_recipients"]),
            bounced=int(usage["bounced_recipients"]),
            complained=int(usage["complained_recipients"]),
            released=released,
            available=available,
        )
    return TenantEmailServiceResponse(
        migration_status=str(migration["status"]),
        feature_enabled=bool(migration["feature_enabled"]),
        domains=domain_items,
        plan=plan_item,
        usage=usage_item,
    )


@router.get("", response_model=TenantEmailServiceResponse)
async def get_tenant_email_service(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repository: PostmarkRepository = Depends(get_postmark_repository),
) -> TenantEmailServiceResponse:
    await require_permission(user_token, "settings.view")
    return await _read_email_service(context.organizacion_id, repository)


@admin_router.get("/{organizacion_id}/email-service", response_model=TenantEmailServiceResponse)
async def get_admin_tenant_email_service(
    organizacion_id: UUID,
    _: UUID = Depends(require_master_tenant_owner),
    repository: PostmarkRepository = Depends(get_postmark_repository),
) -> TenantEmailServiceResponse:
    """Permite al owner maestro revisar el correo de un tenant específico."""
    return await _read_email_service(organizacion_id, repository)


@admin_router.patch("/{organizacion_id}/email-service/quota", response_model=TenantEmailQuotaResponse)
async def set_admin_tenant_email_quota(
    organizacion_id: UUID,
    payload: TenantEmailQuotaUpdate,
    actor_id: UUID = Depends(require_master_tenant_owner),
    repository: PostmarkRepository = Depends(get_postmark_repository),
) -> TenantEmailQuotaResponse:
    """Actualiza la cuota del periodo actual con auditoría explícita."""
    if payload.period_limit < 0 or payload.period_limit > 100_000_000:
        raise HTTPException(status_code=422, detail="email_quota_invalid")
    reason = payload.reason.strip()
    if len(reason) < 3 or len(reason) > 500:
        raise HTTPException(status_code=422, detail="email_quota_reason_invalid")
    try:
        row = await repository.set_quota(
            organizacion_id=organizacion_id,
            period_limit=payload.period_limit,
            changed_by=actor_id,
            reason=reason,
        )
    except PostmarkRepositoryError as exc:
        raise HTTPException(status_code=502, detail="email_quota_update_failed") from exc
    return TenantEmailQuotaResponse(
        previous_period_limit=row.get("previous_period_limit"),
        new_period_limit=int(row["new_period_limit"]),
        period_start=row["period_start"],
        period_end=row["period_end"],
    )


__all__ = ["router", "admin_router"]
