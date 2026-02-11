import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const buildError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const unidadIds = Array.isArray(payload?.unidad_ids) ? payload.unidad_ids : [];

  const response = await callCrmApi("/crm/propiedades/ventas/vendedores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unidad_ids: unidadIds }),
    withUserToken: true,
  });

  if (!response.ok) {
    return buildError(response.error, response.status ?? 500);
  }

  const data = (response.data ?? {}) as { vendedores?: unknown };
  const vendedores = Array.isArray(data.vendedores)
    ? data.vendedores
    : [];

  return NextResponse.json({ vendedores });
}
