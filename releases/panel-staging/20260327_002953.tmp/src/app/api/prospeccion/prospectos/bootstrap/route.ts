import { proxyProspeccionRequest } from "../proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/prospectos/bootstrap",
    forwardSearch: true,
  })
}
