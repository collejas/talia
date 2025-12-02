import { NextResponse, type NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

function parseBody(raw: string): { manual?: unknown } {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      return data as { manual?: unknown };
    }
    return {};
  } catch {
    return {};
  }
}

async function resolveConversationId(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
): Promise<string | null> {
  if (context?.params) {
    try {
      const params = await context.params;
      const value = params?.conversationId;
      if (typeof value === "string" && value.trim().length) {
        return value.trim();
      }
    } catch {
      // fall back to parsing URL
    }
  }
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const manualIndex = segments.lastIndexOf("manual");
    if (manualIndex > 0) {
      const candidate = segments[manualIndex - 1];
      if (candidate && candidate.length > 20) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const conversationId = await resolveConversationId(request, context);
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
