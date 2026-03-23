import { NextResponse, type NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function POST(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const envioId = segments.at(-2)
  if (!envioId) {
    return NextResponse.json({ error: "envio_id_required" }, { status: 400 })
  }
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/contacto/envios/${envioId}/cancelar`,
    forwardSearch: false,
  })
}
