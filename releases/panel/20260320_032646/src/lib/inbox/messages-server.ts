import { callCrmApi } from "@/lib/api/crm";
import { mapMessageRows } from "@/lib/inbox/transform";
import type { InboxMessage, InboxMessageRow } from "@/lib/inbox/types";

type FetchMessagesSuccess = {
  ok: true;
  messages: InboxMessage[];
};

type FetchMessagesError = {
  ok: false;
  status: number;
  error: string;
};

export type FetchMessagesResult = FetchMessagesSuccess | FetchMessagesError;

type FetchMessagesOptions = {
  conversationId: string;
  limit: number;
  before?: string | null;
};

const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

export async function fetchLatestMessages(options: FetchMessagesOptions): Promise<FetchMessagesResult> {
  const conversationId = options.conversationId?.trim();
  if (!conversationId) {
    return { ok: false, status: 400, error: "conversation_required" };
  }

  const limit = clampLimit(options.limit);
  const before =
    typeof options.before === "string" && options.before.trim().length ? options.before.trim() : undefined;

  const params: Record<string, string> = { limit: String(limit) };
  if (before) {
    params.before = before;
  }

  const response = await callCrmApi<InboxMessageRow[]>(
    `/crm/inbox/messages/${conversationId}`,
    {
      withUserToken: true,
      searchParams: params,
    },
  );

  if (response.ok && Array.isArray(response.data)) {
    const messages = sortMessagesChronologically(mapMessageRows(response.data));
    return { ok: true, messages };
  }

  const status = response.ok ? 500 : response.status ?? 500;
  const error = response.ok ? "messages_fetch_failed" : response.error || "messages_fetch_failed";

  if (!response.ok) {
    console.error("[inbox] crm inbox messages failed", {
      conversationId,
      status,
      error,
    });
    if (status >= 500) {
      return { ok: false, status, error };
    }
  }

  return { ok: true, messages: [] };
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return 100;
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(limit)));
}

function sortMessagesChronologically(messages: InboxMessage[]): InboxMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return -1;
    if (Number.isNaN(bTime)) return 1;
    return aTime - bTime;
  });
}
