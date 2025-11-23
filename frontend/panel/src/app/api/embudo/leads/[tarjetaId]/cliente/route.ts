"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/leads/${tarjetaId}/cliente`, {
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
