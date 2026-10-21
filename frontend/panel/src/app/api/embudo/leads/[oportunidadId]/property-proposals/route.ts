"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/property-proposals`, {
    method: "POST",
    body: payload as BodyInit,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo crear la propuesta inmobiliaria." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true }, { status: 201 });
}
