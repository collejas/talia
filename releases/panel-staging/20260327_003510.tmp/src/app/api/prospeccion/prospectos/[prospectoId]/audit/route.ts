import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type Params = {
  prospectoId: string
}

export async function GET(request: Request, context: { params: Promise<Params> }) {
  const { prospectoId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/prospectos/${prospectoId}/audit`,
  })
}
