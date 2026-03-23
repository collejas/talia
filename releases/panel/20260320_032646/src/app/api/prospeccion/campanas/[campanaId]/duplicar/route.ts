import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteParams = Promise<{ campanaId: string }>

export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  const { campanaId } = await params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/campanas/${campanaId}/duplicar`,
  })
}
