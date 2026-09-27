import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers";

export async function GET(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: "/crm/catalogo-precios/preferences",
  });
}

export async function PUT(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "PUT",
    backendPath: "/crm/catalogo-precios/preferences",
  });
}
