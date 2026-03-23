import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type InboxRuntimeProfileResponse = {
  ok?: boolean;
  high_demand_mode?: boolean;
  recommended_threads_poll_seconds?: number;
  source?: string;
};

export async function GET() {
  const response = await callCrmApi<InboxRuntimeProfileResponse>("/crm/inbox/runtime-profile", {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar el perfil de runtime de Inbox" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
