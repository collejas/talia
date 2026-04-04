import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi<{ rows?: unknown[] }>("/crm/analytics/catalog/ventas", {
    withUserToken: true,
    searchParams: {
      mes_desde: url.searchParams.get("mes_desde"),
      mes_hasta: url.searchParams.get("mes_hasta"),
      moneda: url.searchParams.get("moneda"),
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 });
  }

  return NextResponse.json({ rows: Array.isArray(response.data?.rows) ? response.data.rows : [] });
}
