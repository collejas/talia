"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request, { params }: { params: Promise<{ pedidoId: string }> }) {
  const { pedidoId } = await params;
  const payload = await request.json().catch(() => null);
  if (!pedidoId || !payload) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const response = await callCrmApi(`/crm/pedidos-venta/${pedidoId}/entregas/preparar`, { method: "POST", body: payload, withUserToken: true });
  return response.ok ? NextResponse.json(response.data ?? { ok: true }) : NextResponse.json({ error: response.error || "No se pudo preparar la entrega." }, { status: response.status ?? 500 });
}
