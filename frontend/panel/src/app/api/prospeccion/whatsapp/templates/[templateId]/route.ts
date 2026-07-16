import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ templateId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/whatsapp/templates/${templateId}`,
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/whatsapp/templates/${templateId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/whatsapp/templates/${templateId}`,
    forwardSearch: false,
  })
}
