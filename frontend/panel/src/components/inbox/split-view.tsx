"use client";

import * as React from "react";
import {
  IconCircleFilled,
  IconDots,
  IconFilter,
  IconSearch,
} from "@tabler/icons-react";

import type { InboxFolder, InboxThread, InboxMessage } from "@/lib/inbox/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InboxComposer } from "@/components/inbox/composer";

type ReplyMetadata = {
  manual_mode?: boolean;
  [key: string]: unknown;
};

type InboxReplyPayload = {
  ok?: boolean;
  reply?: string | null;
  metadata?: ReplyMetadata;
  messages?: unknown;
  error?: string;
  detail?: string;
  message?: string;
};

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
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      reply:
        typeof record.reply === "string" || record.reply === null
          ? (record.reply as string | null)
          : undefined,
      metadata,
      messages: record.messages,
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
type InboxSplitViewProps = {
  folders: InboxFolder[];
  threads: InboxThread[];
};

export function InboxSplitView({ folders, threads }: InboxSplitViewProps) {
  const [threadItems, setThreadItems] = React.useState<InboxThread[]>(threads);
  const [selectedId, setSelectedId] = React.useState<string | null>(threads[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);

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

  const handleSendMessage = React.useCallback(
    async (content: string) => {
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
          body: JSON.stringify({ content }),
        });

        const text = await response.text();
        const payload = parseReplyPayload(text);

        if (!response.ok) {
          const message = extractError(payload) ?? "No se pudo enviar el mensaje. Inténtalo de nuevo.";
          setSendError(message);
          return false;
        }

        const messages = extractMessages(payload);
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
                const formattedTime = (() => {
                  if (!displayTime) return "—";
                  const parsed = new Date(displayTime);
                  if (Number.isNaN(parsed.getTime())) return "—";
                  return parsed.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                })();
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
                <Button variant="outline" size="sm" className="gap-2">
                  <IconFilter className="size-4" /> Actualizar estado
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                  <IconDots className="size-4" />
                  <span className="sr-only">Acciones rápidas</span>
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {selectedThread.manualMode ? (
                <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                  Modo manual activado: el asistente no enviará respuestas automáticas.
                </div>
              ) : null}
              <div className="flex flex-col gap-4">
                {selectedThread.messages.length ? (
                  selectedThread.messages.map((message) => {
                    const isAgent = message.role === "usuario";
                    return (
                      <div key={message.id} className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{message.author}</span>
                          <span>{new Date(message.timestamp).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                        </div>
                        <div
                          className={`max-w-xl whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${isAgent ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          {message.body.map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                          ))}
                        </div>
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
              error={sendError}
              onSend={handleSendMessage}
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
