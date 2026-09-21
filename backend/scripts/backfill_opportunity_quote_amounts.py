#!/usr/bin/env python3
"""Sincroniza oportunidades históricas con el neto de su cotización vigente.

Por defecto solo genera un reporte. Usar ``--apply`` para persistir. El reporte
incluye el valor anterior y el nuevo para permitir auditoría y reversión manual.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import UUID

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

from app.core.logging import configure_logging
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError


def _number(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed.is_finite() else None


def _quote_net(quote: dict[str, Any]) -> Decimal | None:
    metadata = quote.get("metadata") if isinstance(quote.get("metadata"), dict) else {}
    subtotal = _number(metadata.get("subtotal"))
    if subtotal is None:
        subtotal = _number(quote.get("subtotal"))
    if subtotal is not None:
        return max(Decimal("0"), subtotal).quantize(Decimal("0.01"))

    total = _number(quote.get("total"))
    taxes = _number(metadata.get("impuestos"))
    if taxes is None:
        taxes = _number(quote.get("impuestos"))
    if total is not None and taxes is not None:
        return max(Decimal("0"), total - taxes).quantize(Decimal("0.01"))
    return max(Decimal("0"), total).quantize(Decimal("0.01")) if total is not None else None


def _same_amount(current: Any, expected: Decimal) -> bool:
    value = _number(current)
    return value is not None and value.quantize(Decimal("0.01")) == expected


def _resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (Path(__file__).resolve().parents[2] / path).resolve()


async def _process_tenant(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    apply: bool,
    report: csv.DictWriter[str],
    page_size: int,
) -> tuple[int, int, int]:
    scanned = candidates = updated = 0
    offset = 0

    while True:
        rows, _ = await repo.list_opportunities(
            organizacion_id=organizacion_id,
            limit=page_size,
            offset=offset,
            include_contact_rows=False,
            count_exact=False,
        )
        if not rows:
            break

        opportunity_ids = [
            UUID(str(row["id"]))
            for row in rows
            if isinstance(row, dict) and row.get("id")
        ]
        quotes = await repo.list_current_quote_amounts_by_opportunity_ids(
            organizacion_id=organizacion_id,
            oportunidad_ids=opportunity_ids,
        )
        quote_by_opportunity: dict[str, dict[str, Any]] = {}
        for quote in quotes:
            opportunity_id = str(quote.get("oportunidad_id") or "").strip()
            if opportunity_id and opportunity_id not in quote_by_opportunity:
                quote_by_opportunity[opportunity_id] = quote

        for row in rows:
            scanned += 1
            opportunity_id = str(row.get("id") or "").strip()
            quote = quote_by_opportunity.get(opportunity_id)
            if not quote:
                continue
            net_amount = _quote_net(quote)
            if net_amount is None:
                continue
            quote_currency = str(quote.get("moneda") or "").strip().upper()
            current_currency = str(row.get("moneda") or "").strip().upper()
            if _same_amount(row.get("monto_estimado"), net_amount) and (
                not quote_currency or current_currency == quote_currency
            ):
                continue

            candidates += 1
            report.writerow(
                {
                    "organizacion_id": str(organizacion_id),
                    "oportunidad_id": opportunity_id,
                    "cotizacion_id": str(quote.get("id") or ""),
                    "estatus_cotizacion": str(quote.get("estatus") or ""),
                    "monto_anterior": row.get("monto_estimado"),
                    "moneda_anterior": row.get("moneda"),
                    "monto_nuevo": str(net_amount),
                    "moneda_nueva": quote_currency or current_currency,
                    "modo": "apply" if apply else "dry-run",
                }
            )
            if apply:
                payload: dict[str, Any] = {"monto_estimado": float(net_amount)}
                if quote_currency:
                    payload["moneda"] = quote_currency
                await repo.update_opportunity(
                    organizacion_id=organizacion_id,
                    oportunidad_id=UUID(opportunity_id),
                    payload=payload,
                )
                updated += 1

        if len(rows) < page_size:
            break
        offset += len(rows)

    return scanned, candidates, updated


async def run(*, apply: bool, organization_id: UUID | None, report_path: Path, page_size: int) -> None:
    organizations = [{"id": str(organization_id)}] if organization_id else await PlatformRepository().list_organizaciones()
    organizations = [row for row in organizations if isinstance(row, dict) and row.get("id")]
    headers = [
        "organizacion_id",
        "oportunidad_id",
        "cotizacion_id",
        "estatus_cotizacion",
        "monto_anterior",
        "moneda_anterior",
        "monto_nuevo",
        "moneda_nueva",
        "modo",
    ]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    totals = [0, 0, 0]
    with report_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        repo = CRMRepository()
        for organization in organizations:
            tenant_id = UUID(str(organization["id"]))
            try:
                result = await _process_tenant(
                    repo=repo,
                    organizacion_id=tenant_id,
                    apply=apply,
                    report=writer,
                    page_size=page_size,
                )
            except (CRMRepositoryError, ValueError) as exc:
                raise RuntimeError(f"tenant {tenant_id}: {exc}") from exc
            totals = [left + right for left, right in zip(totals, result)]
            print(
                f"tenant={tenant_id} scanned={result[0]} candidates={result[1]} updated={result[2]}"
            )
    print(
        f"mode={'apply' if apply else 'dry-run'} tenants={len(organizations)} "
        f"scanned={totals[0]} candidates={totals[1]} updated={totals[2]} report={report_path}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Persistir los cambios en Supabase.")
    parser.add_argument("--organizacion-id", help="Procesar únicamente este tenant.")
    parser.add_argument(
        "--report",
        default="backend/reports/opportunity_quote_amounts.csv",
        help="Ruta del reporte CSV.",
    )
    parser.add_argument("--page-size", type=int, default=200)
    parser.add_argument("--dotenv", help="Ruta opcional al archivo .env.")
    args = parser.parse_args()

    if load_dotenv is not None:
        dotenv = _resolve_path(args.dotenv) if args.dotenv else _resolve_path("backend/.env")
        if dotenv.exists():
            load_dotenv(dotenv, override=False)
    configure_logging()

    organization_id = UUID(args.organizacion_id) if args.organizacion_id else None
    try:
        asyncio.run(
            run(
                apply=bool(args.apply),
                organization_id=organization_id,
                report_path=_resolve_path(args.report),
                page_size=max(1, min(int(args.page_size), 500)),
            )
        )
    except (PlatformRepositoryError, CRMRepositoryError, ValueError, RuntimeError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
