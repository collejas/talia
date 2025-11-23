import { NextResponse } from "next/server";

import type { CatalogSalesRow } from "@/app/dashboard/catalog-analytics";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const searchParams: Record<string, string> = {};
  const mesDesde = params.get("mes_desde");
  const mesHasta = params.get("mes_hasta");
  const moneda = params.get("moneda");
  if (mesDesde) searchParams.mes_desde = mesDesde;
  if (mesHasta) searchParams.mes_hasta = mesHasta;
  if (moneda) searchParams.moneda = moneda;

  const response = await callCrmApi<{ rows?: CatalogSalesRow[] }>("/crm/analytics/catalog/ventas", {
    searchParams,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 });
  }

  const rows = Array.isArray(response.data?.rows) ? (response.data.rows as CatalogSalesRow[]) : [];
  const csv = renderSalesCsv(rows);
  const filename = buildSalesFilename(mesDesde, mesHasta, moneda);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}

function renderSalesCsv(rows: CatalogSalesRow[]): string {
  const header = ["mes", "producto", "moneda", "total_vendido", "unidades_vendidas", "leads_ganados"];
  const output = [header.join(",")];
  for (const row of rows) {
    const line = [
      row.mes ?? "",
      row.item_nombre ?? "",
      (row.moneda ?? "MXN").toUpperCase(),
      Number(row.total_vendido ?? 0),
      Number(row.unidades_vendidas ?? 0),
      Number(row.leads_ganados ?? 0),
    ]
      .map((value) => formatCsvValue(value))
      .join(",");
    output.push(line);
  }
  return output.join("\n");
}

function formatCsvValue(value: string | number): string {
  if (typeof value === "number") {
    return value.toString();
  }
  const needsQuotes = value.includes(",") || value.includes('"') || value.includes("\n");
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function buildSalesFilename(mesDesde: string | null, mesHasta: string | null, moneda: string | null): string {
  const parts = ["ventas-productos"];
  if (mesDesde && mesHasta) {
    parts.push(`${mesDesde}_a_${mesHasta}`);
  } else if (mesDesde) {
    parts.push(`desde_${mesDesde}`);
  } else if (mesHasta) {
    parts.push(`hasta_${mesHasta}`);
  }
  if (moneda) {
    parts.push(moneda.toLowerCase());
  }
  return `${parts.join("-")}.csv`;
}
