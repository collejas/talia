import { proxyBillingRequest } from "../../proxy"

export async function GET(request: Request) {
  return proxyBillingRequest(request, "/billing/master/configuration")
}

export async function PUT(request: Request) {
  return proxyBillingRequest(request, "/billing/master/configuration")
}
