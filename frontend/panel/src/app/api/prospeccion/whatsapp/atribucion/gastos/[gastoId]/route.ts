import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type Params = {
  params: Promise<{ gastoId: string }>
}

export async function PATCH(request: Request, { params }: Params) {
  const { gastoId } = await params
  return proxyProspeccionRequest(request, {
    method: "PATCH",
    backendPath: `/crm/prospeccion/whatsapp/atribucion/gastos/${gastoId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const { gastoId } = await params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/whatsapp/atribucion/gastos/${gastoId}`,
    forwardSearch: false,
  })
}
