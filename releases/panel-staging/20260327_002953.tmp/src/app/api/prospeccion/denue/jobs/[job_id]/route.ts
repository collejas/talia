import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await context.params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/denue/jobs/${job_id}`,
    forwardSearch: true,
  })
}

