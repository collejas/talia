import { NextResponse, type NextRequest } from "next/server"

import { proxyProspeccionRequest } from "../../../prospectos/proxy-helpers"

export async function PATCH(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean)
  const suppressionId = segments.at(-1)
  if (!suppressionId) {
    return NextResponse.json({ error: "suppression_id_required" }, { status: 400 })
  }
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/contacto/suppressions/${suppressionId}`,
    forwardSearch: false,
  })
}
