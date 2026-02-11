"""Sincroniza roles/permisos desde docs/Roles de acceso/Matriz-permisos.md."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.core.logging import configure_logging
from app.services.role_permissions_sync import (
    compute_matrix_hash,
    parse_role_permissions_matrix,
    sync_role_permissions,
)


def _resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (Path(__file__).resolve().parents[2] / path).resolve()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sincroniza roles/permisos desde la matriz.")
    parser.add_argument("--organizacion-id", dest="organizacion_id", type=str)
    parser.add_argument(
        "--matrix-path",
        dest="matrix_path",
        type=str,
        default=settings.role_permissions_matrix_path,
    )
    parser.add_argument("--prune", dest="prune", action="store_true", default=settings.role_permissions_sync_prune)
    parser.add_argument("--no-prune", dest="prune", action="store_false")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", default=False)
    parser.add_argument("--force", dest="force", action="store_true", default=False)
    return parser


async def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    configure_logging()

    matrix_path = _resolve_path(args.matrix_path)
    if not matrix_path.exists():
        raise SystemExit(f"Matrix not found: {matrix_path}")

    content = matrix_path.read_text(encoding="utf-8")
    plans = parse_role_permissions_matrix(content)
    matrix_hash = compute_matrix_hash(content)

    if not args.force:
        state_path = _resolve_path(settings.role_permissions_sync_state_path)
        if state_path.exists() and state_path.read_text(encoding="utf-8").strip() == matrix_hash:
            print("Matrix hash unchanged; nothing to sync.")
            return 0

    org_id = args.organizacion_id or settings.webchat_default_organizacion_id or settings.whatsapp_default_organizacion_id
    if not org_id:
        raise SystemExit("organizacion_id missing. Pass --organizacion-id or set TALIA_ORGANIZACION_ID.")

    summary = await sync_role_permissions(
        organizacion_id=UUID(str(org_id)),
        plans=plans,
        prune=bool(args.prune),
        dry_run=bool(args.dry_run),
    )

    if not args.dry_run:
        state_path = _resolve_path(settings.role_permissions_sync_state_path)
        state_path.write_text(matrix_hash, encoding="utf-8")

    print(f"Sync completed. Added: {summary['added']} Removed: {summary['removed']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
