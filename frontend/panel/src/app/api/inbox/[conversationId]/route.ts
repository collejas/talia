import { NextResponse, type NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  const normalizedId = conversationId?.trim();
  if (!normalizedId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const response = await callCrmApi<{ ok: boolean; conversation_id: string; channel: string }>(
    `/crm/inbox/conversations/${normalizedId}`,
    { method: "DELETE", withUserToken: true },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "inbox_email_delete_failed" },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
