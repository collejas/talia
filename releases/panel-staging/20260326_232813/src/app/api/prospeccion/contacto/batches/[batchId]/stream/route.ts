import { NextResponse, type NextRequest } from "next/server"

import { proxyProspeccionStreamingRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const batchId = segments.at(-2)
  if (!batchId) {
    return NextResponse.json({ error: "batch_id_required" }, { status: 400 })
  }
  return proxyProspeccionStreamingRequest(`/crm/prospeccion/contacto/batches/${batchId}/stream`)
}
