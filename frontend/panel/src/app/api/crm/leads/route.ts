import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const response = await callCrmApi("/crm/leads", {
    searchParams: params,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "leads_fetch_failed" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? []);
}
