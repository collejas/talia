"""Schemas neutrales para configuración tenant de correo."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EmailDnsRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str
    record_type: str
    value: str


class TenantEmailDomain(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    domain: str
    status: str
    verified_at: datetime | None = None
    from_email: str | None = None
    from_name: str | None = None
    reply_to_email: str | None = None
    dns_records: list[EmailDnsRecord]


class TenantEmailPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    period_unit: str
    period_limit: int
    daily_limit: int | None = None
    overage_allowed: bool


class TenantEmailUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_start: datetime
    period_end: datetime
    reserved: int
    accepted: int
    failed: int
    delivered: int
    bounced: int
    complained: int
    released: int
    available: int


class TenantEmailServiceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    migration_status: str
    feature_enabled: bool
    domains: list[TenantEmailDomain]
    plan: TenantEmailPlan | None = None
    usage: TenantEmailUsage | None = None


class TenantEmailQuotaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_limit: int
    reason: str


class TenantEmailQuotaResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    previous_period_limit: int | None = None
    new_period_limit: int
    period_start: datetime
    period_end: datetime
