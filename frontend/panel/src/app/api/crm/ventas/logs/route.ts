import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const params: Record<string, string> = {};

  if (limit) {
    params.limit = limit;
  }

  const response = await callCrmApi("/crm/ventas/logs", {
    searchParams: params,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "sale_logs_unavailable" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? { logs: [] });
}
