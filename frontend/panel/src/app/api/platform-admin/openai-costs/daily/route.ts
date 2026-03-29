import { proxyPlatformOpenAiCostsRequest } from "../proxy";

export async function GET(request: Request) {
  return proxyPlatformOpenAiCostsRequest(request, "/crm/analytics/openai/master/costs/daily");
}
