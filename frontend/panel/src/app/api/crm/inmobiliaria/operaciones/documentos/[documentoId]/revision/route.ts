import { NextRequest, NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function PATCH(request: NextRequest, context: { params: Promise<{ documentoId: string }> }) {
  const { documentoId } = await context.params
  const response = await callCrmApi(`/crm/inmobiliaria/operaciones/documentos/${encodeURIComponent(documentoId)}/revision`, {
    method: "PATCH",
    body: await request.formData(),
    withUserToken: true,
  })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
