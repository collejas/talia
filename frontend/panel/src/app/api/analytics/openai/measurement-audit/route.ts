import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};

  for (const key of ["tenant_id", "status"] as const) {
    const value = searchParams.get(key);
    if (value && value.trim().length) {
      params[key] = value.trim();
    }
  }

  const response = await callCrmApi<Record<string, unknown>>(
    "/crm/analytics/openai/master/measurement-audit",
    {
      withUserToken: true,
      searchParams: params,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar la auditoría OpenAI." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true, rows: [] });
}
