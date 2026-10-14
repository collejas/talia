import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function POST(_request: Request, context: { params: Promise<{ unidadId: string }> }) {
  const { unidadId } = await context.params
  const response = await callCrmApi(`/crm/propiedad-unidades/${encodeURIComponent(unidadId)}/reserva/enviar-validacion`, { method: "POST", withUserToken: true })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
