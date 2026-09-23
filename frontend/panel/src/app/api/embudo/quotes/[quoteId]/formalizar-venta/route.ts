"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await params;
  if (!quoteId) return NextResponse.json({ error: "Falta quoteId." }, { status: 400 });

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    // Empty bodies are valid; the due date is optional in the first version.
  }

  const response = await callCrmApi(`/crm/cotizaciones/${quoteId}/formalizar-venta`, {
    method: "POST",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo formalizar la venta." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
