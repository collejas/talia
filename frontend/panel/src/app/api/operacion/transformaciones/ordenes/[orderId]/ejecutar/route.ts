import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/operacion/transformaciones/ordenes/${encodeURIComponent(orderId)}/ejecutar`,
  });
}
