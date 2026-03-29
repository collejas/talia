import { proxyOpenAiCostsRequest } from "../proxy";

export async function GET(request: Request) {
  return proxyOpenAiCostsRequest(
    request,
    "/crm/analytics/openai/costs/daily",
    "/crm/analytics/openai/master/costs/daily",
  );
}
