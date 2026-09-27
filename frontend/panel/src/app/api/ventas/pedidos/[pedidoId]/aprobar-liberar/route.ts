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
    return NextResponse.json({ error: "La revisión del pedido no es válida." }, { status: 400 });
  }
  const response = await callCrmApi(`/crm/pedidos-venta/${pedidoId}/aprobar-liberar`, {
    method: "POST",
    body: payload,
    withUserToken: true,
  });
  if (!response.ok) {
    const knownErrors: Record<string, string> = {
      inventario_insuficiente_no_permite_entrega_parcial: "El inventario disponible no cubre el pedido y la cotización no permite entregas parciales.",
      partidas_pedido_no_coinciden_con_cotizacion: "Las partidas del pedido cambiaron respecto a la cotización aceptada. Devuélvelo a Comercial para corregirlo.",
      descuento_supera_limite_autorizado: "El descuento supera el límite autorizado para la cotización.",
      pedido_sin_cuenta_crm: "La oportunidad no tiene una cuenta CRM asociada. Devuelve el pedido a Comercial para vincular la cuenta real del cliente antes de aprobarlo.",
      pedido_sin_contacto_crm: "La cotización no tiene un contacto asociado. Devuelve el pedido a Comercial para completar los datos del cliente antes de aprobarlo.",
      cotizacion_sin_total: "La cotización no tiene un total válido. Devuelve el pedido a Comercial para corregirla.",
    };
    const message = response.error ? knownErrors[response.error] || response.error : "No se pudo aprobar y liberar el pedido.";
    return NextResponse.json(
      { error: message },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
