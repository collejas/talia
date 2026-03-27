import { NextResponse, type NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import { fetchLatestMessages } from "@/lib/inbox/messages-server";

type ReplyRequestAttachment = {
  url: string;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  provider_id?: string | null;
  path?: string | null;
};

type ReplyRequestBody = {
  content?: string;
  locale?: string | null;
  metadata?: Record<string, unknown> | null;
  clientMessageId?: string | null;
  attachments?: ReplyRequestAttachment[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAttachments(value: unknown): ReplyRequestAttachment[] {
  if (!Array.isArray(value)) return [];
  const items: ReplyRequestAttachment[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) continue;
    const attachment: ReplyRequestAttachment = { url };
    if (typeof record.name === "string" && record.name.trim()) attachment.name = record.name.trim();
    if (typeof record.mime === "string" && record.mime.trim()) attachment.mime = record.mime.trim();
    const sizeCandidate =
      record.size ?? record.size_bytes ?? record.tamano_bytes ?? record.sizeBytes;
    if (typeof sizeCandidate === "number" && Number.isFinite(sizeCandidate)) {
      attachment.size = Math.trunc(sizeCandidate);
    } else if (typeof sizeCandidate === "string") {
      const parsed = Number(sizeCandidate);
      if (Number.isFinite(parsed)) attachment.size = Math.trunc(parsed);
    }
    const providerCandidate =
      record.provider_id ?? record.providerId ?? record.proveedor_id ?? record.proveedorId;
    if (typeof providerCandidate === "string" && providerCandidate.trim()) {
      attachment.provider_id = providerCandidate.trim();
    }
    if (typeof record.path === "string" && record.path.trim()) {
      attachment.path = record.path.trim();
    }
    items.push(attachment);
  }
  return items;
}

function parseBody(raw: string): ReplyRequestBody {
  try {
    const json = JSON.parse(raw);
    if (!isRecord(json)) return {};
    const attachments = normalizeAttachments(json.attachments);
    const metadata = isRecord(json.metadata) ? (json.metadata as Record<string, unknown>) : null;
    return {
      content: typeof json.content === "string" ? json.content : undefined,
      locale:
        typeof json.locale === "string" && json.locale.trim().length ? json.locale : undefined,
      metadata,
      clientMessageId:
        typeof json.clientMessageId === "string" && json.clientMessageId.trim().length
          ? json.clientMessageId
          : undefined,
      attachments,
    };
  } catch {
    return {};
  }
}

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

async function resolveConversationId(
  request: NextRequest,
  context: RouteContext,
): Promise<string | null> {
  if (context.params) {
    try {
      const params = await context.params;
      const value = params?.conversationId;
      if (typeof value === "string" && value.trim().length) {
        return value.trim();
      }
    } catch {
      // fallback below
    }
  }
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const replyIndex = segments.lastIndexOf("reply");
    if (replyIndex > 0) {
      const candidate = segments[replyIndex - 1];
      if (candidate && candidate.length > 20) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const conversationId = await resolveConversationId(request, context);
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const rawBody = await request.text();
  const body = parseBody(rawBody);
  const content = (body.content ?? "").trim();
  const attachments = body.attachments ?? [];

  if (!content.length && attachments.length === 0) {
    return NextResponse.json({ error: "message_required" }, { status: 422 });
  }

  const response = await callCrmApi<{ ok: boolean; reply: string | null; metadata: unknown }>(
    `/crm/inbox/conversations/${conversationId}/reply`,
    {
      method: "POST",
      body: {
        content,
        locale: body.locale ?? null,
        metadata: body.metadata ?? null,
        client_message_id: body.clientMessageId,
        attachments: attachments.map((attachment) => ({
          url: attachment.url,
          name: attachment.name ?? null,
          mime: attachment.mime ?? null,
          size: attachment.size ?? null,
          provider_id: attachment.provider_id ?? null,
          path: attachment.path ?? null,
        })),
      },
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "assistant_request_failed" },
      { status: response.status ?? 500 },
    );
  }

  const messagesResult = await fetchLatestMessages({ conversationId, limit: 100 });
  if (!messagesResult.ok) {
    return NextResponse.json({ error: messagesResult.error }, { status: messagesResult.status });
  }

  return NextResponse.json({
    ok: true,
    reply: response.data?.reply ?? null,
    metadata: response.data?.metadata ?? {},
    messages: messagesResult.messages,
  });
}
