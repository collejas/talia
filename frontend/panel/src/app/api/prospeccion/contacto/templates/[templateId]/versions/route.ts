import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ templateId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/contacto/templates/${templateId}/versions`,
    forwardSearch: false,
  })
}

export async function POST(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/contacto/templates/${templateId}/versions`,
    forwardSearch: false,
  })
}
