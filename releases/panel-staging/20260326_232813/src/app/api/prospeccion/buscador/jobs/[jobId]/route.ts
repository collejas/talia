import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type JobParams = Promise<{ jobId: string }>

export async function GET(request: Request, { params }: { params: JobParams }) {
  const { jobId } = await params
  return proxyProspeccionRequest(request, {
    method: "GET",
    backendPath: `/crm/prospeccion/buscador/jobs/${jobId}`,
    forwardSearch: false,
  })
}

export async function DELETE(request: Request, { params }: { params: JobParams }) {
  const { jobId } = await params
  return proxyProspeccionRequest(request, {
    method: "DELETE",
    backendPath: `/crm/prospeccion/buscador/jobs/${jobId}`,
    forwardSearch: false,
  })
}
