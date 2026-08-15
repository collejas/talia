import { proxyBillingRequest } from "../../../proxy"

export async function PUT(request: Request) {
  return proxyBillingRequest(request, "/billing/master/alerts/status")
}
