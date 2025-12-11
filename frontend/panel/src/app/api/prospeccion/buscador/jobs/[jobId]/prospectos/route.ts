import { NextRequest } from "next/server"

import { proxyProspeccionRequest } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type Params = {
  jobId: string
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  const { jobId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/prospeccion/buscador/jobs/${jobId}/prospectos`,
    forwardSearch: false,
  })
}
