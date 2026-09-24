"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ pedidoId: string }> },
) {
  const { pedidoId } = await params;
  if (!pedidoId) return NextResponse.json({ error: "Falta pedidoId." }, { status: 400 });
  const response = await callCrmApi(`/crm/pedidos-venta/${pedidoId}/reservar-faltante`, {
    method: "POST",
    withUserToken: true,
  });
  if (!response.ok) {
    const message = response.error === "no_hay_almacen_activo_para_reservas"
      ? "No hay un almacén activo para reservar el inventario."
      : response.error || "No se pudo reservar el inventario disponible.";
    return NextResponse.json({ error: message }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? { ok: true });
}
