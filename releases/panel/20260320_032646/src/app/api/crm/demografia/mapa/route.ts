import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nivel = searchParams.get("nivel") ?? "pais";
  const estado = searchParams.get("estado") ?? undefined;

  const params: Record<string, string> = {
    nivel,
  };
  if (nivel === "municipio" && estado) {
    params.estado = estado;
  }

  const response = await callCrmApi("/crm/demografia/mapa", {
    searchParams: params,
    withUserToken: true,
  });

  if (!response.ok) {
    console.error("crm.demografia.mapa filtered response", response.status, response.error);
    return NextResponse.json({
      ok: false,
      error: response.error,
      dataset: [],
      geojson: { type: "FeatureCollection", features: [] },
    });
  }

  return NextResponse.json(response.data);
}
