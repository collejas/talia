import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers";

export async function POST(request: Request, { params }: { params: Promise<{ transformationId: string }> }) {
  const { transformationId } = await params;
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/operacion/transformaciones/${encodeURIComponent(transformationId)}/activar`,
  });
}
