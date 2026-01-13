"use client";

import * as React from "react";
import {
  IconCircleFilled,
  IconDots,
  IconFilter,
  IconRobot,
  IconRobotOff,
} from "@tabler/icons-react";

import type { InboxThread, InboxMessage } from "@/lib/inbox/data";
import type { InboxAttachment } from "@/lib/inbox/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InboxComposer } from "@/components/inbox/composer";
import { useCurrentUser } from "@/hooks/use-current-user";

const THREADS_REFRESH_INTERVAL_MS = 1600;
const MESSAGES_REFRESH_INTERVAL_MS = 1500;

const CHANNEL_BADGE_STYLES: Record<string, string> = {
  whatsapp: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40",
  messenger: "bg-sky-500/10 text-sky-700 border-sky-500/40",
  webchat: "bg-violet-500/10 text-violet-700 border-violet-500/40",
  default: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/30",
};

function getChannelBadgeClass(channel: string | null | undefined): string {
  const key = (channel ?? "").toLowerCase();
  return CHANNEL_BADGE_STYLES[key] ?? CHANNEL_BADGE_STYLES.default;
}

const SERVER_SHORT_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const SERVER_FULL_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const CLIENT_SHORT_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});
const CLIENT_FULL_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type ReplyMetadata = {
  manual_mode?: boolean;
  [key: string]: unknown;
};

type InboxReplyPayload = {
  ok?: boolean;
  reply?: string | null;
  metadata?: ReplyMetadata;
  messages?: unknown;
  attachments?: InboxAttachment[];
  error?: string;
  detail?: string;
  message?: string;
};

type ManualToggleResponse = {
  ok?: boolean;
  manual?: boolean;
  error?: string;
  detail?: string;
  message?: string;
};

type PendingAttachment = InboxAttachment & { id: string };

function formatShortTimeLabel(timestamp: string | null | undefined, hydrated: boolean): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const formatter = hydrated ? CLIENT_SHORT_TIME_FORMAT : SERVER_SHORT_TIME_FORMAT;
  return formatter.format(date);
}

function formatFullTimeLabel(timestamp: string | null | undefined, hydrated: boolean): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = hydrated ? CLIENT_FULL_TIME_FORMAT : SERVER_FULL_TIME_FORMAT;
  return formatter.format(date);
}

function fingerprintMessages(items: InboxMessage[]): string {
  if (!items.length) {
    return "";
  }
  return items
    .map((item) => `${item.id ?? ""}|${item.timestamp ?? ""}|${item.body?.[0] ?? ""}`)
    .join("::");
}

function parseReplyPayload(raw: string): InboxReplyPayload {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) {
      return {};
    }
    const record = json as Record<string, unknown>;
    const metadata =
      typeof record.metadata === "object" && record.metadata !== null
        ? (record.metadata as ReplyMetadata)
        : undefined;
    const attachments = Array.isArray(record.attachments)
      ? (record.attachments as InboxAttachment[])
      : undefined;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      reply:
        typeof record.reply === "string" || record.reply === null
          ? (record.reply as string | null)
          : undefined,
      metadata,
      messages: record.messages,
      attachments,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractMessages(payload: InboxReplyPayload): InboxMessage[] {
  if (!Array.isArray(payload.messages)) {
    return [];
  }
  return payload.messages as InboxMessage[];
}

function extractError(payload: InboxReplyPayload): string | undefined {
  if (payload.error && typeof payload.error === "string" && payload.error.trim().length) {
    return payload.error;
  }
  if (payload.detail && typeof payload.detail === "string" && payload.detail.trim().length) {
    return payload.detail;
  }
  if (payload.message && typeof payload.message === "string" && payload.message.trim().length) {
    return payload.message;
  }
  return undefined;
}

function parseManualToggleResponse(raw: string): ManualToggleResponse {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) {
      return {};
    }
    const record = json as Record<string, unknown>;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      manual: typeof record.manual === "boolean" ? record.manual : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractManualToggleError(payload: ManualToggleResponse): string | undefined {
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

function normaliseSenderType(value: unknown): "assistant" | "human" | "user" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) {
    return undefined;
  }
  if (trimmed.startsWith("human")) return "human";
  if (trimmed.startsWith("assistant")) return "assistant";
  if (trimmed.startsWith("user")) return "user";
  return undefined;
}

function extractNameCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return null;
}

function extractAgentSenderType(metadata: Record<string, unknown> | null | undefined): "assistant" | "human" | "user" | undefined {
  if (!metadata) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const directCandidates: unknown[] = [
    record["sender_type"],
    record["senderType"],
    record["sender"],
    record["author_type"],
    record["agent_type"],
  ];

  const sender = record["sender"];
  if (sender && typeof sender === "object") {
    const senderRecord = sender as Record<string, unknown>;
    directCandidates.push(senderRecord["type"], senderRecord["sender_type"], senderRecord["senderType"]);
  }

  const agent = record["agent"];
  if (agent && typeof agent === "object") {
    const agentRecord = agent as Record<string, unknown>;
    directCandidates.push(agentRecord["type"], agentRecord["sender_type"], agentRecord["senderType"]);
  }

  let extra = record["extra"];
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = undefined;
    }
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    directCandidates.push(
      extraRecord["sender_type"],
      extraRecord["senderType"],
      extraRecord["sender"],
      extraRecord["author_type"],
      extraRecord["agent_type"],
    );
    const extraSender = extraRecord["sender"];
    if (extraSender && typeof extraSender === "object") {
      const senderRecord = extraSender as Record<string, unknown>;
      directCandidates.push(senderRecord["type"], senderRecord["sender_type"], senderRecord["senderType"]);
    }
    const extraAgent = extraRecord["agent"];
    if (extraAgent && typeof extraAgent === "object") {
      const agentRecord = extraAgent as Record<string, unknown>;
      directCandidates.push(agentRecord["type"], agentRecord["sender_type"], agentRecord["senderType"]);
    }
  }

  for (const candidate of directCandidates) {
    const normalized = normaliseSenderType(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const manualFlag =
    record["manual_override"] ??
    record["manualOverride"] ??
    record["manual_mode"] ??
    record["manualMode"];
  if (typeof manualFlag === "boolean" && manualFlag) {
    return "human";
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    const extraManual =
      extraRecord["manual_override"] ??
      extraRecord["manualOverride"] ??
      extraRecord["manual_mode"] ??
      extraRecord["manualMode"];
    if (typeof extraManual === "boolean" && extraManual) {
      return "human";
    }
  }

  return undefined;
}

function isHumanAgentMessage(message: InboxMessage): boolean {
  if (message.role !== "usuario") {
    return false;
  }
  const metadata =
    message.datos && typeof message.datos === "object"
      ? (message.datos as Record<string, unknown>)
      : null;
  const senderType = extractAgentSenderType(metadata);
  if (senderType === "human") {
    return true;
  }
  if (senderType === "assistant" || senderType === "user") {
    return false;
  }

  const origin = metadata?.origin;
  if (typeof origin === "string" && origin.toLowerCase().includes("manual")) {
    return true;
  }
  const source = metadata?.source;
  if (typeof source === "string" && source.toLowerCase().includes("manual")) {
    return true;
  }
  const manualFlag =
    metadata?.manual_override ??
    metadata?.manualOverride ??
    metadata?.manual_mode ??
    metadata?.manualMode;
  if (typeof manualFlag === "boolean" && manualFlag) {
    return true;
  }
  let extra = metadata?.extra;
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = undefined;
    }
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    const extraOrigin = extraRecord["origin"];
    if (typeof extraOrigin === "string" && extraOrigin.toLowerCase().includes("manual")) {
      return true;
    }
    const extraSource = extraRecord["source"];
    if (typeof extraSource === "string" && extraSource.toLowerCase().includes("manual")) {
      return true;
    }
    const extraManual =
      extraRecord["manual_override"] ??
      extraRecord["manualOverride"] ??
      extraRecord["manual_mode"] ??
      extraRecord["manualMode"];
    if (typeof extraManual === "boolean" && extraManual) {
      return true;
    }
  }
  return false;
}

function resolveHumanAuthorName(
  metadata: Record<string, unknown> | null | undefined,
  fallback: string | null | undefined,
): string {
  const pickName = (source: Record<string, unknown> | null | undefined): string | null => {
    if (!source) return null;
    const keys = [
      "manual_author",
      "manualAuthor",
      "agent_name",
      "agentName",
      "author",
      "author_name",
      "authorName",
    ];
    for (const key of keys) {
      const extracted = extractNameCandidate((source as Record<string, unknown>)[key]);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  };

  const pickEmail = (source: Record<string, unknown> | null | undefined): string | null => {
    if (!source) return null;
    const keys = ["agent_email", "agentEmail", "manual_email", "manualEmail"];
    for (const key of keys) {
      const extracted = extractNameCandidate((source as Record<string, unknown>)[key]);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  };

  const parseExtra = (raw: unknown): Record<string, unknown> | null => {
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return null;
  };

  let candidate = pickName(metadata);
  const extra = parseExtra(metadata?.["extra"]);
  if (!candidate) {
    candidate = pickName(extra);
  }

  let emailCandidate = pickEmail(metadata);
  if (!emailCandidate) {
    emailCandidate = pickEmail(extra);
  }

  if (!candidate && emailCandidate) {
    candidate = emailCandidate;
  }

  if (!candidate && typeof fallback === "string" && fallback.trim().length) {
    candidate = fallback.trim();
  }

  if (!candidate || !candidate.trim().length) {
    candidate = "Miembro del equipo";
  }

  const normalized = candidate.trim().toLowerCase();
  if (normalized === "agent" || normalized === "agente") {
    return emailCandidate ?? "Miembro del equipo";
  }

  return candidate;
}
type InboxSplitViewProps = {
  threads: InboxThread[];
  channelFilter?: string | null;
};

export function InboxSplitView({ threads, channelFilter }: InboxSplitViewProps) {
  const [threadItems, setThreadItems] = React.useState<InboxThread[]>(threads);
  const [selectedId, setSelectedId] = React.useState<string | null>(threads[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [manualToggling, setManualToggling] = React.useState(false);
  const [manualToggleError, setManualToggleError] = React.useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = React.useState<InboxMessage[]>(threads[0]?.messages ?? []);
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = React.useState(false);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
  const [autoScrollLocked, setAutoScrollLocked] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const threadsRefreshingRef = React.useRef(false);
  const messagesRefreshingRef = React.useRef<string | null>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement | null>(null);
  const messagesPollingTimeoutRef = React.useRef<number | null>(null);
  const lastMessagesFingerprintRef = React.useRef<string>("");
  const previousSelectedIdRef = React.useRef<string | null>(null);
  const { user: currentUser } = useCurrentUser();

  const manualAgentMetadata = React.useMemo(() => {
    if (!currentUser) {
      return null;
    }

    const pickString = (value: unknown): string | null => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length) {
          return trimmed;
        }
      }
      return null;
    };

    const userMetadata =
      currentUser.user_metadata &&
      typeof currentUser.user_metadata === "object" &&
      !Array.isArray(currentUser.user_metadata)
        ? (currentUser.user_metadata as Record<string, unknown>)
        : null;

    const nameCandidates: string[] = [];
    if (userMetadata) {
      const metadataKeys = [
        "full_name",
        "fullName",
        "nombre_completo",
        "nombreCompleto",
        "display_name",
        "displayName",
        "name",
      ];
      for (const key of metadataKeys) {
        const candidate = pickString(userMetadata[key]);
        if (candidate) {
          nameCandidates.push(candidate);
        }
      }
    }

    const currentUserRecord = currentUser as Record<string, unknown>;
    const directNameCandidates = [
      pickString(currentUserRecord["name"]),
      pickString(currentUserRecord["full_name"]),
      pickString(currentUserRecord["fullName"]),
    ];
    for (const candidate of directNameCandidates) {
      if (candidate) {
        nameCandidates.push(candidate);
      }
    }

    let resolvedName: string | null = null;
    for (const candidate of nameCandidates) {
      if (candidate) {
        resolvedName = candidate;
        break;
      }
    }

    let email: string | null = null;
    if (typeof currentUser.email === "string" && currentUser.email.trim().length) {
      email = currentUser.email.trim();
    } else {
      const fallbackEmail = pickString(currentUserRecord["email"]);
      if (fallbackEmail) {
        email = fallbackEmail;
      }
    }

    if (!resolvedName && email) {
      const localPart = email.split("@")[0] ?? "";
      const trimmedLocalPart = localPart.trim();
      resolvedName = trimmedLocalPart.length ? trimmedLocalPart : email;
    }

    const userId =
      typeof currentUser.id === "string" && currentUser.id.trim().length
        ? currentUser.id.trim()
        : null;

    const manualMetadata: Record<string, unknown> = {};

    if (resolvedName) {
      manualMetadata.manual_author = resolvedName;
      manualMetadata.manualAuthor = resolvedName;
      manualMetadata.agent_name = resolvedName;
      manualMetadata.agentName = resolvedName;
    }

    if (email) {
      manualMetadata.manual_email = email;
      manualMetadata.manualEmail = email;
      manualMetadata.agent_email = email;
      manualMetadata.agentEmail = email;
    }

    if (userId) {
      manualMetadata.user_id = userId;
      manualMetadata.userId = userId;
      manualMetadata.agent_id = userId;
      manualMetadata.agentId = userId;
    }

    if (resolvedName || email || userId) {
      const userPayload: Record<string, unknown> = {};
      if (userId) {
        userPayload.id = userId;
      }
      if (resolvedName) {
        userPayload.name = resolvedName;
      }
      if (email) {
        userPayload.email = email;
      }
      userPayload.type = "human";
      manualMetadata.user = userPayload;
    }

    return Object.keys(manualMetadata).length ? manualMetadata : null;
  }, [currentUser]);

  React.useEffect(() => {
    setThreadItems(threads);
  }, [threads]);

  React.useEffect(() => {
    if (!selectedId && threadItems.length) {
      setSelectedId(threadItems[0]!.id);
    }
  }, [selectedId, threadItems]);

  const filteredThreads = React.useMemo(() => {
    const term = searchTerm.toLowerCase();
    const normalizedFilter = channelFilter ? channelFilter.toLowerCase() : null;
    return threadItems
      .filter((thread) => {
        if (!normalizedFilter) return true;
        return (thread.canal ?? "").toLowerCase() === normalizedFilter;
      })
      .filter((thread) => {
        if (!term) return true;
        const haystack = [
          thread.contactoNombre,
          thread.canal,
          thread.preview,
          thread.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
  }, [threadItems, searchTerm, channelFilter]);

  const selectedThread = React.useMemo(() => {
    if (!selectedId) {
      return filteredThreads[0] ?? null;
    }
    const withinFiltered = filteredThreads.find((thread) => thread.id === selectedId);
    if (withinFiltered) {
      return withinFiltered;
    }
    const inAll = threadItems.find((thread) => thread.id === selectedId);
    return inAll ?? filteredThreads[0] ?? null;
  }, [selectedId, filteredThreads, threadItems]);

  React.useEffect(() => {
    const initialMessages = selectedThread?.messages ?? [];
    setManualToggleError(null);
    setManualToggling(false);
    setCurrentMessages(initialMessages);
    lastMessagesFingerprintRef.current = fingerprintMessages(initialMessages);
    const currentId = selectedThread?.id ?? null;
    if (previousSelectedIdRef.current !== currentId) {
      setAutoScrollLocked(false);
    }
    previousSelectedIdRef.current = currentId;
  }, [selectedThread?.id, selectedThread?.messages]);

  React.useEffect(() => {
    setPendingAttachments([]);
    setAttachmentError(null);
  }, [selectedThread?.id]);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const SCROLL_THRESHOLD_PX = 72;
    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setAutoScrollLocked(distanceToBottom > SCROLL_THRESHOLD_PX);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [selectedThread?.id]);

  React.useEffect(() => {
    if (autoScrollLocked) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const scrollToBottom = () => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    };
    if ("requestAnimationFrame" in window) {
      requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
  }, [currentMessages, selectedThread?.id, autoScrollLocked]);

  React.useEffect(() => {
    let cancelled = false;

    async function refreshThreads() {
      if (threadsRefreshingRef.current) return;
      threadsRefreshingRef.current = true;
      try {
        const response = await fetch(`/api/inbox/threads?limit=25&message_limit=20`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { threads?: InboxThread[] };
        const incoming = Array.isArray(data?.threads) ? (data.threads as InboxThread[]) : [];
        if (!incoming.length) {
          return;
        }
        setThreadItems((current) => mergeThreadLists(current, incoming));
      } catch (error) {
        console.error("[inbox] refresh threads failed", error);
      } finally {
        threadsRefreshingRef.current = false;
      }
    }

    refreshThreads();
    const interval = setInterval(() => {
      if (!cancelled) {
        refreshThreads();
      }
    }, THREADS_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      threadsRefreshingRef.current = false;
    };
  }, []);

  const refreshMessages = React.useCallback(
    async (conversationId: string, options: { force?: boolean } = {}) => {
      if (!conversationId) return;
      if (messagesRefreshingRef.current === conversationId) {
        return;
      }
      if (!options.force && (uploadingAttachments || pendingAttachments.length > 0 || sending)) {
        return;
      }

      messagesRefreshingRef.current = conversationId;
      try {
        const response = await fetch(`/api/inbox/${conversationId}/messages?limit=100`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { messages?: InboxMessage[] };
        const messages = Array.isArray(payload?.messages) ? (payload.messages as InboxMessage[]) : [];
        const fingerprint = fingerprintMessages(messages);
        if (!options.force && fingerprint === lastMessagesFingerprintRef.current) {
          return;
        }
        lastMessagesFingerprintRef.current = fingerprint;
        setCurrentMessages(messages);
        setThreadItems((current) =>
          current.map((thread) => {
            if (thread.id !== conversationId) {
              return thread;
            }
            const lastMessage = messages[messages.length - 1] ?? null;
            return {
              ...thread,
              messages,
              preview: lastMessage?.body?.[0] ?? thread.preview,
              previewAt: lastMessage?.timestamp ?? thread.previewAt,
              ultimoMensajeEn: lastMessage?.timestamp ?? thread.ultimoMensajeEn,
              noLeidos: thread.noLeidos,
            };
          }),
        );
      } catch (error) {
        console.error("[inbox] refresh messages failed", error);
      } finally {
        messagesRefreshingRef.current = null;
      }
    },
    [pendingAttachments.length, uploadingAttachments, sending],
  );

  const handleAttachmentUpload = React.useCallback(
    async (files: FileList | null) => {
      if (!files || !selectedThread || !selectedThread.manualMode) {
        return;
      }
      setAttachmentError(null);
      setUploadingAttachments(true);
      try {
        const candidates = Array.from(files);
        for (const file of candidates) {
          const formData = new FormData();
          formData.append("file", file, file.name);
          formData.append("conversationId", selectedThread.id);

          const response = await fetch(`/api/inbox/uploads`, {
            method: "POST",
            body: formData,
            cache: "no-store",
          });

          const text = await response.text();
          let payload: Record<string, unknown> = {};
          try {
            payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch (error) {
            console.error("[inbox] attach upload parse fail", error);
            throw new Error("upload_failed");
          }

          if (!response.ok) {
            const message = typeof payload.error === "string" ? payload.error : "upload_failed";
            throw new Error(message);
          }

          const urlField = payload.url;
          const url = typeof urlField === "string" && urlField.length ? urlField : null;
          if (!url) {
            throw new Error("upload_missing_url");
          }

          const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const sizeValue = payload.size;
          let size: number | undefined = undefined;
          if (typeof sizeValue === "number") {
            size = Math.trunc(sizeValue);
          } else if (typeof sizeValue === "string") {
            const parsed = Number(sizeValue);
            if (!Number.isNaN(parsed)) {
              size = Math.trunc(parsed);
            }
          } else if (typeof file.size === "number") {
            size = file.size;
          }

          const newAttachment: PendingAttachment = {
            id,
            url,
            name: typeof payload.name === "string" && payload.name.length ? payload.name : file.name,
            mime: typeof payload.mime === "string" && payload.mime.length ? payload.mime : file.type,
            size,
            provider_id: typeof payload.provider_id === "string" ? payload.provider_id : undefined,
            path: typeof payload.path === "string" ? payload.path : undefined,
          };

          setPendingAttachments((current) => [...current, newAttachment]);
        }
      } catch (error) {
        console.error("[inbox] attachment upload failed", error);
        const message =
          error instanceof Error && error.message && !error.message.startsWith("upload_")
            ? error.message
            : "No se pudo cargar uno o más archivos. Inténtalo nuevamente.";
        setAttachmentError(message);
      } finally {
        setUploadingAttachments(false);
      }
    },
    [selectedThread],
  );

  const handleAttachmentRemove = React.useCallback((id: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentError((prev) => (prev ? null : prev));
  }, []);

  const selectedConversationId = selectedThread?.id ?? null;

  React.useEffect(() => {
    if (!selectedConversationId) {
      messagesRefreshingRef.current = null;
      setAutoScrollLocked(false);
      if (messagesPollingTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(messagesPollingTimeoutRef.current);
        messagesPollingTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled || typeof window === "undefined") {
        return;
      }
      messagesPollingTimeoutRef.current = window.setTimeout(() => {
        void refreshMessages(selectedConversationId, { force: false }).finally(() => {
          if (!cancelled) {
            scheduleNext();
          }
        });
      }, MESSAGES_REFRESH_INTERVAL_MS);
    };

    void refreshMessages(selectedConversationId, { force: true }).finally(() => {
      if (!cancelled) {
        scheduleNext();
      }
    });

    return () => {
      cancelled = true;
      if (messagesPollingTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(messagesPollingTimeoutRef.current);
        messagesPollingTimeoutRef.current = null;
      }
      if (messagesRefreshingRef.current === selectedConversationId) {
        messagesRefreshingRef.current = null;
      }
    };
  }, [selectedConversationId, refreshMessages]);

  const handleSendMessage = React.useCallback(
    async (content: string, outgoingAttachments: PendingAttachment[]) => {
      const targetThread = threadItems.find((thread) => thread.id === selectedId);
      if (!targetThread) {
        return false;
      }
      if (!targetThread.manualMode) {
        setSendError('Activa "Pausar asistente" para responder manualmente.');
        return false;
      }

      setSendError(null);
      setSending(true);
      try {
        const manualControls =
          targetThread.manualMode
            ? {
                manual_mode: true,
                manualMode: true,
                manual_override: true,
                manualOverride: true,
                sender_type: "human",
                senderType: "human",
                author_type: "human",
                authorType: "human",
                origin: "panel_manual",
                source: "panel_manual",
                ...(manualAgentMetadata ?? {}),
              }
            : null;

        const requestBody: Record<string, unknown> = {
          content,
          attachments: outgoingAttachments.map((attachment) => ({
            url: attachment.url,
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size,
            provider_id: attachment.provider_id ?? attachment.path ?? null,
            path: attachment.path ?? null,
          })),
        };

        if (manualControls) {
          requestBody.metadata = manualControls;
        }

        const response = await fetch(`/api/inbox/${targetThread.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const text = await response.text();
        const payload = parseReplyPayload(text);

        if (!response.ok) {
          const message = extractError(payload) ?? "No se pudo enviar el mensaje. Inténtalo de nuevo.";
          setSendError(message);
          return false;
        }

        const messages = extractMessages(payload);
        setPendingAttachments([]);
        setAttachmentError(null);
        if (messages.length) {
          setCurrentMessages(messages);
          lastMessagesFingerprintRef.current = fingerprintMessages(messages);
        }
        setThreadItems((current) =>
          current.map((thread) => {
            if (thread.id !== targetThread.id) {
              return thread;
            }
            const lastMessage = messages.length ? messages[messages.length - 1]! : null;
            const manualModeValue =
              typeof payload.metadata?.manual_mode === "boolean"
                ? payload.metadata.manual_mode
                : thread.manualMode;
            return {
              ...thread,
              messages: messages.length ? messages : thread.messages,
              preview: lastMessage?.body?.[0] ?? thread.preview,
              previewAt: lastMessage?.timestamp ?? thread.previewAt,
              ultimoMensajeEn: lastMessage?.timestamp ?? thread.ultimoMensajeEn,
              noLeidos: 0,
              manualMode: manualModeValue,
            };
          }),
        );
        setSendError(null);
        return true;
      } catch (error) {
        console.error("[inbox] send message failed", error);
        setSendError("Ocurrió un error inesperado al enviar el mensaje.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [selectedId, threadItems, manualAgentMetadata],
  );

  const handleToggleManualMode = React.useCallback(async () => {
    if (!selectedThread) {
      return false;
    }

    const targetId = selectedThread.id;
    const nextManualValue = !selectedThread.manualMode;

    setManualToggleError(null);
    setManualToggling(true);
    try {
      const response = await fetch(`/api/inbox/${targetId}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: nextManualValue }),
      });

      const text = await response.text();
      const payload = parseManualToggleResponse(text);

      if (!response.ok) {
        const message =
          extractManualToggleError(payload) ?? "No se pudo actualizar el modo manual. Inténtalo nuevamente.";
        setManualToggleError(message);
        return false;
      }

      const manual = typeof payload.manual === "boolean" ? payload.manual : nextManualValue;
      setThreadItems((current) =>
        current.map((thread) => {
          if (thread.id !== targetId) {
            return thread;
          }
          return {
            ...thread,
            manualMode: manual,
          };
        }),
      );
      setManualToggleError(null);
      return true;
    } catch (error) {
      console.error("[inbox] manual toggle failed", error);
      setManualToggleError("Ocurrió un error inesperado al actualizar el modo manual.");
      return false;
    } finally {
      setManualToggling(false);
    }
  }, [selectedThread]);

  return (
    <div className="flex gap-4">
      <aside className="flex h-[calc(100vh-13rem)] min-h-[320px] w-[320px] flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length ? (
            <ul className="divide-y">
              {filteredThreads.map((thread) => {
                const isActive = thread.id === selectedId;
                const displayTime = thread.previewAt || thread.ultimoMensajeEn || thread.iniciadoEn || null;
                const unread = thread.noLeidos > 0;
                const formattedTime = formatShortTimeLabel(displayTime, isHydrated);
                const restartSequence = Math.max(1, thread.restartSequence ?? 1);
                const isRestart = restartSequence > 1;
                const channelBadgeClass = getChannelBadgeClass(thread.canal);
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(thread.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition ${isActive ? "bg-primary/10" : "hover:bg-muted"}`}
                    >
                      <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{thread.contactoNombre}</span>
                  {isRestart ? (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">
                      {`Reinicio #${restartSequence}`}
                    </Badge>
                  ) : null}
                  {thread.reengageAttempts > 0 ? (
                    <Badge variant="destructive" className="text-[10px] uppercase tracking-tight">
                      {`${thread.reengageAttempts} reenganche${thread.reengageAttempts === 1 ? "" : "s"}`}
                    </Badge>
                  ) : null}
                  {unread ? <IconCircleFilled className="size-2 fill-primary" /> : null}
                </div>
                        <span className="text-xs text-muted-foreground">{formattedTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className={`uppercase ${channelBadgeClass}`}>
                          {thread.canal}
                        </Badge>
                        {thread.asignadoNombre ? <span>Asignado a {thread.asignadoNombre}</span> : null}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {thread.preview?.length ? thread.preview : "Sin vista previa disponible"}
                      </p>
                      {thread.tags.length ? (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {thread.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] uppercase">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex h-full items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
              No hay conversaciones que coincidan con la búsqueda.
            </div>
          )}
        </div>
      </aside>

      <section className="flex h-[calc(100vh-13rem)] min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {selectedThread ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{selectedThread.contactoNombre}</h3>
                {selectedThread.restartSequence > 1 ? (
                  <Badge variant="secondary" className="text-[11px] uppercase">
                    {`Conversación reiniciada (ciclo #${selectedThread.restartSequence})`}
                  </Badge>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className={`uppercase ${getChannelBadgeClass(selectedThread.canal)}`}
                  >
                    {selectedThread.canal}
                  </Badge>
                  {selectedThread.contactoCorreo ? <span>{selectedThread.contactoCorreo}</span> : null}
                  {selectedThread.contactoTelefono ? <span>{selectedThread.contactoTelefono}</span> : null}
                  {selectedThread.asignadoNombre ? (
                    <span className="font-medium text-foreground">Asignado a {selectedThread.asignadoNombre}</span>
                  ) : null}
                </div>
                {selectedThread.tags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedThread.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={selectedThread.manualMode ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={handleToggleManualMode}
                  disabled={manualToggling}
                  aria-pressed={selectedThread.manualMode}
                >
                  {selectedThread.manualMode ? (
                    <>
                      <IconRobot className="size-4" />
                      {manualToggling ? "Reactivando…" : "Volver al asistente"}
                    </>
                  ) : (
                    <>
                      <IconRobotOff className="size-4" />
                      {manualToggling ? "Pausando…" : "Pausar asistente"}
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <IconFilter className="size-4" /> Actualizar estado
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                  <IconDots className="size-4" />
                  <span className="sr-only">Acciones rápidas</span>
                </Button>
              </div>
            </header>

            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
              {manualToggleError ? (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {manualToggleError}
                </div>
              ) : null}
              {selectedThread.manualMode ? (
                <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                  Modo manual activado: el asistente no enviará respuestas automáticas.
                </div>
              ) : null}
              <div className="flex flex-col gap-4">
              {currentMessages.length ? (
                currentMessages.map((message) => {
                  const isAgent = message.role === "usuario";
                  const isHumanAgent = isHumanAgentMessage(message);
                  const metadata =
                    message.datos && typeof message.datos === "object"
                      ? (message.datos as Record<string, unknown>)
                      : null;
                  const humanAuthor = isHumanAgent
                    ? resolveHumanAuthorName(metadata, message.author)
                    : null;
                  const displayAuthor =
                    isAgent && !isHumanAgent ? "Tal-IA" : isHumanAgent ? humanAuthor ?? message.author : message.author;
                  const timestampLabel = formatFullTimeLabel(message.timestamp, isHydrated);
                  return (
                    <div key={message.id} className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${isAgent ? "justify-end" : ""}`}
                      >
                        {isAgent && isHumanAgent ? (
                          <Badge
                            variant="secondary"
                            className="border-amber-500/60 bg-amber-500/15 text-amber-700 shadow-sm"
                          >
                            Humano: {humanAuthor ?? message.author}
                          </Badge>
                        ) : (
                          <span className="font-medium text-foreground">{displayAuthor}</span>
                        )}
                        <span>{timestampLabel || "—"}</span>
                      </div>
                      <div
                        className={`max-w-xl whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${isAgent ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        {message.body.map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                      {message.attachments.length ? (
                        <div className="mt-2 flex w-full max-w-xl flex-col gap-1 text-xs">
                          {message.attachments.map((attachment) => (
                            <a
                              key={attachment.id ?? attachment.url}
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-md border border-muted bg-background/80 px-3 py-2 text-muted-foreground hover:text-foreground"
                            >
                              <span className="truncate">{attachment.name ?? attachment.url}</span>
                              {attachment.size ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                </span>
                              ) : null}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no hay mensajes en esta conversación.</p>
                )}
              </div>
            </div>

            <InboxComposer
              placeholder={
                selectedThread.manualMode
                  ? `Responder a ${selectedThread.contactoNombre || "este contacto"}`
                  : 'Activa "Pausar asistente" para responder manualmente'
              }
              pending={sending}
              uploadingAttachments={uploadingAttachments}
              attachments={pendingAttachments}
              attachmentError={attachmentError}
              error={sendError}
              onSend={handleSendMessage}
              onAttachmentAdd={handleAttachmentUpload}
              onAttachmentRemove={handleAttachmentRemove}
              disabled={!selectedThread.manualMode}
              disabledMessage='Activa "Pausar asistente" para escribir manualmente.'
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <h3 className="text-lg font-semibold">Selecciona una conversación</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              El detalle de la conversación se mostrará aquí. Puedes filtrar por etiquetas, asignados o prioridad para encontrarla rápidamente.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function mergeThreadLists(current: InboxThread[], incoming: InboxThread[]): InboxThread[] {
  if (!incoming.length) {
    return current;
  }
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const merged: InboxThread[] = incoming.map((thread) => {
    const existing = currentMap.get(thread.id);
    if (!existing) {
      return thread;
    }
    const messages = thread.messages.length ? thread.messages : existing.messages;
    const lastMessage = messages.length ? messages[messages.length - 1]! : null;
    return {
      ...thread,
      messages,
      preview: thread.preview ?? lastMessage?.body?.[0] ?? existing.preview,
      previewAt: thread.previewAt ?? lastMessage?.timestamp ?? existing.previewAt,
      ultimoMensajeEn: thread.ultimoMensajeEn ?? lastMessage?.timestamp ?? existing.ultimoMensajeEn,
    };
  });

  for (const thread of current) {
    if (!incoming.find((candidate) => candidate.id === thread.id)) {
      merged.push(thread);
    }
  }
  return merged;
}
