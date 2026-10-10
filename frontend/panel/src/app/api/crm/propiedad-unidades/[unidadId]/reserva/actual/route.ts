import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ unidadId: string }> },
) {
  const { unidadId } = await params
  if (!unidadId) {
    return NextResponse.json({ error: "unidad_id_required" }, { status: 400 })
  }

  const response = await callCrmApi(`/crm/propiedad-unidades/${unidadId}/reserva/actual`, {
    method: "GET",
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "property_reserva_actual_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
