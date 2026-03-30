import { proxyProspeccionRequest } from "../../prospeccion/prospectos/proxy-helpers"

export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/me/notifications/read-all",
    forwardSearch: false,
  })
}
