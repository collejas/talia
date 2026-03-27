import { proxyProspeccionRequest } from "../proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/prospectos/preferences",
  })
}

export async function PUT(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "PUT",
    backendPath: "/crm/prospeccion/prospectos/preferences",
  })
}
