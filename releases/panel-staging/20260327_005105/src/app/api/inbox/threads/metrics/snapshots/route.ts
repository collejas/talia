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

function parseLimit(value: string | null): string {
  const fallback = 100;
  if (!value) return String(fallback);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(fallback);
  const bounded = Math.min(500, Math.max(1, Math.trunc(numeric)));
  return String(bounded);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const response = await callCrmApi<Record<string, unknown>>("/crm/inbox/threads/metrics/snapshots", {
    withUserToken: true,
    searchParams: { limit },
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar el historial de métricas" },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true, items: [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { window_seconds?: number | string };
  const rawWindow = body?.window_seconds != null ? String(body.window_seconds) : null;
  const windowSeconds = parseWindowSeconds(rawWindow);
  const response = await callCrmApi<Record<string, unknown>>("/crm/inbox/threads/metrics/snapshots", {
    method: "POST",
    withUserToken: true,
    searchParams: { window_seconds: windowSeconds },
    body: {},
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo guardar el snapshot" },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
