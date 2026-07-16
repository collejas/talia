import { proxyProspeccionRequest } from "./proxy-helpers"

export const dynamic = "force-dynamic"
export const revalidate = 0

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
