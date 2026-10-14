import { NextRequest, NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(_request: NextRequest, context: { params: Promise<{ unidadId: string }> }) {
  const { unidadId } = await context.params
  const response = await callCrmApi(`/crm/propiedad-unidades/${encodeURIComponent(unidadId)}/reserva/documentos`, { withUserToken: true })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ unidadId: string }> }) {
  const { unidadId } = await context.params
  const response = await callCrmApi(`/crm/propiedad-unidades/${encodeURIComponent(unidadId)}/reserva/documentos`, {
    method: "POST",
    body: await request.formData(),
    withUserToken: true,
  })
  if (response.ok) return NextResponse.json(response.data, { status: 201 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
