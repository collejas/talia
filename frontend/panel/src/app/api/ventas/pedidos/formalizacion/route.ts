"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi("/crm/pedidos-venta/cola-formalizacion", {
    searchParams: {
      limit: url.searchParams.get("limit") ?? "50",
      offset: url.searchParams.get("offset") ?? "0",
    },
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo cargar la bandeja." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { items: [], has_more: false });
}
