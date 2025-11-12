"use client";

import * as React from "react";
import {
  IconCircleFilled,
  IconDots,
  IconFilter,
  IconRobot,
  IconRobotOff,
  IconSearch,
} from "@tabler/icons-react";

import type { InboxThread, InboxMessage } from "@/lib/inbox/data";
import type { InboxAttachment } from "@/lib/inbox/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InboxComposer } from "@/components/inbox/composer";

const THREADS_REFRESH_INTERVAL_MS = 1600;
const MESSAGES_REFRESH_INTERVAL_MS = 1500;

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
type InboxSplitViewProps = {
  threads: InboxThread[];
};

export function InboxSplitView({ threads }: InboxSplitViewProps) {
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

  React.useEffect(() => {
    setThreadItems(threads);
  }, [threads]);

  React.useEffect(() => {
    if (!selectedId && threadItems.length) {
      setSelectedId(threadItems[0]!.id);
    }
  }, [selectedId, threadItems]);

  const filteredThreads = React.useMemo(() => {
    if (!searchTerm) return threadItems;
    const term = searchTerm.toLowerCase();
    return threadItems.filter((thread) => {
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
  }, [threadItems, searchTerm]);

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
      if (!files || !selectedThread) {
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

      setSendError(null);
      setSending(true);
      try {
        const response = await fetch(`/api/inbox/${targetThread.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            attachments: outgoingAttachments.map((attachment) => ({
              url: attachment.url,
              name: attachment.name,
              mime: attachment.mime,
              size: attachment.size,
              provider_id: attachment.provider_id ?? attachment.path ?? null,
              path: attachment.path ?? null,
            })),
          }),
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
    [selectedId, threadItems],
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
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <IconSearch className="size-4" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar chats"
              className="h-8 flex-1 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
              aria-label="Buscar chats"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Conversaciones</h3>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
            <IconDots className="size-4" />
            <span className="sr-only">Acciones de bandeja</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length ? (
            <ul className="divide-y">
              {filteredThreads.map((thread) => {
                const isActive = thread.id === selectedId;
                const displayTime = thread.previewAt || thread.ultimoMensajeEn || thread.iniciadoEn || null;
                const unread = thread.noLeidos > 0;
                const formattedTime = formatShortTimeLabel(displayTime, isHydrated);
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
                          {unread ? <IconCircleFilled className="size-2 fill-primary" /> : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{formattedTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="uppercase">{thread.canal}</Badge>
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="uppercase">{selectedThread.canal}</Badge>
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
                  const timestampLabel = formatFullTimeLabel(message.timestamp, isHydrated);
                  return (
                    <div key={message.id} className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${isAgent ? "justify-end" : ""}`}
                      >
                        {isAgent ? (
                          <Badge
                            variant="secondary"
                            className="border-amber-500/60 bg-amber-500/15 text-amber-700 shadow-sm"
                          >
                            Humano: {message.author}
                          </Badge>
                        ) : (
                          <span className="font-medium text-foreground">{message.author}</span>
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
              placeholder={`Responder a ${selectedThread.contactoNombre}`}
              pending={sending}
              uploadingAttachments={uploadingAttachments}
              attachments={pendingAttachments}
              attachmentError={attachmentError}
              error={sendError}
              onSend={handleSendMessage}
              onAttachmentAdd={handleAttachmentUpload}
              onAttachmentRemove={handleAttachmentRemove}
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
