import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi<{ rows?: unknown[] }>("/crm/analytics/catalog/embudo", {
    withUserToken: true,
    searchParams: {
      fecha_desde: url.searchParams.get("fecha_desde"),
      fecha_hasta: url.searchParams.get("fecha_hasta"),
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 });
  }

  return NextResponse.json({ rows: Array.isArray(response.data?.rows) ? response.data.rows : [] });
}
