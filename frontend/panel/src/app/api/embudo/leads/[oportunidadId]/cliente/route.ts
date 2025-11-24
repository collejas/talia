"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/cliente`, {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo recuperar el cliente." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { cliente: null });
}
