import { proxyProspeccionRequest } from "../proxy-helpers"

/**
 * Proxy contact scheduling requests for saved prospects to the backend API.
 */
export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/prospeccion/prospectos/contactar",
    forwardSearch: false,
  })
}
