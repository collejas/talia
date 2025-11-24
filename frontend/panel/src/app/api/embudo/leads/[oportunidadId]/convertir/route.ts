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

  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/convertir`, {
    method: "POST",
    withUserToken: true,
    body: { forzar: Boolean(body?.forzar) },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo convertir la oportunidad." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
