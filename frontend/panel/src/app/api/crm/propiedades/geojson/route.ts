import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const STATUS_COLORS: Record<string, string> = {
  disponible: "#2ECC71",
  apartado: "#F1C40F",
  vendido: "#E74C3C",
  reservado: "#9B59B6",
};

const buildError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });

const normalizeFeature = (feature: Record<string, unknown>) => {
  const properties = (feature?.properties ?? {}) as Record<string, unknown>;
  const status = typeof properties.status === "string" ? properties.status : undefined;
  const statusColor = typeof properties.status_color === "string"
    ? properties.status_color
    : status && STATUS_COLORS[status]
    ? STATUS_COLORS[status]
    : "#95A5A6";
  const color =
    (typeof properties.color === "string" && properties.color) ||
    (typeof properties.tipo_color === "string" && properties.tipo_color) ||
    statusColor;

  return {
    ...feature,
    properties: {
      ...properties,
      status_color: statusColor,
      color,
      linea_nombre:
        typeof properties.linea_nombre === "string" ? properties.linea_nombre : null,
      familia_nombre:
        typeof properties.familia_nombre === "string" ? properties.familia_nombre : null,
      modelo_nombre:
        typeof properties.modelo_nombre === "string" ? properties.modelo_nombre : null,
    },
  };
};

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
    withUserToken: true,
  });
  if (!response.ok) {
    return buildError(response.error, response.status ?? 500);
  }

  const payload = (response.data ?? {}) as {
    type?: unknown;
    features?: unknown;
  };
  const features = Array.isArray(payload.features) ? payload.features : [];
  const normalized = {
    type: typeof payload?.type === "string" ? payload.type : "FeatureCollection",
    features: features.map((feature: Record<string, unknown>) => normalizeFeature(feature)),
  };

  return NextResponse.json(normalized);
}
