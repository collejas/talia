import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }
  const response = await callCrmApi("/crm/ventas/propiedades", {
    method: "POST",
    body,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error ?? "venta_failed" }, { status: response.status ?? 502 });
  }
  return NextResponse.json(response.data);
}
