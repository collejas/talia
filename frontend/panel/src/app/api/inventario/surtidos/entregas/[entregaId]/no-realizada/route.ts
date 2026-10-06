"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request, { params }: { params: Promise<{ entregaId: string }> }) {
  const { entregaId } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Indica el motivo de la no entrega." }, { status: 400 });
  const response = await callCrmApi(`/crm/entregas/${entregaId}/no-realizada`, { method: "POST", body: payload, withUserToken: true });
  return response.ok ? NextResponse.json(response.data ?? { ok: true }) : NextResponse.json({ error: response.error || "No se pudo registrar la no entrega." }, { status: response.status ?? 500 });
}
