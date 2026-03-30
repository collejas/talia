import { proxyProspeccionRequest } from "../../prospeccion/prospectos/proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/me/notifications/unread-count",
    forwardSearch: true,
  })
}
