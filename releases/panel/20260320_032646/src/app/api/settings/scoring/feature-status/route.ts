import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type Payload = {
  profiling_enabled?: boolean;
  profiling_enabled_global?: boolean;
  profiling_enabled_by_channel?: Record<string, boolean>;
};

export async function GET(request: NextRequest) {
  const canal = request.nextUrl.searchParams.get("canal");
  const response = await callCrmApi<Payload>("/crm/pipeline/scoring/feature-status", {
    method: "GET",
    searchParams: canal ? { canal } : undefined,
  });

  if (!response.ok || !response.data) {
    return NextResponse.json(
      {
        profiling_enabled: true,
        profiling_enabled_global: true,
        profiling_enabled_by_channel: { whatsapp: true, webchat: true },
      },
      { status: 200 },
    );
  }

  return NextResponse.json(response.data);
}
