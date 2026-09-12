"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await params;
  if (!quoteId) return NextResponse.json({ error: "Falta quoteId." }, { status: 400 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/cotizaciones/${quoteId}/pago-confirmado`, {
    method: "POST",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo registrar el pago." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
