"""Sincroniza roles/permisos desde la matriz definida en docs."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError


MATRIX_SECTION_PREFIX = "## permisos por rol"


@dataclass(frozen=True)
class RolePermissionPlan:
    role_name: str
    permissions: tuple[str, ...]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    root = _repo_root()
    return (root / path).resolve()


def _normalize_permission(raw: str) -> str | None:
    cleaned = re.sub(r"\s*\(.*?\)", "", raw).strip()
    cleaned = cleaned.rstrip(".")
    return cleaned or None


def _parse_permissions_cell(cell: str) -> list[str]:
    parts = [part.strip() for part in cell.split(",")]
    permisos: list[str] = []
    for part in parts:
        norm = _normalize_permission(part)
        if norm:
            permisos.append(norm)
    return permisos


def parse_role_permissions_matrix(content: str) -> list[RolePermissionPlan]:
    lines = content.splitlines()
    section_index = None
    for idx, line in enumerate(lines):
        if line.strip().lower().startswith(MATRIX_SECTION_PREFIX):
            section_index = idx
            break
    if section_index is None:
        raise ValueError("matrix_section_missing")

    header_index = None
    for idx in range(section_index + 1, len(lines)):
        line = lines[idx].strip()
        if line.startswith("|") and "rol" in line.lower() and "permisos" in line.lower():
            header_index = idx
            break
    if header_index is None:
        raise ValueError("matrix_table_header_missing")

    rows: list[RolePermissionPlan] = []
    for line in lines[header_index + 2 :]:
        line = line.strip()
        if not line.startswith("|"):
            break
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 2:
            continue
        role = parts[0]
        perms = _parse_permissions_cell(parts[1])
        if role and perms:
            rows.append(RolePermissionPlan(role_name=role, permissions=tuple(perms)))
    if not rows:
        raise ValueError("matrix_table_empty")
    return rows


def compute_matrix_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _collect_permissions(plans: Iterable[RolePermissionPlan]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for plan in plans:
        for perm in plan.permissions:
            if perm in seen:
                continue
            seen.add(perm)
            ordered.append(perm)
    return ordered


async def sync_role_permissions(
    *,
    organizacion_id: UUID,
    plans: Iterable[RolePermissionPlan],
    prune: bool = True,
    dry_run: bool = False,
) -> dict[str, int]:
    log = get_logger("app.role_permissions_sync")
    repo = PlatformRepository()
    plans_list = list(plans)
    if not plans_list:
        raise ValueError("empty_plans")

    roles = await repo.list_roles(organizacion_id=organizacion_id)
    permisos = await repo.list_permissions(organizacion_id=organizacion_id)

    role_by_name = {
        (row.get("nombre") or "").strip().lower(): row for row in roles if isinstance(row, dict)
    }
    permisos_by_code = {
        (row.get("codigo") or "").strip(): row for row in permisos if isinstance(row, dict)
    }

    desired_codes = _collect_permissions(plans_list)
    missing_codes = [code for code in desired_codes if code not in permisos_by_code]
    if missing_codes:
        if dry_run:
            log.info("role_perms.missing_permissions", extra={"count": len(missing_codes)})
        else:
            payload = [{"codigo": code, "descripcion": code} for code in missing_codes]
            await repo.create_permissions(organizacion_id=organizacion_id, permisos=payload)
            permisos = await repo.list_permissions(organizacion_id=organizacion_id)
            permisos_by_code = {
                (row.get("codigo") or "").strip(): row for row in permisos if isinstance(row, dict)
            }

    added = 0
    removed = 0
    for plan in plans_list:
        role_key = plan.role_name.strip().lower()
        role_row = role_by_name.get(role_key)
        if not role_row:
            log.warning("role_perms.role_missing", extra={"role": plan.role_name})
            continue
        role_id_raw = role_row.get("id")
        if not role_id_raw:
            continue
        role_id = UUID(str(role_id_raw))
        current = await repo.list_role_permissions(organizacion_id=organizacion_id, rol_id=role_id)
        current_ids = {UUID(str(row["permiso_id"])) for row in current if isinstance(row, dict)}

        desired_ids: set[UUID] = set()
        for code in plan.permissions:
            permiso_row = permisos_by_code.get(code)
            if not permiso_row or not permiso_row.get("id"):
                log.warning("role_perms.perm_missing", extra={"role": plan.role_name, "code": code})
                continue
            desired_ids.add(UUID(str(permiso_row["id"])))

        to_add = desired_ids - current_ids
        to_remove = current_ids - desired_ids if prune else set()

        if dry_run:
            added += len(to_add)
            removed += len(to_remove)
            continue

        for permiso_id in to_add:
            await repo.create_role_permission(
                organizacion_id=organizacion_id, rol_id=role_id, permiso_id=permiso_id
            )
            added += 1
        for permiso_id in to_remove:
            await repo.delete_role_permission(
                organizacion_id=organizacion_id, rol_id=role_id, permiso_id=permiso_id
            )
            removed += 1

    return {"added": added, "removed": removed}


async def maybe_sync_role_permissions_on_start() -> None:
    log = get_logger("app.role_permissions_sync")
    if not settings.role_permissions_sync_on_start:
        return
    if not settings.supabase_url or not settings.supabase_service_role:
        log.warning("role_perms.sync_skipped", extra={"reason": "supabase_not_configured"})
        return

    matrix_path = _resolve_path(settings.role_permissions_matrix_path)
    if not matrix_path.exists():
        log.warning("role_perms.sync_skipped", extra={"reason": "matrix_missing", "path": str(matrix_path)})
        return

    state_path = _resolve_path(settings.role_permissions_sync_state_path)
    content = matrix_path.read_text(encoding="utf-8")
    matrix_hash = compute_matrix_hash(content)
    if state_path.exists():
        stored = state_path.read_text(encoding="utf-8").strip()
        if stored == matrix_hash:
            log.info("role_perms.sync_skipped", extra={"reason": "hash_unchanged"})
            return

    try:
        plans = parse_role_permissions_matrix(content)
    except ValueError as exc:
        log.warning("role_perms.sync_failed", extra={"error": str(exc)})
        return

    org_id = settings.webchat_default_organizacion_id or settings.whatsapp_default_organizacion_id
    if not org_id:
        log.warning("role_perms.sync_skipped", extra={"reason": "organizacion_id_missing"})
        return
    try:
        summary = await sync_role_permissions(
            organizacion_id=UUID(str(org_id)),
            plans=plans,
            prune=settings.role_permissions_sync_prune,
            dry_run=False,
        )
    except PlatformRepositoryError as exc:
        log.warning("role_perms.sync_failed", extra={"error": str(exc)})
        return

    state_path.write_text(matrix_hash, encoding="utf-8")
    log.info(
        "role_perms.sync_completed",
        extra={"added": summary["added"], "removed": summary["removed"]},
    )
