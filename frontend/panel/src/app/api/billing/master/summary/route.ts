import { proxyBillingRequest } from "../../proxy"

export async function GET(request: Request) {
  return proxyBillingRequest(request, "/billing/master/summary")
}
