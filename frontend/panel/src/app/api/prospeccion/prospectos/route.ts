import { proxyProspeccionRequest } from "./proxy-helpers"

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/prospeccion/prospectos",
  })
}

export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/prospeccion/prospectos",
  })
}
