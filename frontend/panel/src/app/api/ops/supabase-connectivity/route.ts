import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

function parseWindowSeconds(value: string | null): string {
  const fallback = 3600;
  if (!value) return String(fallback);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(fallback);
  const bounded = Math.min(86_400, Math.max(60, Math.trunc(numeric)));
  return String(bounded);
}

function parseLimit(value: string | null): string {
  const fallback = 200;
  if (!value) return String(fallback);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(fallback);
  const bounded = Math.min(500, Math.max(1, Math.trunc(numeric)));
  return String(bounded);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowSeconds = parseWindowSeconds(searchParams.get("window_seconds"));
  const limit = parseLimit(searchParams.get("limit"));

  const response = await callCrmApi<Record<string, unknown>>("/crm/ops/supabase-connectivity", {
    withUserToken: true,
    searchParams: {
      window_seconds: windowSeconds,
      limit,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron consultar métricas de conectividad Supabase" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
