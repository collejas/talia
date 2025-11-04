import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import {
  buildBackendTargets,
  extractConversationIdFromPath,
  fallbackErrorFromText,
  looksLikeHtml,
} from "@/lib/inbox/backend";
import { callSupabaseRpc } from "@/lib/inbox/supabase";
import type { InboxMessageRow } from "@/lib/inbox/data";
import { mapMessageRows } from "@/lib/inbox/transform";

type ReplyRequestBody = {
  content?: string;
  locale?: string | null;
  metadata?: Record<string, unknown> | null;
  clientMessageId?: string | null;
};

type BackendReplyResponse = {
  ok?: boolean;
  reply?: string | null;
  metadata?: Record<string, unknown>;
  messages?: unknown;
  error?: string;
  detail?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBackendReply(raw: string): BackendReplyResponse {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (!isRecord(json)) {
      return {};
    }
    const metadata =
      isRecord(json.metadata) ? (json.metadata as Record<string, unknown>) : undefined;
    return {
      ok: typeof json.ok === "boolean" ? json.ok : undefined,
      reply:
        typeof json.reply === "string" || json.reply === null
          ? (json.reply as string | null)
          : undefined,
      metadata,
      messages: json.messages,
      error: typeof json.error === "string" ? json.error : undefined,
      detail: typeof json.detail === "string" ? json.detail : undefined,
      message: typeof json.message === "string" ? json.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractBackendError(payload: BackendReplyResponse): string | undefined {
  if (payload.error && payload.error.trim().length) {
    return payload.error;
  }
  if (payload.detail && payload.detail.trim().length) {
    return payload.detail;
  }
  if (payload.message && payload.message.trim().length) {
    return payload.message;
  }
  return undefined;
}

function parseBody(raw: string): ReplyRequestBody {
  try {
    const data = JSON.parse(raw) as ReplyRequestBody;
    if (data && typeof data === "object") {
      return data;
    }
    return {};
  } catch {
    return {};
  }
}

type RouteContext = {
  params?: {
    conversationId?: string;
  };
};

export async function POST(request: Request, context: unknown) {
  const routeContext = (context as RouteContext | null) ?? {};
  const conversationId =
    routeContext.params?.conversationId?.trim() ?? extractConversationIdFromPath(request.url);
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const rawBody = await request.text();
  const body = parseBody(rawBody);
  const content = (body.content ?? "").trim();

  if (!content.length) {
    return NextResponse.json({ error: "message_required" }, { status: 422 });
  }

  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let backendBaseUrl: string;
  try {
    backendBaseUrl = getPanelApiBaseUrl();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "backend_not_configured" },
      { status: 500 },
    );
  }

  const clientMessageId = body.clientMessageId || crypto.randomUUID();
  const backendPayload = {
    content,
    locale: body.locale ?? null,
    metadata: body.metadata ?? null,
    client_message_id: clientMessageId,
  };

  const backendTargets = buildBackendTargets(backendBaseUrl, conversationId, "responder");
  if (!backendTargets.length) {
    return NextResponse.json(
      { error: "backend_url_invalid" },
      { status: 500 },
    );
  }

  console.log("[inbox] reply targets", backendTargets);

  let backendResponse: Response | null = null;
  let backendText = "";
  let backendData: BackendReplyResponse = {};

  for (let index = 0; index < backendTargets.length; index++) {
    const targetUrl = backendTargets[index]!;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(backendPayload),
      cache: "no-store",
    });
    const text = await response.text();
    const parsed = parseBackendReply(text);
    const html = looksLikeHtml(text);

    console.log("[inbox] reply attempt", {
      target: targetUrl,
      status: response.status,
      html,
      sample: text.slice(0, 120),
    });

    backendResponse = response;
    backendText = text;
    backendData = parsed;

    if (!response.ok && response.status === 404 && html && index + 1 < backendTargets.length) {
      // Probablemente golpeamos el frontend (HTML). Probamos siguiente target.
      continue;
    }
    break;
  }

  if (!backendResponse) {
    return NextResponse.json(
      { error: "assistant_request_failed" },
      { status: 502 },
    );
  }

  if (!backendResponse.ok) {
    const detail = extractBackendError(backendData) ?? "assistant_request_failed";
    const enrichedDetail = detail === "assistant_request_failed"
      ? fallbackErrorFromText(backendText) ?? detail
      : detail;
    return NextResponse.json({ error: enrichedDetail }, { status: backendResponse.status });
  }

  const messagesRpc = await callSupabaseRpc<InboxMessageRow[]>("panel_inbox_messages", {
    body: { p_conversacion_id: conversationId, p_limit: 100 },
  });

  if (!messagesRpc.ok) {
    const status = messagesRpc.status ?? 500;
    return NextResponse.json({ error: messagesRpc.error }, { status });
  }

  const messages = mapMessageRows(messagesRpc.data);
  return NextResponse.json({
    ok: true,
    reply: backendData.reply ?? null,
    metadata: backendData.metadata ?? {},
    messages,
  });
}
