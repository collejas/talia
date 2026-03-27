import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteParams = { params: Promise<{ prospectoId: string }> }

export async function POST(request: NextRequest, context: RouteParams) {
  const { prospectoId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/prospectos/${prospectoId}/convertir-contacto`,
  })
}
