"""Flujo de verificacion de correo e invitacion de acceso para tenants."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import EmailSendError, send_email
from app.services.supabase_admin import create_supabase_user

logger = get_logger("app.services.tenant_access_onboarding")

TOKEN_TTL_HOURS = 72


@dataclass(slots=True)
class TenantAccessInvitationResult:
    invitation_id: UUID
    raw_token: str
    token_hash: str
    verification_url: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _resolve_portal_base_url() -> str:
    base_url = (settings.cliente_portal_base_url or "https://talia.mx").strip()
    return base_url.rstrip("/")


def _build_verification_url(*, token: str) -> str:
    return f"{_resolve_portal_base_url()}/auth/confirm-email?token={token}"


def _build_confirmation_subject(*, tenant_name: str) -> str:
    return f"Confirma tu correo para activar {tenant_name}"


def _build_confirmation_text(*, tenant_name: str, verification_url: str) -> str:
    return (
        f"Recibimos una solicitud para activar {tenant_name}.\n\n"
        f"Confirma tu correo para continuar con la invitación de acceso:\n{verification_url}\n\n"
        "Si no solicitaste este alta, puedes ignorar este mensaje."
    )


def _build_confirmation_html(*, tenant_name: str, verification_url: str) -> str:
    return (
        "<div style='font-family:Arial,sans-serif;line-height:1.5'>"
        f"<p>Recibimos una solicitud para activar <strong>{tenant_name}</strong>.</p>"
        "<p>Confirma tu correo para continuar con la invitación de acceso:</p>"
        f"<p><a href='{verification_url}'>Confirmar correo y continuar</a></p>"
        "<p>Si no solicitaste este alta, puedes ignorar este mensaje.</p>"
        "</div>"
    )


async def create_tenant_access_invitation(
    *,
    repo: PlatformRepository,
    tenant_id: UUID,
    email: str,
    flow_kind: str,
    tenant_name: str,
) -> TenantAccessInvitationResult:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    verification_url = _build_verification_url(token=token)
    expires_at = (datetime.now(tz=UTC) + timedelta(hours=TOKEN_TTL_HOURS)).isoformat()
    invitation = await repo.create_tenant_access_invitation(
        payload={
            "tenant_id": str(tenant_id),
            "email": email,
            "flow_kind": flow_kind,
            "status": "pending_verification",
            "verification_token_hash": token_hash,
            "verification_sent_at": datetime.now(tz=UTC).isoformat(),
            "expires_at": expires_at,
        }
    )

    try:
        send_email(
            subject=_build_confirmation_subject(tenant_name=tenant_name),
            body_text=_build_confirmation_text(tenant_name=tenant_name, verification_url=verification_url),
            body_html=_build_confirmation_html(tenant_name=tenant_name, verification_url=verification_url),
            recipients=[email],
            flow="tenant_access_confirmation",
        )
    except EmailSendError as exc:
        logger.warning(
            "tenant_access_confirmation_email_failed",
            extra={"tenant_id": str(tenant_id), "email": email, "error": str(exc)},
        )
        try:
            await repo.update_tenant_access_invitation(
                invitation_id=UUID(str(invitation["id"])),
                payload={"status": "failed", "last_error": str(exc)},
            )
        except Exception:
            logger.exception(
                "tenant_access_confirmation_invitation_mark_failed_error",
                extra={"tenant_id": str(tenant_id), "email": email},
            )
        raise

    return TenantAccessInvitationResult(
        invitation_id=UUID(str(invitation["id"])),
        raw_token=token,
        token_hash=token_hash,
        verification_url=verification_url,
    )


async def confirm_tenant_access_invitation(
    *,
    repo: PlatformRepository,
    token: str,
) -> dict[str, Any]:
    token_hash = _hash_token(token)
    invitation = await repo.get_tenant_access_invitation_by_token_hash(token_hash=token_hash)
    if not invitation:
        raise PlatformRepositoryError("tenant_access_invitation_not_found")
    invitation_id = UUID(str(invitation["id"]))
    if str(invitation.get("status") or "") not in {"pending_verification", "failed"}:
        raise PlatformRepositoryError("tenant_access_invitation_not_pending")
    expires_at_raw = invitation.get("expires_at")
    if isinstance(expires_at_raw, str) and expires_at_raw.strip():
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at < datetime.now(tz=UTC):
            await repo.update_tenant_access_invitation(
                invitation_id=invitation_id,
                payload={"status": "expired", "last_error": "verification_token_expired"},
            )
            raise PlatformRepositoryError("tenant_access_invitation_expired")

    tenant_id = UUID(str(invitation["tenant_id"]))
    email = str(invitation["email"]).strip()
    tenant = await repo.get_organizacion_details(organizacion_id=tenant_id)
    if not tenant:
        raise PlatformRepositoryError("tenant_not_found")

    now_iso = datetime.now(tz=UTC).isoformat()
    await repo.update_tenant_access_invitation(
        invitation_id=invitation_id,
        payload={
            "status": "email_verified",
            "verified_at": now_iso,
            "last_error": None,
        },
    )

    tenant_name = str(tenant.get("nombre") or "Tenant")
    try:
        usuario_id_str, telefono_value = await create_supabase_user(
            email=email,
            nombre=str(tenant.get("contacto_nombre") or tenant_name),
            telefono=str(tenant.get("contacto_telefono") or "") or None,
            organizacion_id=str(tenant_id),
        )
        usuario_id = UUID(usuario_id_str)

        await repo.upsert_usuario(
            usuario_id=usuario_id,
            payload={
                "correo": email,
                "nombre_completo": str(tenant.get("contacto_nombre") or tenant_name),
                "telefono_e164": telefono_value,
                "estado": "activo",
                "organizacion_id": str(tenant_id),
            },
        )

        owner_role_id = await _resolve_owner_role_id(repo=repo, organizacion_id=tenant_id)
        await _grant_owner_access(
            repo=repo,
            organizacion_id=tenant_id,
            usuario_id=usuario_id,
            owner_role_id=owner_role_id,
        )

        if not tenant.get("fecha_alta"):
            await repo.update_organizacion_details(
                organizacion_id=tenant_id,
                payload={"activo": True},
            )

        await repo.update_tenant_access_invitation(
            invitation_id=invitation_id,
            payload={
                "status": "completed",
                "verified_at": now_iso,
                "invited_at": datetime.now(tz=UTC).isoformat(),
                "invited_user_id": str(usuario_id),
                "last_error": None,
            },
        )
    except Exception as exc:
        try:
            await repo.update_tenant_access_invitation(
                invitation_id=invitation_id,
                payload={
                    "status": "failed",
                    "last_error": str(exc),
                },
            )
        except Exception:
            logger.exception(
                "tenant_access_invitation_mark_failed_error",
                extra={"tenant_id": str(tenant_id), "email": email},
            )
        raise

    return {
        "ok": True,
        "tenant_id": str(tenant_id),
        "usuario_id": str(usuario_id),
        "email": email,
        "role": "owner",
    }


async def _resolve_owner_role_id(*, repo: PlatformRepository, organizacion_id: UUID) -> UUID:
    roles = await repo.list_roles(organizacion_id=organizacion_id)
    for row in roles:
        if str(row.get("nombre") or "").strip().lower() == "owner":
            return UUID(str(row["id"]))
    raise PlatformRepositoryError("owner_role_not_found")


async def _grant_owner_access(
    *,
    repo: PlatformRepository,
    organizacion_id: UUID,
    usuario_id: UUID,
    owner_role_id: UUID,
) -> None:
    await repo.assign_user_role(
        usuario_id=usuario_id,
        rol_id=owner_role_id,
        organizacion_id=organizacion_id,
    )
