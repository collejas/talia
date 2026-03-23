import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import { mapThreads } from "@/lib/inbox/threads";
import type { InboxThreadRow } from "@/lib/inbox/types";
import { extractConversationIdFromPath } from "@/lib/inbox/backend";

type RouteContext = {
  params?: Promise<{
    conversationId?: string;
  }>;
};

function parseNumber(value: string | null, fallback: number, options: { min: number; max: number }): number {
  if (!value) return fallback;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return fallback;
  return Math.min(options.max, Math.max(options.min, numeric));
}

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
  const messageLimit = parseNumber(searchParams.get("message_limit"), 20, { min: 1, max: 50 });
  const threadOffset = parseNumber(searchParams.get("thread_offset"), 0, { min: 0, max: 10_000 });
  const estado = searchParams.get("estado")?.trim() || "";
  const source = searchParams.get("source")?.trim() || "";
  const channel = searchParams.get("channel")?.trim() || "";
  const date = searchParams.get("date")?.trim() || "";
  const batchId = searchParams.get("batch_id")?.trim() || "";
  const campanaId = searchParams.get("campana_id")?.trim() || "";

  const response = await callCrmApi<InboxThreadRow>(
    `/crm/inbox/conversations/${conversationId}/detail`,
    {
      withUserToken: true,
      searchParams: {
        message_limit: String(messageLimit),
        thread_offset: String(threadOffset),
        ...(estado ? { estado } : {}),
        ...(source ? { source } : {}),
        ...(channel ? { channel } : {}),
        ...(date ? { date } : {}),
        ...(batchId ? { batch_id: batchId } : {}),
        ...(campanaId ? { campana_id: campanaId } : {}),
      },
    },
  );

  if (!response.ok) {
    const status = response.status ?? 500;
    const error = response.error || "No se pudo consultar el detalle de la conversación";
    return NextResponse.json({ error }, { status });
  }

  const row = response.data && typeof response.data === "object" ? (response.data as InboxThreadRow) : null;
  if (!row) {
    return NextResponse.json({ error: "inbox_thread_detail_not_found" }, { status: 404 });
  }
  const thread = mapThreads([row])[0] ?? null;
  if (!thread) {
    return NextResponse.json({ error: "inbox_thread_detail_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, thread });
}
