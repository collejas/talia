#!/usr/bin/env python3
"""Backfill de ubicacion por LADA para contactos de WhatsApp."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import leads_geo


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


def _merge_location(
    contacto_datos: dict[str, Any],
    *,
    lada: str | None,
    estado_clave: str | None,
    estado_nombre: str | None,
    municipio_clave: str | None,
    municipio_nombre: str | None,
    municipio_cvegeo: str | None,
) -> tuple[dict[str, Any], bool]:
    updated_data = dict(contacto_datos)
    ubicacion = _as_dict(updated_data.get("ubicacion"))
    before = dict(ubicacion)

    ubicacion.setdefault("pais", "México")
    ubicacion.setdefault("country_code", "MX")
    if lada:
        ubicacion["lada"] = lada
    if estado_clave:
        ubicacion["cve_ent"] = estado_clave
    if estado_nombre:
        ubicacion["nom_ent"] = estado_nombre
    if municipio_clave:
        ubicacion["cve_mun"] = municipio_clave
    if municipio_nombre:
        ubicacion["nom_mun"] = municipio_nombre
    if municipio_cvegeo:
        ubicacion["cvegeo"] = municipio_cvegeo

    changed = ubicacion != before
    if changed:
        updated_data["ubicacion"] = ubicacion
    return updated_data, changed


async def _fetch_contacts_page(
    repo: CRMRepository,
    *,
    offset: int,
    limit: int,
    phone: str | None,
) -> list[dict[str, Any]]:
    params = {
        "select": "id,telefono_e164,origen,contacto_datos",
        "origen": "eq.whatsapp",
        "order": "id.asc",
        "offset": str(offset),
        "limit": str(limit),
    }
    if phone:
        params["telefono_e164"] = f"eq.{phone}"

    response = await repo._request("GET", "/rest/v1/contactos", params=params)
    payload = response.json() or []
    if not isinstance(payload, list):
        raise CRMRepositoryError("invalid_contacts_payload")
    return [row for row in payload if isinstance(row, dict)]


async def run(*, apply: bool, limit: int, batch_size: int, phone: str | None) -> None:
    repo = CRMRepository()
    processed = 0
    matched = 0
    updated = 0
    offset = 0

    while True:
        page = await _fetch_contacts_page(repo, offset=offset, limit=batch_size, phone=phone)
        if not page:
            break

        for row in page:
            if processed >= limit:
                break
            processed += 1

            contact_id = str(row.get("id") or "").strip()
            phone_e164 = str(row.get("telefono_e164") or "").strip()
            if not contact_id or not phone_e164:
                continue

            contact_data = {
                "telefono_e164": phone_e164,
                "contacto_datos": _as_dict(row.get("contacto_datos")),
            }
            location = leads_geo.infer_contact_location(
                contacto_id=contact_id,
                data=contact_data,
                channels=["whatsapp"],
                identities=[],
            )
            if not location.estado_clave:
                continue

            next_data, changed = _merge_location(
                _as_dict(row.get("contacto_datos")),
                lada=location.lada,
                estado_clave=location.estado_clave,
                estado_nombre=location.estado_nombre,
                municipio_clave=location.municipio_clave,
                municipio_nombre=location.municipio_nombre,
                municipio_cvegeo=location.municipio_cvegeo,
            )
            if not changed:
                continue
            matched += 1

            if apply:
                await repo.update_contact_by_id(
                    contact_id=contact_id,
                    patch={"contacto_datos": next_data},
                )
            updated += 1
            if updated <= 20:
                print(
                    f"[{'APPLY' if apply else 'DRY'}] {contact_id} {phone_e164} "
                    f"-> {location.estado_clave}/{location.municipio_clave or '-'} "
                    f"{location.estado_nombre or ''} {location.municipio_nombre or ''}".strip()
                )

        if processed >= limit:
            break
        if len(page) < batch_size:
            break
        offset += batch_size

    print(
        f"processed={processed} matched={matched} "
        f"updated={updated} mode={'apply' if apply else 'dry-run'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill de ubicacion por LADA para WhatsApp.")
    parser.add_argument("--apply", action="store_true", help="Persistir cambios en contactos.")
    parser.add_argument("--limit", type=int, default=5000, help="Maximo de contactos a revisar.")
    parser.add_argument("--batch-size", type=int, default=500, help="Tamano de pagina por consulta.")
    parser.add_argument("--phone", type=str, default=None, help="Filtrar por telefono exacto E.164.")
    args = parser.parse_args()

    asyncio.run(
        run(
            apply=bool(args.apply),
            limit=max(1, int(args.limit)),
            batch_size=max(1, int(args.batch_size)),
            phone=args.phone.strip() if isinstance(args.phone, str) and args.phone.strip() else None,
        )
    )


if __name__ == "__main__":
    main()
