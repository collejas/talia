import { proxyProspeccionRequest } from "../../prospectos/proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/contacto/brevo-quota",
  })
}
