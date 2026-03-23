import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET(request: NextRequest) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/prospectos/contact-indicadores",
    forwardSearch: true,
  })
}
