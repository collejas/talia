import { proxyBillingRequest } from "../../proxy"

export async function GET(request: Request) {
  return proxyBillingRequest(request, "/billing/master/adjustments")
}

export async function POST(request: Request) {
  return proxyBillingRequest(request, "/billing/master/adjustments")
}
