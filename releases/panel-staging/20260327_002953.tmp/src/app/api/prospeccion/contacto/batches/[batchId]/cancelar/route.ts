import { NextResponse, type NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function POST(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const batchId = segments.at(-2)
  if (!batchId) {
    return NextResponse.json({ error: "batch_id_required" }, { status: 400 })
  }
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/contacto/batches/${batchId}/cancelar`,
    forwardSearch: false,
  })
}
