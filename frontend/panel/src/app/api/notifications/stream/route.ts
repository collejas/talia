import { proxyProspeccionStreamingRequest } from "../../prospeccion/prospectos/proxy-helpers"

export async function GET() {
  return proxyProspeccionStreamingRequest("/crm/me/notifications/stream")
}
