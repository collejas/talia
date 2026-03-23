import { NextResponse } from "next/server";

import { fetchLatestMessages } from "@/lib/inbox/messages-server";
import { extractConversationIdFromPath } from "@/lib/inbox/backend";

type RouteContext = {
  params?: Promise<{
    conversationId?: string;
  }>;
};

export async function GET(request: Request, context: unknown) {
  const routeContext = context as RouteContext;
  let conversationId: string | null = null;
  if (routeContext.params) {
    try {
      const params = await routeContext.params;
      conversationId = params?.conversationId?.trim() ?? null;
    } catch {
      // ignore and fall back to path parsing
    }
  }
  if (!conversationId) {
    conversationId = extractConversationIdFromPath(request.url)?.trim() ?? null;
  }
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const before = searchParams.get("before");
  const limit =
    limitParam && !Number.isNaN(Number(limitParam))
      ? Math.min(500, Math.max(1, Number(limitParam)))
      : 100;

  const result = await fetchLatestMessages({ conversationId, limit, before });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const messages = result.messages;
  return NextResponse.json({ ok: true, messages });
}
