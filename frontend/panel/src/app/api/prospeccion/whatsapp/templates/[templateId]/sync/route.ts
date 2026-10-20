import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type RouteContext = { params: Promise<{ templateId: string }> }

/** Proxy explícito para que el cliente pueda sincronizar el estado remoto de Meta. */
export async function POST(request: Request, context: RouteContext) {
  const { templateId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/whatsapp/templates/${templateId}/sync`,
    forwardSearch: false,
  })
}
