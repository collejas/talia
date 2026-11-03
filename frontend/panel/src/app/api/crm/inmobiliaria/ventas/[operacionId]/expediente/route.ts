import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(_request: Request, context: { params: Promise<{ operacionId: string }> }) {
  const { operacionId } = await context.params
  const response = await callCrmApi<{ expediente?: unknown }>(
    `/crm/inmobiliaria/ventas/${encodeURIComponent(operacionId)}/expediente`,
    { withUserToken: true },
  )
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "inmobiliaria_operation_detail_failed" }, { status: response.status ?? 502 })
  }
  return NextResponse.json(response.data ?? { expediente: null }, { status: 200 })
}
