import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const ALLOWED_PARAMS = [
  "tenant_id",
  "date_from",
  "date_to",
  "month_from",
  "month_to",
  "channel",
  "feature",
  "model_family",
  "project_key",
  "limit",
] as const;

export async function proxyPlatformOpenAiCostsRequest(request: Request, backendPath: string) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};

  for (const key of ALLOWED_PARAMS) {
    const value = searchParams.get(key);
    if (value && value.trim().length) {
      params[key] = value.trim();
    }
  }

  const response = await callCrmApi<Record<string, unknown>>(backendPath, {
    withUserToken: true,
    organizacionId: null,
    searchParams: params,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron consultar los costos OpenAI globales." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true, rows: [] });
}
