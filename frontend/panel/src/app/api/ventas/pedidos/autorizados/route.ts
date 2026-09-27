"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi("/crm/pedidos-venta/autorizados", {
    searchParams: {
      limit: url.searchParams.get("limit") ?? "100",
      offset: url.searchParams.get("offset") ?? "0",
    },
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo cargar el listado de pedidos autorizados." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { items: [], has_more: false });
}
