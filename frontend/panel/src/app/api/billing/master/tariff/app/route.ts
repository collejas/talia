import { proxyBillingRequest } from "../../../proxy"

export async function POST(request: Request) {
  return proxyBillingRequest(request, "/billing/master/tariff/app")
}
