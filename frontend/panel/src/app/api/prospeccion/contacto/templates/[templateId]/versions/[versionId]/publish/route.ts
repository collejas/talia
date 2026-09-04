import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ templateId: string; versionId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { templateId, versionId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/contacto/templates/${templateId}/versions/${versionId}/publish`,
    forwardSearch: false,
  })
}
