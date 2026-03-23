import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "../proxy-helpers"

type ProspectoParams = Promise<{ prospectoId: string }>

export async function PATCH(request: NextRequest, { params }: { params: ProspectoParams }) {
  const { prospectoId } = await params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/prospectos/${prospectoId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: NextRequest, { params }: { params: ProspectoParams }) {
  const { prospectoId } = await params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/prospectos/${prospectoId}`,
    forwardSearch: false,
  })
}
