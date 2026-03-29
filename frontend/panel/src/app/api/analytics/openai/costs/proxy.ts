import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const ALLOWED_PARAMS = [
  "scope",
  "date_from",
  "date_to",
  "month_from",
  "month_to",
  "channel",
  "feature",
  "model_family",
  "project_key",
  "assistant_kind",
  "limit",
] as const;

export async function proxyOpenAiCostsRequest(
  request: Request,
  tenantBackendPath: string,
  masterBackendPath?: string,
) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};
  const requestedScope = searchParams.get("scope")?.trim() || "tenant";

  for (const key of ALLOWED_PARAMS) {
    const value = searchParams.get(key);
    if (value && value.trim().length) {
      params[key] = value.trim();
    }
  }

  const backendPath =
    requestedScope === "master" && masterBackendPath ? masterBackendPath : tenantBackendPath;

  const response = await callCrmApi<Record<string, unknown>>(backendPath, {
    withUserToken: true,
    searchParams: params,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron consultar los costos OpenAI." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true, rows: [] });
}
