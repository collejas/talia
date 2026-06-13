#!/usr/bin/env python3
"""Backfill de insights generados por Tal-IA en oportunidades abiertas.

Refresca la descripción de la oportunidad y el campo
`metadata.contacto_necesidad` cuando siguen siendo genéricos o fueron
marcados como auto-generados por el sistema.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any
from uuid import UUID

try:  # pragma: no cover - ejecución local opcional con .env
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

from app.core.logging import configure_logging
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import storage


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _resolve_root(path: str) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return (Path(__file__).resolve().parents[2] / candidate).resolve()


def _looks_like_candidate(row: dict[str, Any]) -> bool:
    metadata = _ensure_dict(row.get("metadata"))
    description = str(row.get("descripcion") or "").strip()
    title = str(row.get("titulo") or "").strip()
    current_need = str(metadata.get("contacto_necesidad") or "").strip()

    if metadata.get("description_auto_generated") or metadata.get("contacto_necesidad_auto_generated"):
        return True
    if storage._looks_like_placeholder_opportunity_description(description):  # noqa: SLF001
        return True
    if storage._looks_like_placeholder_insight(current_need):  # noqa: SLF001
        return True
    if storage._is_generic_opportunity_title(  # noqa: SLF001
        current_title=title,
        contact=_ensure_dict(row.get("contacto")),
        auto_generated=storage._normalize_manual_override(metadata.get("title_auto_generated")),  # noqa: SLF001
    ):
        return True
    return False


async def _fetch_page(
    repo: CRMRepository,
    *,
    organizacion_id: UUID,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    select_fields = (
        "id,organizacion_id,contacto_principal_id,contacto:personas!oportunidades_contacto_principal_org_fkey("
        "id,nombre_completo,company_name,notas,persona_datos,metadata"
        "),etapa_id,titulo,descripcion,canal,estado,metadata,creado_en,actualizado_en"
    )
    params = {
        "organizacion_id": f"eq.{organizacion_id}",
        "estado": "eq.abierta",
        "order": "actualizado_en.desc",
        "limit": str(limit),
        "offset": str(offset),
        "select": select_fields,
    }
    response = await repo._request(  # noqa: SLF001
        "GET",
        "/rest/v1/oportunidades",
        params=params,
    )
    payload = response.json() or []
    if not isinstance(payload, list):
        raise CRMRepositoryError(f"Respuesta inesperada al listar oportunidades: {payload!r}")
    return [row for row in payload if isinstance(row, dict)]


async def run(
    *,
    organizacion_id: UUID,
    apply: bool,
    limit: int,
    batch_size: int,
) -> None:
    repo = CRMRepository()
    processed = 0
    candidates = 0
    updated = 0
    skipped_no_contact = 0
    offset = 0

    while processed < limit:
        page_size = min(batch_size, limit - processed)
        page = await _fetch_page(
            repo,
            organizacion_id=organizacion_id,
            limit=page_size,
            offset=offset,
        )
        if not page:
            break

        for row in page:
            if processed >= limit:
                break
            processed += 1

            opportunity_id = str(row.get("id") or "").strip()
            contact = _ensure_dict(row.get("contacto"))
            persona_id = str(contact.get("id") or row.get("contacto_principal_id") or "").strip()
            conversation_id = str(
                _ensure_dict(row.get("metadata")).get("conversation_id")
                or _ensure_dict(row.get("metadata")).get("conversacion_id")
                or opportunity_id
            ).strip()

            if not opportunity_id or not persona_id:
                skipped_no_contact += 1
                continue
            if not _looks_like_candidate(row):
                continue

            candidates += 1
            if not apply:
                if candidates <= 20:
                    print(
                        f"[DRY] {opportunity_id} persona={persona_id} "
                        f"titulo={str(row.get('titulo') or '').strip() or '-'}"
                    )
                continue

            changed = await storage.sync_persona_opportunity_context(
                conversation_id=conversation_id,
                persona_id=persona_id,
                opportunity_id=opportunity_id,
                channel=str(row.get("canal") or "whatsapp").strip() or "whatsapp",
            )
            if changed:
                updated += 1
                if updated <= 20:
                    print(
                        f"[APPLY] {opportunity_id} persona={persona_id} "
                        f"titulo={str(row.get('titulo') or '').strip() or '-'}"
                    )

        if len(page) < page_size:
            break
        offset += len(page)

    print(
        "processed={processed} candidates={candidates} updated={updated} "
        "skipped_no_contact={skipped_no_contact} mode={mode}".format(
            processed=processed,
            candidates=candidates,
            updated=updated,
            skipped_no_contact=skipped_no_contact,
            mode="apply" if apply else "dry-run",
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill de insights de oportunidades abiertas para que reflejen el contexto más reciente."
    )
    parser.add_argument("--apply", action="store_true", help="Persistir cambios en Supabase.")
    parser.add_argument(
        "--organizacion-id",
        required=True,
        help="UUID de la organización a procesar.",
    )
    parser.add_argument("--limit", type=int, default=5000, help="Máximo de oportunidades a revisar.")
    parser.add_argument("--batch-size", type=int, default=250, help="Tamaño de página.")
    parser.add_argument("--dotenv", type=str, default=None, help="Ruta opcional a .env.")
    args = parser.parse_args()

    if load_dotenv is not None:
        dotenv_path = args.dotenv
        if dotenv_path:
            candidate = _resolve_root(dotenv_path)
            if candidate.exists():
                load_dotenv(candidate)
        else:
            for candidate_name in (".env", "backend/.env"):
                candidate = _resolve_root(candidate_name)
                if candidate.exists():
                    load_dotenv(candidate)

    configure_logging()

    organizacion_id = UUID(str(args.organizacion_id))
    asyncio.run(
        run(
            organizacion_id=organizacion_id,
            apply=bool(args.apply),
            limit=max(1, int(args.limit)),
            batch_size=max(1, int(args.batch_size)),
        )
    )


if __name__ == "__main__":
    main()
