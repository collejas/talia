import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi("/crm/ventas/reporte", {
    withUserToken: true,
    searchParams: {
      desde: url.searchParams.get("desde"),
      hasta: url.searchParams.get("hasta"),
      estatus: url.searchParams.get("estatus"),
      vendedor_usuario_id: url.searchParams.get("vendedor_usuario_id"),
      moneda: url.searchParams.get("moneda"),
      limit: url.searchParams.get("limit") ?? "50",
      offset: url.searchParams.get("offset") ?? "0",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "sales_report_failed" },
      { status: response.status ?? 502 },
    );
  }
  return NextResponse.json(response.data);
}
