import { NextRequest, NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: NextRequest, context: { params: Promise<{ operacionId: string }> }) {
  const { operacionId } = await context.params
  const response = await callCrmApi(`/crm/inmobiliaria/operaciones/${encodeURIComponent(operacionId)}/validar-firme`, {
    method: "POST",
    body: await request.formData(),
    withUserToken: true,
  })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
