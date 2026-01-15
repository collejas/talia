import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const buildError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });

export async function GET(request: Request) {
  const { searchParams: queryParams } = new URL(request.url);
  const nivel = queryParams.get("nivel");
  const tipoId = queryParams.get("tipo_id");
  const params: Record<string, string> = {};
  if (nivel) params["nivel"] = nivel;
  if (tipoId) params["tipo_id"] = tipoId;

  const response = await callCrmApi("/crm/propiedades/geojson", {
    searchParams: params,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    return buildError(response.error, response.status ?? 500);
  }
  return NextResponse.json(response.data ?? { type: "FeatureCollection", features: [] });
}
