import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type Context = { params: Promise<{ prospectoId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const { prospectoId } = await params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/prospectos/${prospectoId}/contactos`,
    forwardSearch: true,
  })
}
