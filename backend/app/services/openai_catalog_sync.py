"""Sincronización de catálogos legibles de OpenAI."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.services.openai import get_openai_client
from app.services.tenant_runtime import get_openai_api_key, get_openai_project_id, get_org_config, get_secret_plaintext

logger = get_logger("app.services.openai_catalog_sync")

MASTER_ORGANIZACION_ID = UUID("00000000-0000-0000-0000-000000000001")


@dataclass(slots=True)
class SyncSummary:
    projects_upserted: int = 0
    assistants_upserted: int = 0
    prompts_upserted: int = 0
    organizations_scanned: int = 0


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


async def _supabase_request(method: str, path: str, *, params: dict[str, str] | None = None, json_payload: Any = None, prefer: str | None = None) -> httpx.Response:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("supabase_not_configured")
    headers = {
        "Accept": "application/json",
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    if prefer:
        headers["Prefer"] = prefer
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.request(
            method,
            f"{settings.supabase_url.rstrip('/')}{path}",
            params=params,
            json=json_payload,
            headers=headers,
        )
    response.raise_for_status()
    return response


async def _list_organizations() -> list[dict[str, Any]]:
    response = await _supabase_request(
        "GET",
        "/rest/v1/organizaciones",
        params={"select": "id,nombre,config", "order": "nombre.asc"},
    )
    data = response.json()
    return data if isinstance(data, list) else []


async def _upsert_project(project_id: str, display_name: str, *, source_kind: str, metadata: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await _supabase_request(
        "POST",
        "/rest/v1/openai_projects_catalog",
        params={"on_conflict": "project_id"},
        json_payload={
            "project_id": project_id,
            "display_name": display_name,
            "source_kind": source_kind,
            "metadata": metadata,
            "last_synced_at": now,
            "updated_at": now,
        },
        prefer="resolution=merge-duplicates,return=minimal",
    )


async def _upsert_resource(resource_id: str, *, resource_kind: str, display_name: str, openai_project_id: str | None, source_kind: str, metadata: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await _supabase_request(
        "POST",
        "/rest/v1/openai_assistants_catalog",
        params={"on_conflict": "resource_id"},
        json_payload={
            "resource_id": resource_id,
            "resource_kind": resource_kind,
            "display_name": display_name,
            "openai_project_id": openai_project_id,
            "source_kind": source_kind,
            "metadata": metadata,
            "last_synced_at": now,
            "updated_at": now,
        },
        prefer="resolution=merge-duplicates,return=minimal",
    )


async def _resolve_admin_api_key() -> str | None:
    secret = await get_secret_plaintext(organizacion_id=MASTER_ORGANIZACION_ID, clave="openai.admin_api_key")
    return secret or settings.openai_admin_api_key


async def _sync_projects_from_openai(project_ids: set[str]) -> int:
    admin_api_key = await _resolve_admin_api_key()
    if not admin_api_key:
        return 0

    count = 0
    headers = {"Authorization": f"Bearer {admin_api_key}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        for project_id in project_ids:
            try:
                response = await client.get(f"https://api.openai.com/v1/organization/projects/{project_id}", headers=headers)
                if response.status_code >= 400:
                    logger.warning("openai_catalog_sync.project_retrieve_failed", extra={"project_id": project_id, "status_code": response.status_code})
                    continue
                payload = response.json()
                display_name = str(payload.get("name") or project_id).strip()
                await _upsert_project(
                    project_id,
                    display_name,
                    source_kind="openai_admin",
                    metadata={"status": payload.get("status"), "raw": payload},
                )
                count += 1
            except Exception as exc:
                logger.warning("openai_catalog_sync.project_sync_failed", extra={"project_id": project_id, "error": str(exc)})
    return count


def _configured_resources(config: dict[str, Any]) -> list[tuple[str, str, str]]:
    webchat = _as_dict(config.get("webchat"))
    whatsapp = _as_dict(config.get("whatsapp"))
    whatsapp_prospeccion = _as_dict(whatsapp.get("prospeccion"))
    messenger = _as_dict(config.get("messenger"))
    resources: list[tuple[str, str, str]] = []

    def add(slot_label: str, resource_kind: str, value: Any) -> None:
        if isinstance(value, str) and value.strip():
            resources.append((resource_kind, value.strip(), slot_label))

    add("Webchat principal", "prompt" if str(webchat.get("assistant_id") or "").startswith("pmpt_") else "assistant", webchat.get("assistant_id"))
    add("WhatsApp principal", "prompt", whatsapp.get("prompt_id"))
    add("WhatsApp assistant", "assistant", whatsapp.get("assistant_id"))
    add("WhatsApp prospección", "prompt", whatsapp_prospeccion.get("prompt_id"))
    add("Messenger principal", "prompt", messenger.get("prompt_id"))
    add("Messenger principal", "assistant", messenger.get("assistant_id"))
    return resources


async def _sync_resources_for_org(organizacion_id: UUID, organizacion_nombre: str | None, config: dict[str, Any]) -> tuple[int, int]:
    api_key = await get_openai_api_key(organizacion_id=organizacion_id)
    project_id = await get_openai_project_id(organizacion_id=organizacion_id)
    prompts_count = 0
    assistants_count = 0

    client = get_openai_client(api_key=api_key, project_id=project_id) if api_key else None

    for resource_kind, resource_id, slot_label in _configured_resources(config):
        display_name = slot_label
        source_kind = "tenant_config"
        metadata: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "organizacion_nombre": organizacion_nombre,
            "slot_label": slot_label,
        }

        if resource_kind == "assistant" and client is not None:
            try:
                record = await client.beta.assistants.retrieve(assistant_id=resource_id)
                dump = record.model_dump()
                remote_name = str(dump.get("name") or "").strip()
                if remote_name:
                    display_name = remote_name
                metadata["raw"] = dump
                source_kind = "openai_assistant"
            except Exception as exc:
                metadata["sync_error"] = str(exc)
                logger.warning(
                    "openai_catalog_sync.assistant_retrieve_failed",
                    extra={"organizacion_id": str(organizacion_id), "assistant_id": resource_id, "error": str(exc)},
                )

        await _upsert_resource(
            resource_id,
            resource_kind=resource_kind,
            display_name=display_name,
            openai_project_id=project_id,
            source_kind=source_kind,
            metadata=metadata,
        )
        if resource_kind == "assistant":
            assistants_count += 1
        else:
            prompts_count += 1

    return assistants_count, prompts_count


async def sync_openai_catalogs() -> dict[str, Any]:
    organizations = await _list_organizations()
    summary = SyncSummary(organizations_scanned=len(organizations))
    project_ids: set[str] = set()

    for row in organizations:
        raw_org_id = row.get("id")
        if not isinstance(raw_org_id, str):
            continue
        try:
            organizacion_id = UUID(raw_org_id)
        except ValueError:
            continue
        nombre = row.get("nombre") if isinstance(row.get("nombre"), str) else None
        config = _as_dict(row.get("config"))
        project_id = await get_openai_project_id(organizacion_id=organizacion_id)
        if project_id:
            project_ids.add(project_id)
            await _upsert_project(
                project_id,
                project_id,
                source_kind="tenant_config",
                metadata={"organizacion_id": str(organizacion_id), "organizacion_nombre": nombre},
            )
        assistants_count, prompts_count = await _sync_resources_for_org(organizacion_id, nombre, config)
        summary.assistants_upserted += assistants_count
        summary.prompts_upserted += prompts_count

    summary.projects_upserted += len(project_ids)
    summary.projects_upserted += await _sync_projects_from_openai(project_ids)

    return {
        "ok": True,
        "organizations_scanned": summary.organizations_scanned,
        "projects_upserted": summary.projects_upserted,
        "assistants_upserted": summary.assistants_upserted,
        "prompts_upserted": summary.prompts_upserted,
    }
