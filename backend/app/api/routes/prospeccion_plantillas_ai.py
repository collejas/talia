"""Catálogo y generación de borradores IA para plantillas de prospección."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.api.routes.admin import get_platform_repo
from app.api.routes.crm import get_repository, require_organizacion_id, require_permission
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.prospeccion_plantilla_ai import (
    TemplateAiGenerationRequest,
    generate_template_draft,
)
from app.services.tenant_runtime import MASTER_ORGANIZACION_ID

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
    try:
        layout_rows = await platform_repo.list_prospeccion_template_ai_layouts(
            canal=canal,
            organizacion_id=organizacion_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="template_ai_layouts_unavailable") from exc
    layouts = [
        {
            "id": row.get("id"),
            "codigo": row.get("codigo"),
            "nombre": row.get("nombre"),
            "descripcion": row.get("descripcion"),
            "instrucciones_composicion": row.get("instrucciones_composicion"),
            "predeterminado": row.get("predeterminado", False),
        }
        for row in layout_rows
        if row.get("activo") is True and row.get("habilitado") is True
    ]
    return {"ok": True, "canal": canal, "items": items, "layouts": layouts}


async def _run_template_ai_generation(
    *,
    payload: TemplateAiGenerationRequest,
    organizacion_id: UUID,
    usuario_id: UUID,
    generation_id: UUID,
    crm_repo: CRMRepository,
    platform_repo: PlatformRepository,
) -> None:
    try:
        await generate_template_draft(
            request=payload,
            organizacion_id=organizacion_id,
            usuario_id=usuario_id,
            crm_repo=crm_repo,
            platform_repo=platform_repo,
            generation_id=generation_id,
        )
    except Exception as exc:  # The service persists provider and validation failures.
        error_code = "template_ai_provider_timeout" if isinstance(exc, (asyncio.TimeoutError, TimeoutError)) else (str(exc).strip()[:120] or "template_ai_generation_failed")
        await platform_repo.update_prospeccion_template_ai_generation(
            organizacion_id=organizacion_id,
            generation_id=generation_id,
            payload={
                "resultado_estado": "respuesta_invalida" if isinstance(exc, ValueError) else "error",
                "error_codigo": error_code,
                "finalizado_en": datetime.now(timezone.utc).isoformat(),
            },
        )


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_template_ai_draft(
    payload: TemplateAiGenerationRequest,
    *,
    background_tasks: BackgroundTasks,
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
        configs = await platform_repo.list_prospeccion_template_ai_prompt_configs(
            organizacion_id=MASTER_ORGANIZACION_ID,
        )
        config = next((row for row in configs if row.get("canal") == payload.canal and row.get("activo") is True), None)
        if not config:
            raise ValueError("template_ai_prompt_not_configured")
        generation = await platform_repo.create_prospeccion_template_ai_generation(
            payload={
                "organizacion_id": str(organizacion_id),
                "usuario_id": str(usuario_id),
                "campana_id": str(payload.campana_id) if payload.campana_id else None,
                "canal": payload.canal,
                "prompt_id": str(config.get("prompt_id") or ""),
                "prompt_version": str(config.get("prompt_version") or ""),
                "modelo": "prompt_configured",
                "instruccion_usuario": payload.instruccion_usuario,
                "tono": payload.tono,
                "idioma": payload.idioma,
                "estilo_diseno_solicitado": payload.estilo_diseno if payload.canal == "correo" else None,
                "resultado_estado": "solicitada",
            }
        )
        generation_id = UUID(str(generation["id"]))
        background_tasks.add_task(
            _run_template_ai_generation,
            payload=payload,
            organizacion_id=organizacion_id,
            usuario_id=usuario_id,
            generation_id=generation_id,
            crm_repo=crm_repo,
            platform_repo=platform_repo,
        )
        return {"ok": True, "status": "solicitada", "generation_id": str(generation_id)}
    except ValueError as exc:
        detail = str(exc)
        known = {
            "campana_not_found",
            "template_ai_campaign_channel_mismatch",
            "template_ai_prompt_not_configured",
            "template_ai_variable_not_allowed",
            "template_ai_unknown_variable",
            "template_ai_selected_cta_not_used",
            "template_ai_booking_link_dependency",
            "template_ai_layout_not_allowed",
            "template_ai_layout_mismatch",
            "html_forbidden_content",
            "html_tag_not_allowed",
            "html_empty",
        }
        if detail in known or detail.startswith("html_tag_not_allowed:"):
            raise HTTPException(status_code=400, detail=detail) from exc
        raise HTTPException(status_code=502, detail="template_ai_invalid_provider_response") from exc
    except (CRMRepositoryError, PlatformRepositoryError) as exc:
        raise HTTPException(status_code=502, detail="template_ai_persistence_failed") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="template_ai_provider_timeout") from exc
    except Exception as exc:  # pragma: no cover - proveedor externo
        # OpenAI devuelve este error cuando la versión publicada del prompt
        # no contiene alguna de las variables enviadas por el backend.
        if "prompt_variable_unknown" in str(exc):
            raise HTTPException(status_code=400, detail="template_ai_prompt_variables_not_configured") from exc
        raise HTTPException(status_code=502, detail="template_ai_provider_unavailable") from exc


@router.get("/generations/{generation_id}")
async def get_template_ai_generation(
    generation_id: UUID,
    *,
    _: str = Depends(require_permission("ejecutar_busquedas")),
    organizacion_id: UUID = Depends(require_organizacion_id),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> dict[str, Any]:
    try:
        row = await platform_repo.get_prospeccion_template_ai_generation(
            organizacion_id=organizacion_id,
            generation_id=generation_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="template_ai_generation_unavailable") from exc
    if not row:
        raise HTTPException(status_code=404, detail="template_ai_generation_not_found")
    result = None
    if row.get("resultado_estado") == "generada":
        result = {
            "nombre_sugerido": row.get("resultado_nombre_sugerido") or "",
            "descripcion": row.get("resultado_descripcion") or "",
            "cuerpo_texto": row.get("resultado_cuerpo_texto") or "",
            "variables_usadas": row.get("resultado_variables_usadas") or [],
            "advertencias": row.get("resultado_advertencias") or [],
        }
        if row.get("canal") == "correo":
            result.update({"asunto": row.get("resultado_asunto") or "", "cuerpo_html": row.get("resultado_cuerpo_html") or "", "estilo_diseno": row.get("estilo_diseno_aplicado") or row.get("estilo_diseno_solicitado") or "automatico"})
        else:
            result.update({"meta_category_sugerida": row.get("resultado_meta_category_sugerida") or "no_determinada", "language_code_sugerido": row.get("resultado_language_code_sugerido") or "es_MX"})
    return {
        "ok": True,
        "generation_id": str(row.get("id") or generation_id),
        "status": row.get("resultado_estado") or "solicitada",
        "error": row.get("error_codigo") if row.get("resultado_estado") in {"error", "respuesta_invalida"} else None,
        "resultado": result,
    }
