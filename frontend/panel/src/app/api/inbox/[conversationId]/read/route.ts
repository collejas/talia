import { NextResponse, type NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  const normalizedId = conversationId?.trim();
  if (!normalizedId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/inbox/conversations/${normalizedId}/read`, {
    method: "POST",
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "mark_read_failed" },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
