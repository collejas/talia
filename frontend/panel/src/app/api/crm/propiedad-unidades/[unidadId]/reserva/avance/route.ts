"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unidadId: string }> },
) {
  const { unidadId } = await params;
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/propiedad-unidades/${unidadId}/reserva/avance`, {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "property_reserva_avance_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? {});
}
