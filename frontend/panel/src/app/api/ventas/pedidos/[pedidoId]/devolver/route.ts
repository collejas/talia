"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pedidoId: string }> },
) {
  const { pedidoId } = await params;
  if (!pedidoId) return NextResponse.json({ error: "Falta pedidoId." }, { status: 400 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "El motivo de devolución no es válido." }, { status: 400 });
  }
  const response = await callCrmApi(`/crm/pedidos-venta/${pedidoId}/devolver`, {
    method: "POST",
    body: payload,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo devolver el pedido." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
