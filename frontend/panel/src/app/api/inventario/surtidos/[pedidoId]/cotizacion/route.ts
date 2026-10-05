import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pedidoId: string }> },
) {
  const { pedidoId } = await params;
  if (!pedidoId) return NextResponse.json({ error: "Falta pedidoId." }, { status: 400 });

  const response = await callCrmApi(`/crm/pedidos-venta/${encodeURIComponent(pedidoId)}/cotizacion.pdf`, {
    responseType: "arrayBuffer",
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo generar la cotización." },
      { status: response.status ?? 500 },
    );
  }

  const content = response.data;
  if (!(content instanceof ArrayBuffer)) {
    return NextResponse.json({ error: "La cotización no devolvió un PDF válido." }, { status: 502 });
  }
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="cotizacion.pdf"',
    },
  });
}
