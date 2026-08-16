import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await callCrmApi<unknown>("/crm/demografia/campanas-conversion", {
    withUserToken: true,
    searchParams: {
      campana_id: searchParams.get("campana_id") || undefined,
      rango: searchParams.get("rango") || undefined,
      desde: searchParams.get("desde") || undefined,
      hasta: searchParams.get("hasta") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
  });
}
