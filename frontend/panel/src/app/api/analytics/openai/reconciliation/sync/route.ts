import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};

  for (const key of ["date_from", "date_to"] as const) {
    const value = searchParams.get(key);
    if (value && value.trim().length) {
      params[key] = value.trim();
    }
  }

  const response = await callCrmApi<Record<string, unknown>>(
    "/crm/analytics/openai/master/reconciliation/sync",
    {
      method: "POST",
      withUserToken: true,
      searchParams: params,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo sincronizar la reconciliación OpenAI." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
