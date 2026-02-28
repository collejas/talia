import { NextResponse, type NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

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
      // fallback to URL parsing
    }
  }
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const promoteIndex = segments.lastIndexOf("promote");
    if (promoteIndex > 0) {
      const candidate = segments[promoteIndex - 1];
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

  let body: unknown = undefined;
  try {
    if (request.headers.get("content-length") !== "0") {
      body = await request.json();
    }
  } catch {
    body = undefined;
  }

  const response = await callCrmApi(`/crm/inbox/conversations/${conversationId}/promote`, {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "promote_request_failed" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
