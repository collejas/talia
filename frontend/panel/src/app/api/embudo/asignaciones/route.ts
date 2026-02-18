import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

  const response = await callCrmApi("/crm/asignaciones_vendedores", {
    searchParams: {
      limit: String(limit),
      offset: String(url.searchParams.get("offset") ?? "0"),
      oportunidad_id: url.searchParams.get("oportunidad_id") ?? undefined,
      contacto_id: url.searchParams.get("contacto_id") ?? undefined,
      conversacion_id: url.searchParams.get("conversacion_id") ?? undefined,
      vendedor_id: url.searchParams.get("vendedor_id") ?? undefined,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "audit_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? { items: [], limit, offset: 0 });
}
