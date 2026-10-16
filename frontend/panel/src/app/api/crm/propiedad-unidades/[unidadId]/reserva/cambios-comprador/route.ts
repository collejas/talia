import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(_request: NextRequest, context: { params: Promise<{ unidadId: string }> }) {
  const { unidadId } = await context.params
  if (!unidadId) return NextResponse.json({ error: "unidad_id_required" }, { status: 400 })

  const response = await callCrmApi(`/crm/propiedad-unidades/${encodeURIComponent(unidadId)}/reserva/cambios-comprador`, {
    method: "GET",
    withUserToken: true,
  })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
