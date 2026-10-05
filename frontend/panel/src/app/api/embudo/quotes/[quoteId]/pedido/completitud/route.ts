import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  _request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await context.params;
  const response = await callCrmApi(`/crm/cotizaciones/${quoteId}/pedido/completitud`, {
    method: "POST",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar la completitud del pedido." },
      { status: response.status || 502 },
    );
  }
  return NextResponse.json(response.data);
}
