import { proxyOpenAiCostsRequest } from "../proxy";

export async function GET(request: Request) {
  return proxyOpenAiCostsRequest(request, "/crm/analytics/openai/costs/models");
}
