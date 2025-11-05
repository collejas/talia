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

function normalizeAttachments(value: unknown): ReplyRequestAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: ReplyRequestAttachment[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const rawUrl = record["url"];
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (!url) continue;

    const attachment: ReplyRequestAttachment = { url };

    const rawName = record["name"] ?? record["nombre"];
    if (typeof rawName === "string" && rawName.trim().length) {
      attachment.name = rawName.trim();
    }

    const rawMime = record["mime"];
    if (typeof rawMime === "string" && rawMime.trim().length) {
      attachment.mime = rawMime.trim();
    }

    const rawSize = record["size"] ?? record["size_bytes"] ?? record["tamano_bytes"];
    if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
      attachment.size = Math.trunc(rawSize);
    } else if (typeof rawSize === "string") {
      const parsed = Number(rawSize);
      if (Number.isFinite(parsed)) {
        attachment.size = Math.trunc(parsed);
      }
    }

    const rawProviderId =
      record["provider_id"] ?? record["providerId"] ?? record["proveedor_id"];
    if (typeof rawProviderId === "string" && rawProviderId.trim().length) {
      attachment.provider_id = rawProviderId.trim();
    }

    const rawPath = record["path"];
    if (typeof rawPath === "string" && rawPath.trim().length) {
      attachment.path = rawPath.trim();
    }

    items.push(attachment);
  }
  return items;
}

function parseBody(raw: string): ReplyRequestBody {
  try {
    const json = JSON.parse(raw);
    if (!isRecord(json)) {
      return {};
    }
    const metadataCandidate = json["metadata"];
    const metadata = isRecord(metadataCandidate)
      ? (metadataCandidate as Record<string, unknown>)
      : null;

    const localeCandidate = json["locale"];
    const locale =
      typeof localeCandidate === "string" && localeCandidate.trim().length
        ? localeCandidate
        : null;

    const contentCandidate = json["content"];
    const clientMessageIdCandidate = json["clientMessageId"];

    const attachments = normalizeAttachments(json["attachments"]);

    return {
      content: typeof contentCandidate === "string" ? contentCandidate : undefined,
      locale,
      metadata,
      clientMessageId:
        typeof clientMessageIdCandidate === "string" && clientMessageIdCandidate.trim().length
          ? clientMessageIdCandidate
          : undefined,
      attachments,
    };
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
  const attachments = body.attachments ?? [];

  if (!content.length && attachments.length === 0) {
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
  const backendPayload: Record<string, unknown> = {
    content,
    locale: body.locale ?? null,
    metadata: body.metadata ?? null,
    client_message_id: clientMessageId,
  };

  if (attachments.length) {
    backendPayload.attachments = attachments.map((attachment) => ({
      url: attachment.url,
      name: attachment.name ?? null,
      mime: attachment.mime ?? null,
      size: typeof attachment.size === "number" ? Math.trunc(attachment.size) : null,
      provider_id: attachment.provider_id ?? null,
      path: attachment.path ?? null,
    }));
  }

  const backendTargets = buildBackendTargets(backendBaseUrl, conversationId, "responder");
  if (!backendTargets.length) {
    return NextResponse.json(
      { error: "backend_url_invalid" },
      { status: 500 },
    );
  }

  console.log("[inbox] reply targets", backendTargets);
  if (attachments.length) {
    console.log("[inbox] reply attachments", attachments.map((attachment) => ({
      url: attachment.url,
      name: attachment.name ?? null,
      size: attachment.size ?? null,
      provider_id: attachment.provider_id ?? null,
    })));
  }

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

  const messagesResult = await fetchLatestMessages({ conversationId, limit: 100 });
  if (!messagesResult.ok) {
    return NextResponse.json({ error: messagesResult.error }, { status: messagesResult.status });
  }

  const messages = messagesResult.messages;
  return NextResponse.json({
    ok: true,
    reply: backendData.reply ?? null,
    metadata: backendData.metadata ?? {},
    messages,
  });
}
