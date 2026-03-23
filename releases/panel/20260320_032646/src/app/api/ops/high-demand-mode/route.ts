import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

function parseWindowSeconds(value: string | null): string {
  const fallback = 300;
  if (!value) return String(fallback);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(fallback);
  const bounded = Math.min(3600, Math.max(60, Math.trunc(numeric)));
  return String(bounded);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowSeconds = parseWindowSeconds(searchParams.get("window_seconds"));

  const response = await callCrmApi<Record<string, unknown>>("/crm/ops/high-demand-mode", {
    withUserToken: true,
    searchParams: { window_seconds: windowSeconds },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar el estado de alta demanda" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
