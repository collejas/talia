import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET() {
  const response = await callCrmApi<{ rows?: unknown[] }>("/crm/analytics/catalog/embudo", {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 });
  }

  return NextResponse.json({ rows: Array.isArray(response.data?.rows) ? response.data.rows : [] });
}
