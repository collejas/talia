"""Rutas públicas para confirmacion de correo en onboarding comercial."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.tenant_access_onboarding import confirm_tenant_access_invitation

from .admin import get_platform_repo

router = APIRouter(prefix="/public/auth", tags=["public-auth"])


class ConfirmEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(..., min_length=8)


class ConfirmEmailResponse(BaseModel):
    ok: bool = True
    tenant_id: str
    usuario_id: str
    email: str
    role: str


@router.post("/confirm-email", response_model=ConfirmEmailResponse)
async def confirm_email(
    payload: ConfirmEmailRequest,
    repo: PlatformRepository = Depends(get_platform_repo),
) -> ConfirmEmailResponse:
    try:
        result = await confirm_tenant_access_invitation(repo=repo, token=payload.token.strip())
    except PlatformRepositoryError as exc:
        detail = str(exc)
        status_code = 404 if detail in {"tenant_access_invitation_not_found"} else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc

    return ConfirmEmailResponse(
        tenant_id=result["tenant_id"],
        usuario_id=result["usuario_id"],
        email=result["email"],
        role=result["role"],
    )
