import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers";

export async function POST(request: Request) {
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: "/crm/operacion/transformaciones/ordenes",
  });
}
