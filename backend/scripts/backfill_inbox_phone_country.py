#!/usr/bin/env python3
"""Backfill de país/código telefónico para conversaciones del inbox."""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from typing import Any

from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import leads_geo, storage

_DIGITS_ONLY = re.compile(r"\D+")


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _normalize_phone_candidate(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered.startswith("whatsapp:"):
        text = text.split(":", 1)[1].strip()
    digits = _DIGITS_ONLY.sub("", text)
    if not digits:
        return None
    if text.startswith("+"):
        return f"+{digits}"
    if len(digits) >= 10:
        return f"+{digits}"
    return None


def _extract_phone_from_message(message: dict[str, Any]) -> str | None:
    datos = _as_dict(message.get("datos"))
    raw = datos.get("raw") if isinstance(datos.get("raw"), dict) else {}
    for candidate in (
        datos.get("from_number"),
        raw.get("From"),
        raw.get("from_number"),
        raw.get("WaId"),
        datos.get("wa_id"),
        raw.get("ExternalUserId"),
        message.get("texto"),
    ):
        phone = _normalize_phone_candidate(candidate)
        if phone:
            return phone
    return None


async def _fetch_whatsapp_conversations(
    repo: CRMRepository,
    *,
    organizacion_id: str,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    params = {
        "select": "id,organizacion_id,inbox_context,contacto_id,canal,iniciada_en,ultimo_mensaje_en",
        "organizacion_id": f"eq.{organizacion_id}",
        "canal": "eq.whatsapp",
        "order": "iniciada_en.asc,id.asc",
        "limit": str(limit),
        "offset": str(offset),
    }
    response = await repo._request("GET", "/rest/v1/conversaciones", params=params)
    payload = response.json() or []
    if not isinstance(payload, list):
        raise CRMRepositoryError("invalid_conversations_payload")
    return [row for row in payload if isinstance(row, dict)]


async def _resolve_phone(repo: CRMRepository, conversation: dict[str, Any]) -> str | None:
    context = _as_dict(conversation.get("inbox_context"))
    for key in ("contacto_telefono", "phone", "from_number", "telefono_e164"):
        phone = _normalize_phone_candidate(context.get(key))
        if phone:
            return phone

    contact_id = str(conversation.get("contacto_id") or "").strip()
    if contact_id:
        try:
            contacts = await repo.get_contacts_by_ids(
                organizacion_id=conversation.get("organizacion_id"),
                contacto_ids=[contact_id],
            )
        except CRMRepositoryError:
            contacts = []
        for contact in contacts:
            for key in (
                "telefono_e164",
                "telefono_principal_e164",
                "telefono_movil_1_e164",
                "telefono_secundario_e164",
                "telefono_movil_2_e164",
                "telefono",
            ):
                phone = _normalize_phone_candidate(contact.get(key))
                if phone:
                    return phone

    try:
        messages = await repo.fetch_recent_messages(
            conversation_id=str(conversation.get("id") or "").strip(),
            limit=20,
        )
    except CRMRepositoryError:
        messages = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        phone = _extract_phone_from_message(message)
        if phone:
            return phone
    return None


async def run(*, apply: bool, organizacion_id: str, limit: int, batch_size: int) -> None:
    repo = CRMRepository()
    processed = 0
    updated = 0
    skipped = 0
    offset = 0

    while True:
        page = await _fetch_whatsapp_conversations(
            repo,
            organizacion_id=organizacion_id,
            limit=batch_size,
            offset=offset,
        )
        if not page:
            break

        for conversation in page:
            if processed >= limit:
                break
            processed += 1

            conversation_id = str(conversation.get("id") or "").strip()
            if not conversation_id:
                skipped += 1
                continue

            context = _as_dict(conversation.get("inbox_context"))
            if context.get("contacto_country_code") or context.get("contacto_country_name"):
                skipped += 1
                continue

            phone = await _resolve_phone(repo, conversation)
            if not phone:
                skipped += 1
                continue

            location = leads_geo.phone_location_from_number(phone)
            patch = {
                "contacto_telefono": phone,
                "contacto_country_code": location.country_code,
                "contacto_country_name": location.country_name,
            }

            if apply:
                await storage.merge_conversation_inbox_context(
                    conversation_id=conversation_id,
                    patch=patch,
                )
            updated += 1
            if updated <= 20:
                print(
                    f"[{'APPLY' if apply else 'DRY'}] {conversation_id} {phone} "
                    f"-> {location.country_code or '-'} {location.country_name or ''}".strip()
                )

        if processed >= limit:
            break
        if len(page) < batch_size:
            break
        offset += batch_size

    print(
        f"processed={processed} updated={updated} skipped={skipped} "
        f"mode={'apply' if apply else 'dry-run'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill de país/código para inbox WhatsApp.")
    parser.add_argument("--organizacion-id", required=True, help="Tenant/organización a procesar.")
    parser.add_argument("--apply", action="store_true", help="Persistir cambios en conversaciones.")
    parser.add_argument("--limit", type=int, default=5000, help="Máximo de conversaciones a revisar.")
    parser.add_argument("--batch-size", type=int, default=200, help="Tamaño de página por consulta.")
    args = parser.parse_args()

    asyncio.run(
        run(
            apply=bool(args.apply),
            organizacion_id=str(args.organizacion_id).strip(),
            limit=max(1, int(args.limit)),
            batch_size=max(1, int(args.batch_size)),
        )
    )


if __name__ == "__main__":
    main()
