import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type RouteContext = {
  params: Promise<{
    ordenId: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { ordenId } = await context.params
  const response = await callCrmApi<Record<string, unknown>>(`/crm/compras/ordenes/${ordenId}`, {
    withUserToken: true,
  })

  if (!response.ok || !response.data) {
    const error = "error" in response ? response.error : "orden_compra_not_found"
    const status = "status" in response ? response.status : 404
    return NextResponse.json(
      { error: error ?? "orden_compra_not_found" },
      { status: status ?? 404 },
    )
  }

  return NextResponse.json(response.data)
}
