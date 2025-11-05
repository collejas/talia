import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { buildBackendTargets } from "@/lib/inbox/backend";
import { callSupabaseRpc } from "@/lib/inbox/supabase";
import { mapMessageRows } from "@/lib/inbox/transform";
import type { InboxAttachment, InboxMessage, InboxMessageRow } from "@/lib/inbox/types";

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
  const before = typeof options.before === "string" && options.before.trim().length ? options.before.trim() : undefined;

  const rpcBody: Record<string, unknown> = { p_conversacion_id: conversationId, p_limit: limit };
  if (before) {
    rpcBody.p_before = before;
  }

  const rpc = await callSupabaseRpc<InboxMessageRow[]>("panel_inbox_messages", {
    body: rpcBody,
  });

  if (rpc.ok) {
    const messages = sortMessagesChronologically(mapMessageRows(rpc.data));
    return { ok: true, messages };
  }

  console.error("[inbox] panel_inbox_messages RPC failed", {
    conversationId,
    status: rpc.status,
    error: rpc.error,
  });

  const fallback = await fetchMessagesFromBackend({ conversationId, limit, before });
  if (fallback.ok) {
    return { ok: true, messages: sortMessagesChronologically(fallback.messages) };
  }

  const status = fallback.status ?? rpc.status ?? 500;
  const error = fallback.error || rpc.error || "messages_fetch_failed";
  if (status >= 500) {
    return { ok: false, status, error };
  }
  console.warn("[inbox] unable to load messages (non-fatal)", {
    conversationId,
    status,
    error,
  });
  return { ok: true, messages: [] };
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return 100;
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(limit)));
}

async function fetchMessagesFromBackend(options: FetchMessagesOptions): Promise<FetchMessagesResult> {
  const conversationId = options.conversationId;
  const limit = clampLimit(options.limit);

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return { ok: false, status: 401, error: "auth_required" };
  }

  let backendBaseUrl: string;
  try {
    backendBaseUrl = getPanelApiBaseUrl();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "backend_not_configured",
    };
  }

  const targets = buildBackendTargets(backendBaseUrl, conversationId, "mensajes");
  if (!targets.length) {
    return { ok: false, status: 500, error: "backend_url_invalid" };
  }

  let lastStatus = 502;
  let lastError = "assistant_request_failed";

  for (const target of targets) {
    try {
      const url = new URL(target);
      url.searchParams.set("limit", String(limit));
      // El backend legacy todavía no soporta paginación por timestamp, pero conservamos el parámetro por compatibilidad futura.
      if (options.before && typeof options.before === "string" && options.before.trim().length) {
        url.searchParams.set("before", options.before.trim());
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const payload = await readJson(response);
      if (!response.ok) {
        lastStatus = response.status;
        lastError = extractBackendError(payload) ?? lastError;
        if (response.status === 404 && looksLikeHtmlPayload(payload)) {
          continue;
        }
        break;
      }

      const payloadObject =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null;
      const itemsSource = payloadObject?.items;
      const items = Array.isArray(itemsSource)
        ? (itemsSource as unknown[])
        : Array.isArray(payload)
          ? (payload as unknown[])
          : [];
      const messages = mapLegacyMessages(items, conversationId);
      return { ok: true, messages };
    } catch (error) {
      lastStatus = 502;
      lastError = error instanceof Error ? error.message : "backend_fetch_failed";
    }
  }

  if (lastStatus >= 400 && lastStatus < 500) {
    return { ok: true, messages: [] };
  }

  return { ok: false, status: lastStatus, error: lastError };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractBackendError(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const candidates = [record.error, record.detail, record.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }
  return undefined;
}

function looksLikeHtmlPayload(payload: unknown): boolean {
  if (typeof payload !== "string") return false;
  const sample = payload.trim().slice(0, 64).toLowerCase();
  return sample.startsWith("<!doctype") || sample.startsWith("<html");
}

function mapLegacyMessages(raw: unknown[], conversationId: string): InboxMessage[] {
  if (!Array.isArray(raw) || !raw.length) {
    return [];
  }

  const rows: InboxMessageRow[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const idValue = record.id;
    if (typeof idValue !== "string" || idValue.trim().length === 0) {
      continue;
    }

    const role: "contacto" | "usuario" =
      record.direccion === "saliente" ? "usuario" : "contacto";
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : null;

    const bodySegments = Array.isArray(record.body)
      ? record.body.filter((segment) => typeof segment === "string")
      : null;
    const text = typeof record.texto === "string" ? record.texto : "";
    const body = bodySegments && bodySegments.length ? (bodySegments as string[]) : text ? [text] : [];

    const attachments = normalizeLegacyAttachments(record.attachments);

    const author = deriveLegacyAuthor(role, metadata, record);

    rows.push({
      message_id: idValue,
      conversacion_id: conversationId,
      author,
      role,
      body,
      tipo_contenido: typeof record.tipo_contenido === "string" ? record.tipo_contenido : null,
      datos: metadata,
      creado_en: typeof record.creado_en === "string" ? record.creado_en : null,
      attachments,
    });
  }

  if (!rows.length) {
    return [];
  }

  return mapMessageRows(rows);
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

function normalizeLegacyAttachments(source: unknown): InboxAttachment[] {
  if (!Array.isArray(source)) return [];
  const results: InboxAttachment[] = [];
  const seen = new Set<string>();

  for (const raw of source) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : null;
    if (!url) continue;

    const name = typeof record.name === "string" && record.name.trim().length ? record.name.trim() : undefined;
    const mime = typeof record.mime === "string" ? record.mime : undefined;
    const providerId = typeof record.provider_id === "string" ? record.provider_id : undefined;
    const path = typeof record.path === "string" ? record.path : undefined;

    const sizeValue = record.size ?? record.tamano_bytes ?? record.size_bytes;
    const size = coerceNumber(sizeValue);

    const id = typeof record.id === "string" ? record.id : undefined;
    const dedupeKey = `${url}::${name ?? ""}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    results.push({
      id,
      url,
      name,
      mime,
      size,
      provider_id: providerId,
      path,
    });
  }

  return results;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}

function deriveLegacyAuthor(
  role: "contacto" | "usuario",
  metadata: Record<string, unknown> | null,
  record: Record<string, unknown>,
): string {
  if (role === "usuario") {
    const senderType = normaliseSenderType(metadata?.sender_type || record.sender_type);
    const agentName = extractAgentName(metadata);
    if (senderType === "human" && agentName) {
      return agentName;
    }
    return agentName || "Equipo Tal-IA";
  }

  const contactName = extractContactName(metadata);
  if (contactName) {
    return contactName;
  }
  return "Contacto";
}

function normaliseSenderType(value: unknown): "assistant" | "human" | "user" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const lower = value.trim().toLowerCase();
  if (!lower.length) return undefined;
  if (lower.startsWith("human")) return "human";
  if (lower.startsWith("assistant")) return "assistant";
  if (lower.startsWith("user")) return "user";
  return undefined;
}

function extractAgentName(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "";
  const direct = metadata.agent_name;
  if (typeof direct === "string" && direct.trim().length) {
    return direct.trim();
  }
  const agent = metadata.agent;
  if (agent && typeof agent === "object") {
    const name = (agent as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim().length) {
      return name.trim();
    }
  }
  return "";
}

function extractContactName(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "";
  const direct = metadata.contact_name;
  if (typeof direct === "string" && direct.trim().length) {
    return direct.trim();
  }
  const client = metadata.client;
  if (client && typeof client === "object") {
    const name = (client as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim().length) {
      return name.trim();
    }
  }
  return "";
}
