import { proxyProspeccionStreamingRequest } from "../proxy-helpers"

export async function GET() {
  return proxyProspeccionStreamingRequest("/crm/prospeccion/prospectos/stream")
}
