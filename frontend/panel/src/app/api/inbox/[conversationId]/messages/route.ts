import { NextResponse } from "next/server";

import { callSupabaseRpc } from "@/lib/inbox/supabase";
import type { InboxMessageRow } from "@/lib/inbox/data";
import { mapMessageRows } from "@/lib/inbox/transform";

type RouteContext = {
  params?: {
    conversationId?: string;
  };
};

export async function GET(request: Request, context: unknown) {
  const routeContext = context as RouteContext;
  const conversationId = routeContext.params?.conversationId;
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

  const body: Record<string, unknown> = {
    p_conversacion_id: conversationId,
    p_limit: limit,
  };
  if (before) {
    body.p_before = before;
  }

  const rpc = await callSupabaseRpc<InboxMessageRow[]>("panel_inbox_messages", {
    body,
  });

  if (!rpc.ok) {
    const status = rpc.status ?? 500;
    return NextResponse.json({ error: rpc.error }, { status });
  }

  const messages = mapMessageRows(rpc.data);
  return NextResponse.json({ ok: true, messages });
}
