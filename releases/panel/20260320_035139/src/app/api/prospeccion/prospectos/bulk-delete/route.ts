import { proxyProspeccionRequest } from "../proxy-helpers"

export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/prospeccion/prospectos/bulk-delete",
  })
}
