import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi("/crm/asignaciones_vendedores/tiempos", {
    searchParams: {
      periodo: url.searchParams.get("periodo") ?? "mes",
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "sales_assignment_metrics_failed" },
      { status: response.status ?? 502 },
    );
  }
  return NextResponse.json(response.data);
}
