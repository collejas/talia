import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ campanaId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { campanaId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/campanas/${campanaId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { campanaId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/campanas/${campanaId}`,
    forwardSearch: false,
  })
}
