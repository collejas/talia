"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ oportunidadId: string; actividadId: string }> },
) {
  const { oportunidadId, actividadId } = await params;
  if (!oportunidadId || !actividadId) {
    return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/actividades/${actividadId}/cancelar`, {
    method: "POST",
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo cancelar la actividad." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json({ data: response.data });
}
