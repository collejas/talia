"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi("/crm/pedidos-venta/entregas", { searchParams: { vista: url.searchParams.get("vista") ?? "historial", limit: url.searchParams.get("limit") ?? "50", offset: url.searchParams.get("offset") ?? "0" }, withUserToken: true });
  return response.ok ? NextResponse.json(response.data ?? { items: [], has_more: false }) : NextResponse.json({ error: response.error || "No se pudieron cargar las entregas." }, { status: response.status ?? 500 });
}
