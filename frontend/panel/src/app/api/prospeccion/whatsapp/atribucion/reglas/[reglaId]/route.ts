import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type Params = {
  params: Promise<{ reglaId: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  const { reglaId } = await params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/whatsapp/atribucion/reglas/${reglaId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const { reglaId } = await params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/whatsapp/atribucion/reglas/${reglaId}`,
    forwardSearch: false,
  })
}
