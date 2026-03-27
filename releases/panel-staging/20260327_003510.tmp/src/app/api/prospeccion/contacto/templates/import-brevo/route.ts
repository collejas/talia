import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/prospeccion/contacto/templates/import-brevo",
    forwardSearch: false,
  })
}

