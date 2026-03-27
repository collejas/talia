import type { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteParams = { params: Promise<{ listaId: string }> }

export async function PATCH(request: NextRequest, context: RouteParams) {
  const { listaId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/contacto/listas/${listaId}`,
  })
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  const { listaId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/contacto/listas/${listaId}`,
  })
}
