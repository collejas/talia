import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ templateId: string; versionId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { templateId, versionId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/contacto/templates/${templateId}/versions/${versionId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { templateId, versionId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/contacto/templates/${templateId}/versions/${versionId}`,
    forwardSearch: false,
  })
}
