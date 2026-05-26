import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type SignedUrlResponse = {
  url: string
  expires_in?: number
}

type RouteContext = {
  params: Promise<{
    ordenId: string
    tipoDocumento: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { ordenId, tipoDocumento } = await context.params
  const response = await callCrmApi<SignedUrlResponse>(`/crm/compras/ordenes/${ordenId}/documentos/${tipoDocumento}/url`)
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "orden_documento_not_found" },
      { status: response.status ?? 404 },
    )
  }
  if (!response.data?.url) {
    return NextResponse.json(
      { error: "orden_documento_not_found" },
      { status: 404 },
    )
  }
  return NextResponse.redirect(response.data.url, 307)
}
