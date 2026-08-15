import { proxyBillingRequest } from "../../../../proxy"

export async function POST(request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params
  return proxyBillingRequest(request, `/billing/master/periods/${periodId}/close`)
}
