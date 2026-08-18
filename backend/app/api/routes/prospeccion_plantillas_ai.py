"""Catálogo y generación de borradores IA para plantillas de prospección."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.routes.admin import get_platform_repo
from app.api.routes.crm import get_repository, require_organizacion_id, require_permission
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.prospeccion_plantilla_ai import (
    TemplateAiGenerationRequest,
    generate_template_draft,
)

router = APIRouter(prefix="/crm/prospeccion/plantillas/ai", tags=["prospeccion-plantillas-ai"])


@router.get("/variables")
async def list_template_ai_variables(
    *,
    _: str = Depends(require_permission("ejecutar_busquedas")),
    canal: str,
    organizacion_id: UUID = Depends(require_organizacion_id),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> dict[str, Any]:
    if canal not in {"correo", "whatsapp"}:
        raise HTTPException(status_code=400, detail="template_ai_channel_invalid")
    try:
        rows = await platform_repo.list_prospeccion_template_ai_variables(canal=canal)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="template_ai_catalog_unavailable") from exc
    items: list[dict[str, Any]] = []
    for row in rows:
        variable = row.get("variable")
        if not isinstance(variable, dict):
            continue
        items.append(
            {
                "id": variable.get("id"),
                "clave": variable.get("clave"),
                "etiqueta": variable.get("etiqueta"),
                "descripcion": variable.get("descripcion"),
                "tipo_dato": variable.get("tipo_dato"),
                "orden": variable.get("orden"),
                "permite_asunto": row.get("permite_asunto", False),
                "permite_cuerpo_texto": row.get("permite_cuerpo_texto", False),
                "permite_cuerpo_html": row.get("permite_cuerpo_html", False),
                "permite_header_media": row.get("permite_header_media", False),
            }
        )
    return {"ok": True, "canal": canal, "items": items}


@router.post("/generate", status_code=status.HTTP_200_OK)
async def generate_template_ai_draft(
    payload: TemplateAiGenerationRequest,
    *,
    _: str = Depends(require_permission("ejecutar_busquedas")),
    organizacion_id: UUID = Depends(require_organizacion_id),
    crm_repo: CRMRepository = Depends(get_repository),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> dict[str, Any]:
    try:
        permission_context = await crm_repo.get_permission_context()
        usuario_id = UUID(str(permission_context.get("usuario_id")))
    except (CRMRepositoryError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="auth_user_invalid") from exc
    try:
        return await generate_template_draft(
            request=payload,
            organizacion_id=organizacion_id,
            usuario_id=usuario_id,
            crm_repo=crm_repo,
            platform_repo=platform_repo,
        )
    except ValueError as exc:
        detail = str(exc)
        known = {
            "campana_not_found",
            "template_ai_campaign_channel_mismatch",
            "template_ai_prompt_not_configured",
            "template_ai_variable_not_allowed",
            "template_ai_unknown_variable",
            "html_forbidden_content",
            "html_tag_not_allowed",
            "html_empty",
        }
        if detail in known:
            raise HTTPException(status_code=400, detail=detail) from exc
        raise HTTPException(status_code=502, detail="template_ai_invalid_provider_response") from exc
    except (CRMRepositoryError, PlatformRepositoryError) as exc:
        raise HTTPException(status_code=502, detail="template_ai_persistence_failed") from exc
    except Exception as exc:  # pragma: no cover - proveedor externo
        # OpenAI devuelve este error cuando la versión publicada del prompt
        # no contiene alguna de las variables enviadas por el backend.
        if "prompt_variable_unknown" in str(exc):
            raise HTTPException(status_code=400, detail="template_ai_prompt_variables_not_configured") from exc
        raise HTTPException(status_code=502, detail="template_ai_provider_unavailable") from exc
