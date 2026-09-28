import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(_request: Request, context: { params: Promise<{ pedimentoId: string }> }) {
  const { pedimentoId } = await context.params
  const response = await callCrmApi<Record<string, unknown>>(
    `/crm/compras/pedimentos/${encodeURIComponent(pedimentoId)}`,
    { withUserToken: true },
  )

  if (!response.ok || !response.data) {
    const error = "error" in response ? response.error : "pedimento_not_found"
    const status = "status" in response ? response.status : 404
    return NextResponse.json({ error: error ?? "pedimento_not_found" }, { status: status ?? 404 })
  }

  return NextResponse.json(response.data)
}
