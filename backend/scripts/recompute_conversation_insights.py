#!/usr/bin/env python3
"""Recalcula resumen e insights de conversación sin disparar close_lead.

Este script regenera el resumen con OpenAI, refresca `notes` y
`necesidad_proposito` del contacto y sincroniza la oportunidad asociada
si ya existe. No envía notificaciones ni agenda citas.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any
from uuid import UUID

try:  # pragma: no cover - ejecución local opcional con .env
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.logging import configure_logging
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import conversation_summary, storage


def _resolve_root(path: str) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return (Path(__file__).resolve().parents[2] / candidate).resolve()


async def _fetch_conversation(
    repo: CRMRepository,
    *,
    conversation_id: str,
) -> dict[str, Any] | None:
    resp = await repo._request(  # noqa: SLF001
        "GET",
        "/rest/v1/conversaciones",
        params={
            "id": f"eq.{conversation_id}",
            "select": "id,organizacion_id,contacto_id,persona_id,canal,estado,iniciada_en,ultimo_mensaje_en",
            "limit": "1",
        },
    )
    data = resp.json() or []
    if not isinstance(data, list) or not data:
        return None
    row = data[0]
    return row if isinstance(row, dict) else None


async def _fetch_conversations_page(
    repo: CRMRepository,
    *,
    organizacion_id: UUID,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    resp = await repo._request(  # noqa: SLF001
        "GET",
        "/rest/v1/conversaciones",
        params={
            "organizacion_id": f"eq.{organizacion_id}",
            "canal": "in.(whatsapp,webchat)",
            "estado": "in.(abierta,pendiente)",
            "order": "ultimo_mensaje_en.desc,iniciada_en.desc,id.desc",
            "limit": str(limit),
            "offset": str(offset),
            "select": "id,organizacion_id,contacto_id,persona_id,canal,estado,iniciada_en,ultimo_mensaje_en",
        },
    )
    data = resp.json() or []
    if not isinstance(data, list):
        raise CRMRepositoryError(f"Respuesta inesperada al listar conversaciones: {data!r}")
    return [row for row in data if isinstance(row, dict)]


async def _process_one(
    *,
    repo: CRMRepository,
    conversation_row: dict[str, Any],
    apply: bool,
) -> dict[str, Any]:
    conversation_id = str(conversation_row.get("id") or "").strip()
    org_value = conversation_row.get("organizacion_id")
    canal = str(conversation_row.get("canal") or "").strip().lower() or "whatsapp"
    persona_id = str(
        conversation_row.get("persona_id") or conversation_row.get("contacto_id") or ""
    ).strip()
    if not conversation_id or not org_value or not persona_id:
        return {"conversation_id": conversation_id, "status": "skipped", "reason": "missing_ids"}

    context = await storage.fetch_persona_context(
        conversation_id=conversation_id,
        persona_id=persona_id,
    )

    if not apply:
        return {
            "conversation_id": conversation_id,
            "status": "dry-run",
            "has_contact": bool(context.get("contact")),
            "has_opportunity": bool(context.get("opportunity")),
            "channel": canal,
        }

    summary_record = await conversation_summary.rebuild_conversation_summary(
        conversation_id=conversation_id,
        persona_id=persona_id,
        organizacion_id=UUID(str(org_value)),
        context_data=context,
    )
    opportunity = context.get("opportunity")
    if isinstance(opportunity, dict) and opportunity.get("id"):
        await storage.sync_persona_opportunity_context(
            conversation_id=conversation_id,
            persona_id=persona_id,
            opportunity_id=str(opportunity.get("id")),
            channel=canal,
        )

    return {
        "conversation_id": conversation_id,
        "status": "updated" if summary_record else "no_summary",
        "has_opportunity": bool(opportunity),
        "channel": canal,
    }


async def run(
    *,
    apply: bool,
    conversation_id: str | None,
    organizacion_id: UUID | None,
    limit: int,
    batch_size: int,
) -> None:
    repo = CRMRepository()
    processed = 0
    updated = 0
    skipped = 0

    if conversation_id:
        conversation_row = await _fetch_conversation(repo, conversation_id=conversation_id)
        if not conversation_row:
            print("conversation_not_found")
            return
        result = await _process_one(repo=repo, conversation_row=conversation_row, apply=apply)
        print(result)
        return

    if not organizacion_id:
        raise SystemExit("Debes pasar --conversation-id o --organizacion-id")

    offset = 0
    while processed < limit:
        page_size = min(batch_size, limit - processed)
        page = await _fetch_conversations_page(
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
            result = await _process_one(repo=repo, conversation_row=row, apply=apply)
            if result.get("status") == "updated":
                updated += 1
                if updated <= 20:
                    print(f"[APPLY] {result.get('conversation_id')} canal={result.get('channel')}")
            elif result.get("status") == "dry-run":
                if processed <= 20:
                    print(
                        f"[DRY] {result.get('conversation_id')} "
                        f"contact={result.get('has_contact')} opp={result.get('has_opportunity')}"
                    )
            else:
                skipped += 1
        if len(page) < page_size:
            break
        offset += len(page)

    print(
        "processed={processed} updated={updated} skipped={skipped} mode={mode}".format(
            processed=processed,
            updated=updated,
            skipped=skipped,
            mode="apply" if apply else "dry-run",
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recalcula el resumen de conversación y sincroniza insights sin ejecutar close_lead."
    )
    parser.add_argument("--apply", action="store_true", help="Persistir cambios.")
    parser.add_argument("--conversation-id", type=str, default=None, help="Conversación individual.")
    parser.add_argument("--organizacion-id", type=str, default=None, help="Procesar un tenant.")
    parser.add_argument("--limit", type=int, default=5000, help="Máximo de conversaciones a revisar.")
    parser.add_argument("--batch-size", type=int, default=200, help="Tamaño de página.")
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

    org_uuid = UUID(str(args.organizacion_id)) if args.organizacion_id else None
    asyncio.run(
        run(
            apply=bool(args.apply),
            conversation_id=args.conversation_id.strip() if isinstance(args.conversation_id, str) and args.conversation_id.strip() else None,
            organizacion_id=org_uuid,
            limit=max(1, int(args.limit)),
            batch_size=max(1, int(args.batch_size)),
        )
    )


if __name__ == "__main__":
    main()
