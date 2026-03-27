import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/denue/actividades",
    forwardSearch: true,
  })
}

