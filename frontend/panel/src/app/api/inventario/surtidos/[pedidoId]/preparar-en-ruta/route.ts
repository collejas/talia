"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request, { params }: { params: Promise<{ pedidoId: string }> }) {
  const { pedidoId } = await params;
  const response = await callCrmApi(`/crm/pedidos-venta/${pedidoId}/entregas/preparar-en-ruta`, {
    method: "POST",
    body: await request.json(),
    withUserToken: true,
  });
  return response.ok
    ? NextResponse.json(response.data ?? { ok: true })
    : NextResponse.json({ error: response.error || "No se pudo preparar y marcar la entrega en ruta." }, { status: response.status ?? 500 });
}
