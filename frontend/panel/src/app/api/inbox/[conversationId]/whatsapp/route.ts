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

  const response = await callCrmApi<Record<string, unknown>>(
    `/crm/inbox/conversations/${normalizedId}/whatsapp`,
    { method: "DELETE", withUserToken: true },
  );
  if (!response.ok) {
    if (response.error) {
      try {
        const parsed = JSON.parse(response.error) as unknown;
        if (parsed && typeof parsed === "object") {
          return NextResponse.json(parsed, { status: response.status ?? 500 });
        }
      } catch {
        // callCrmApi returns plain text for non-JSON errors.
      }
    }
    return NextResponse.json(
      { error: response.error || "inbox_whatsapp_cleanup_failed" },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
