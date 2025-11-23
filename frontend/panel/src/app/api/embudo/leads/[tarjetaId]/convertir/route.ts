"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/leads/${tarjetaId}/convertir`, {
    method: "POST",
    withUserToken: true,
    body: { forzar: Boolean(body?.forzar) },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo convertir el lead." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
