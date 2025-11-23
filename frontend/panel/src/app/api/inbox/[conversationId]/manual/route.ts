import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type ManualRequestBody = {
  manual?: unknown;
};

type RouteContext = {
  params?: {
    conversationId?: string;
  };
};

function parseBody(raw: string): ManualRequestBody {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      return data as ManualRequestBody;
    }
    return {};
  } catch {
    return {};
  }
}

export async function POST(request: Request, context: unknown) {
  const routeContext = (context as RouteContext | null) ?? {};
  const conversationId = routeContext.params?.conversationId?.trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const rawBody = await request.text();
  const body = parseBody(rawBody);
  const manualValue = body.manual;

  if (typeof manualValue !== "boolean") {
    return NextResponse.json({ error: "manual_flag_required" }, { status: 422 });
  }

  const response = await callCrmApi(`/crm/inbox/conversations/${conversationId}/manual`, {
    method: "POST",
    body: { manual: manualValue },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "manual_request_failed" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true, manual: manualValue });
}
