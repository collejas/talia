"""Aprovisionamiento idempotente del tenant a partir de la capa comercial."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import EmailSendError
from app.services.tenant_access_onboarding import create_tenant_access_invitation

logger = get_logger("app.services.tenant_provisioning")

FALLBACK_TENANT_DEPARTMENT_NAMES = (
    "Administración",
    "Comercial",
    "Marketing",
    "Operaciones",
    "Soporte",
    "Finanzas",
)

FALLBACK_TENANT_POSITION_NAMES = (
    "Administrador General",
    "Gerente Comercial",
    "Supervisor Comercial",
    "Ejecutivo de Ventas",
    "Analista de Marketing",
    "Especialista de Soporte",
    "Coordinador Operativo",
    "Auxiliar Administrativo",
)

PIPELINE_STAGE_SEED: tuple[dict[str, Any], ...] = (
    {
        "codigo": "captado",
        "nombre": "Captado",
        "orden": 10,
        "probabilidad": 0.05,
        "categoria": "abierta",
        "metadata": {},
    },
    {
        "codigo": "precalificado",
        "nombre": "Precalificado",
        "orden": 20,
        "probabilidad": 0.15,
        "categoria": "abierta",
        "metadata": {},
    },
    {
        "codigo": "demo",
        "nombre": "Demo",
        "orden": 30,
        "probabilidad": 0.3,
        "categoria": "abierta",
        "metadata": {},
    },
    {
        "codigo": "propuesta",
        "nombre": "Propuesta",
        "orden": 40,
        "probabilidad": 0.5,
        "categoria": "abierta",
        "metadata": {},
    },
    {
        "codigo": "negociacion",
        "nombre": "Negociación",
        "orden": 50,
        "probabilidad": 0.7,
        "categoria": "abierta",
        "metadata": {},
    },
    {
        "codigo": "cerrado_ganado",
        "nombre": "Cerrado ganado",
        "orden": 60,
        "probabilidad": 1.0,
        "categoria": "cerrada_ganada",
        "metadata": {},
    },
    {
        "codigo": "cerrado_perdido",
        "nombre": "Cerrado perdido",
        "orden": 70,
        "probabilidad": 0.0,
        "categoria": "cerrada_perdida",
        "metadata": {},
    },
)

TENANT_BASE_PERMISSION_CODES = (
    "ver_panel",
    "ver_inbox",
    "conv.read",
    "conv.write",
    "conv.assign",
    "contacts.read",
    "contacts.write",
    "contacts.delete",
    "contacts.view_sensitive_unowned",
    "accounts.view_sensitive_unowned",
    "contacts.export_csv",
    "messages.read",
    "messages.write",
    "calls.read",
    "calls.write",
    "reports.view",
    "role.manage",
    "user.manage",
    "roles.write",
    "usuarios.write",
    "settings.view",
    "settings.manage",
    "leads.view",
    "pipeline.view",
    "agenda.view",
    "agenda.manage",
    "propuesta.view",
    "clientes.view",
    "propiedades.view",
    "activities.view",
    "tickets.view",
    "campaigns.view",
    "notes.view",
    "files.view",
    "audit.view",
    "busquedas.view",
    "busquedas.run",
    "busquedas.delete",
    "prospectos.create",
    "ver_busquedas_google",
    "ver_busquedas_inegi",
    "ejecutar_busquedas",
)


def _get_config_value(config: dict[str, Any], dotted_key: str) -> Any:
    current: Any = config
    for part in dotted_key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _merge_missing_config(target: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    for key, default_value in defaults.items():
        current_value = target.get(key)
        if isinstance(default_value, dict):
            if not isinstance(current_value, dict):
                target[key] = dict(default_value)
                continue
            _merge_missing_config(current_value, default_value)
            continue
        if current_value is None:
            target[key] = default_value
    return target


def _build_default_tenant_config(*, calendar_resource_id: str) -> dict[str, Any]:
    webchat_cfg: dict[str, Any] = {
        "calendar": {
            "resource_id": calendar_resource_id,
            "timezone": settings.webchat_calendar_timezone,
            "default_days": settings.webchat_calendar_default_days,
            "hold_minutes": settings.webchat_calendar_hold_minutes,
        },
        "persist_session": settings.webchat_persist_session,
        "reengage_minutes": settings.webchat_reengage_minutes,
        "reengage_max_attempts": settings.webchat_reengage_max_attempts,
        "escalate_minutes": settings.webchat_escalate_minutes,
    }
    if settings.webchat_inactivity_minutes is not None:
        webchat_cfg["inactivity_minutes"] = settings.webchat_inactivity_minutes
    elif settings.webchat_inactivity_hours is not None:
        webchat_cfg["inactivity_minutes"] = settings.webchat_inactivity_hours * 60
    assistant_id = settings.openai_webchat_assistant_id or settings.openai_assistant_id
    if assistant_id:
        webchat_cfg["assistant_id"] = assistant_id
    prompt_version = settings.openai_prompt_webchat_version or settings.openai_prompt_version
    if prompt_version:
        webchat_cfg["prompt_version"] = prompt_version

    config: dict[str, Any] = {
        "features": {
            "webchat": {"enabled": True},
            "catalog_inmobiliario": {"enabled": True},
            "catalog_no_inmobiliario": {"enabled": True},
        },
        "webchat": webchat_cfg,
        "whatsapp": {"provider": "meta", "templates": {}},
    }

    calendar_cfg: dict[str, Any] = {}
    if settings.calendar_provider:
        calendar_cfg["provider"] = settings.calendar_provider
    if settings.calendar_server_url:
        calendar_cfg["server_url"] = settings.calendar_server_url
    if settings.calendar_server_url_alternate:
        calendar_cfg["server_url_alternate"] = settings.calendar_server_url_alternate
    if settings.calendar_server_port is not None:
        calendar_cfg["server_port"] = settings.calendar_server_port
    if settings.calendar_full_calendar_url:
        calendar_cfg["full_calendar_url"] = settings.calendar_full_calendar_url
    if settings.calendar_full_contact_list_url:
        calendar_cfg["full_contact_list_url"] = settings.calendar_full_contact_list_url
    if calendar_cfg:
        config["calendar"] = calendar_cfg

    mail_cfg: dict[str, Any] = {
        "use_ssl": settings.mail_use_ssl,
        "use_tls": settings.mail_use_tls,
    }
    if settings.mail_incoming_server:
        mail_cfg["incoming_server"] = settings.mail_incoming_server
    if settings.mail_incoming_port_imap is not None:
        mail_cfg["incoming_port_imap"] = settings.mail_incoming_port_imap
    if settings.mail_outgoing_server:
        mail_cfg["outgoing_server"] = settings.mail_outgoing_server
    if settings.mail_outgoing_port_smtp is not None:
        mail_cfg["outgoing_port_smtp"] = settings.mail_outgoing_port_smtp
    if settings.mail_from_name:
        mail_cfg["from_name"] = settings.mail_from_name
    config["mail"] = mail_cfg

    if settings.denue_base_url:
        config["denue"] = {"base_url": settings.denue_base_url}
    if settings.brevo_base_url:
        config["brevo"] = {"base_url": settings.brevo_base_url}
    return config


def _parse_default_value(value: str) -> Any:
    raw = value.strip()
    if not raw:
        return ""
    lowered = raw.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        if "." not in raw:
            return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        pass
    if raw[:1] in {"{", "["} or raw[:1] in {'"', "'"}:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw
    return raw


def _apply_plan_defaults_to_config(
    *,
    current_config: dict[str, Any],
    plan_defaults: list[dict[str, Any]],
) -> dict[str, Any]:
    config = dict(current_config)
    for default_row in plan_defaults:
        if not isinstance(default_row, dict):
            continue
        default_key = str(default_row.get("default_key") or "").strip()
        if not default_key:
            continue
        value = _parse_default_value(str(default_row.get("default_value") or ""))
        current_value = _get_config_value(config, default_key)
        if current_value is not None:
            continue
        parts = default_key.split(".")
        cursor = config
        for part in parts[:-1]:
            next_value = cursor.get(part)
            if not isinstance(next_value, dict):
                cursor[part] = {}
            cursor = cursor[part]
        cursor[parts[-1]] = value
    return config


async def _ensure_tenant_calendar_bootstrap(
    *,
    repo: PlatformRepository,
    tenant_id: UUID,
    tenant_name: str,
    current_config: dict[str, Any],
) -> dict[str, Any]:
    existing_resource = _get_config_value(current_config, "webchat.calendar.resource_id")
    resource_id = (
        str(existing_resource).strip()
        if isinstance(existing_resource, str) and existing_resource.strip()
        else ""
    )
    if not resource_id:
        resource_row = await repo.create_calendar_resource(
            organizacion_id=tenant_id,
            name=f"{tenant_name} - Agenda principal",
            slug="default",
            timezone=settings.webchat_calendar_timezone,
            metadata={"source": "stripe.provisioning"},
        )
        resource_id = str(resource_row.get("id") or "").strip()
        if not resource_id:
            raise PlatformRepositoryError("calendar_resource_create_failed")

    defaults = _build_default_tenant_config(calendar_resource_id=resource_id)
    return _merge_missing_config(dict(current_config), defaults)


async def _ensure_tenant_pipeline_bootstrap(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
) -> None:
    try:
        stages = await repo.list_pipeline_stages(organizacion_id=organizacion_id)
    except PlatformRepositoryError as exc:
        logger.warning(
            "tenant_bootstrap.pipeline_catalog_fetch_failed",
            extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
        )
        stages = []

    existing_codes = {
        str(row.get("codigo") or "").strip().lower()
        for row in stages
        if isinstance(row, dict) and row.get("codigo")
    }
    for stage in PIPELINE_STAGE_SEED:
        code = str(stage["codigo"]).strip().lower()
        if not code or code in existing_codes:
            continue
        try:
            await repo.create_pipeline_stage(
                organizacion_id=organizacion_id,
                codigo=code,
                nombre=str(stage["nombre"]),
                orden=int(stage["orden"]),
                probabilidad=float(stage["probabilidad"]),
                categoria=str(stage["categoria"]),
                metadata=dict(stage["metadata"]),
            )
            existing_codes.add(code)
        except PlatformRepositoryError as exc:
            logger.warning(
                "tenant_bootstrap.pipeline_seed_failed",
                extra={"organizacion_id": str(organizacion_id), "codigo": code, "error": str(exc)},
            )


async def _ensure_permissions_exist(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
    permission_codes: tuple[str, ...],
) -> None:
    existing = await repo.list_permissions(organizacion_id=organizacion_id)
    existing_codes = {
        str(row.get("codigo") or "").strip()
        for row in existing
        if isinstance(row, dict) and row.get("codigo")
    }
    missing = [code for code in permission_codes if code not in existing_codes]
    if not missing:
        return
    payload = [{"codigo": code, "descripcion": code} for code in missing]
    await repo.create_permissions(organizacion_id=organizacion_id, permisos=payload)


async def _ensure_role_exists(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
    nombre: str,
    descripcion: str | None = None,
) -> UUID:
    target = nombre.strip().lower()
    roles = await repo.list_roles(organizacion_id=organizacion_id)
    for row in roles:
        if not isinstance(row, dict):
            continue
        role_name = str(row.get("nombre") or "").strip().lower()
        if role_name != target:
            continue
        role_id = row.get("id")
        if role_id:
            return UUID(str(role_id))
    created = await repo.create_role(organizacion_id=organizacion_id, nombre=target, descripcion=descripcion)
    return UUID(str(created["id"]))


async def _grant_all_permissions_to_role(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
    rol_id: UUID,
) -> None:
    permissions = await repo.list_permissions(organizacion_id=organizacion_id)
    current = await repo.list_role_permissions(organizacion_id=organizacion_id, rol_id=rol_id)
    current_perm_ids = {
        UUID(str(row["permiso_id"]))
        for row in current
        if isinstance(row, dict) and row.get("permiso_id")
    }
    for row in permissions:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        permiso_id = UUID(str(row["id"]))
        if permiso_id in current_perm_ids:
            continue
        await repo.create_role_permission(
            organizacion_id=organizacion_id,
            rol_id=rol_id,
            permiso_id=permiso_id,
        )


async def _ensure_default_org_structure(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
) -> None:
    try:
        department_names = await repo.list_tenant_bootstrap_catalog(tipo="departamento")
    except PlatformRepositoryError as exc:
        logger.warning(
            "tenant_bootstrap.department_catalog_fallback",
            extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
        )
        department_names = list(FALLBACK_TENANT_DEPARTMENT_NAMES)
    if not department_names:
        department_names = list(FALLBACK_TENANT_DEPARTMENT_NAMES)

    try:
        position_names = await repo.list_tenant_bootstrap_catalog(tipo="puesto")
    except PlatformRepositoryError as exc:
        logger.warning(
            "tenant_bootstrap.position_catalog_fallback",
            extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
        )
        position_names = list(FALLBACK_TENANT_POSITION_NAMES)
    if not position_names:
        position_names = list(FALLBACK_TENANT_POSITION_NAMES)

    for name in department_names:
        try:
            await repo.create_department(organizacion_id=organizacion_id, nombre=name)
        except PlatformRepositoryError as exc:
            logger.warning(
                "tenant_bootstrap.department_seed_failed",
                extra={"organizacion_id": str(organizacion_id), "departamento": name, "error": str(exc)},
            )

    for name in position_names:
        try:
            await repo.create_position(organizacion_id=organizacion_id, nombre=name)
        except PlatformRepositoryError as exc:
            logger.warning(
                "tenant_bootstrap.position_seed_failed",
                extra={"organizacion_id": str(organizacion_id), "puesto": name, "error": str(exc)},
            )


async def provision_tenant_from_billing(
    *,
    repo: PlatformRepository,
    tenant_id: UUID,
    source: str,
) -> dict[str, Any]:
    now_iso = datetime.now(tz=UTC).isoformat()
    job: dict[str, Any] | None = None
    try:
        job = await repo.create_tenant_provisioning_job(
            payload={
                "tenant_id": str(tenant_id),
                "source": source,
                "status": "running",
                "step": "billing_received",
                "attempts": 0,
                "started_at": now_iso,
            }
        )
    except PlatformRepositoryError as exc:
        logger.warning(
            "tenant_provisioning.job_create_failed",
            extra={"tenant_id": str(tenant_id), "source": source, "error": str(exc)},
        )

    try:
        tenant = await repo.get_organizacion_details(organizacion_id=tenant_id)
        if not tenant:
            raise PlatformRepositoryError("tenant_not_found")

        billing_account = await repo.get_tenant_billing_account(tenant_id=tenant_id)
        if not billing_account:
            raise PlatformRepositoryError("tenant_billing_account_not_found")

        plan_id_value = billing_account.get("plan_id")
        if not plan_id_value:
            raise PlatformRepositoryError("commercial_plan_missing")
        plan_id = UUID(str(plan_id_value))

        plan = await repo.get_commercial_plan(plan_id=plan_id)
        if not plan:
            raise PlatformRepositoryError("commercial_plan_not_found")

        current_config = await repo.get_organizacion_config(organizacion_id=tenant_id) or {}
        plan_defaults = [
            row
            for row in await repo.list_commercial_plan_defaults()
            if isinstance(row, dict) and str(row.get("plan_id")) == str(plan_id)
        ]
        merged_config = _apply_plan_defaults_to_config(
            current_config=current_config,
            plan_defaults=plan_defaults,
        )
        merged_config = await _ensure_tenant_calendar_bootstrap(
            repo=repo,
            tenant_id=tenant_id,
            tenant_name=str(tenant.get("nombre") or "Tenant"),
            current_config=merged_config,
        )
        await repo.set_organizacion_config(organizacion_id=tenant_id, config=merged_config)
        await _ensure_tenant_pipeline_bootstrap(repo=repo, organizacion_id=tenant_id)
        await _ensure_permissions_exist(
            repo=repo,
            organizacion_id=tenant_id,
            permission_codes=TENANT_BASE_PERMISSION_CODES,
        )
        owner_role_id = await _ensure_role_exists(
            repo=repo,
            organizacion_id=tenant_id,
            nombre="owner",
            descripcion="Rol propietario del tenant",
        )
        await _grant_all_permissions_to_role(
            repo=repo,
            organizacion_id=tenant_id,
            rol_id=owner_role_id,
        )
        await _ensure_default_org_structure(repo=repo, organizacion_id=tenant_id)
        await repo.update_organizacion_details(
            organizacion_id=tenant_id,
            payload={"activo": True},
        )

        existing_invitation = await repo.get_latest_tenant_access_invitation(
            tenant_id=tenant_id,
            flow_kind="stripe",
        )
        if not existing_invitation or str(existing_invitation.get("status") or "") in {
            "failed",
            "expired",
        }:
            access_email = str(
                tenant.get("correo_contacto_principal")
                or tenant.get("correo_facturacion")
                or ""
            ).strip()
            if access_email:
                try:
                    await create_tenant_access_invitation(
                        repo=repo,
                        tenant_id=tenant_id,
                        email=access_email,
                        flow_kind="stripe",
                        tenant_name=str(tenant.get("nombre") or "Tenant"),
                    )
                except EmailSendError as exc:
                    logger.warning(
                        "tenant_provisioning.access_invitation_email_failed",
                        extra={"tenant_id": str(tenant_id), "source": source, "error": str(exc)},
                    )
            else:
                logger.warning(
                    "tenant_provisioning.access_email_missing",
                    extra={"tenant_id": str(tenant_id), "source": source},
                )

        if job:
            await repo.update_tenant_provisioning_job(
                job_id=UUID(str(job["id"])),
                payload={
                    "status": "completed",
                    "step": "completed",
                    "finished_at": datetime.now(tz=UTC).isoformat(),
                    "last_error": None,
                },
            )
        return {"ok": True, "tenant_id": str(tenant_id), "source": source, "plan_code": plan.get("code")}
    except Exception as exc:
        if job:
            try:
                await repo.update_tenant_provisioning_job(
                    job_id=UUID(str(job["id"])),
                    payload={
                        "status": "failed",
                        "step": "failed",
                        "finished_at": datetime.now(tz=UTC).isoformat(),
                        "last_error": str(exc),
                    },
                )
            except PlatformRepositoryError:
                logger.exception(
                    "tenant_provisioning.job_update_failed",
                    extra={"tenant_id": str(tenant_id), "source": source},
                )
        raise
