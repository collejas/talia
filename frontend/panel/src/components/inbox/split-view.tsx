"use client";

import * as React from "react";
import {
  IconCircleFilled,
  IconDots,
  IconFilter,
  IconSearch,
} from "@tabler/icons-react";

import type { InboxFolder, InboxThread } from "@/lib/inbox/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InboxComposer } from "@/components/inbox/composer";

type InboxSplitViewProps = {
  folders: InboxFolder[];
  threads: InboxThread[];
};

export function InboxSplitView({ folders, threads }: InboxSplitViewProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(threads[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = React.useState("");

  React.useEffect(() => {
    if (!selectedId && threads.length) {
      setSelectedId(threads[0]!.id);
    }
  }, [selectedId, threads]);

  const filteredThreads = React.useMemo(() => {
    if (!searchTerm) return threads;
    const term = searchTerm.toLowerCase();
    return threads.filter((thread) => {
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
  }, [threads, searchTerm]);

  const selectedThread = selectedId
    ? filteredThreads.find((thread) => thread.id === selectedId) ?? filteredThreads[0] ?? null
    : filteredThreads[0] ?? null;

  return (
    <div className="flex gap-4">
      <aside className="flex h-[calc(100vh-13rem)] min-h-[320px] w-[320px] flex-col overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3 space-y-3">
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
          {folders.length ? (
            <div className="flex flex-wrap gap-2">
              {folders.map((folder) => (
                <Badge key={folder.id} variant="outline" className="cursor-pointer text-xs uppercase">
                  {folder.label}
                  <span className="ml-1 text-[11px] text-primary">{folder.count}</span>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Conversaciones</h3>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
            <IconDots className="size-4" />
            <span className="sr-only">Acciones de bandeja</span>
          </Button>
        </div>

        <div className="border-b px-2 py-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="cursor-pointer">Sin leer</Badge>
            <Badge variant="outline" className="cursor-pointer">Seguimiento</Badge>
            <Badge variant="outline" className="cursor-pointer">Alta prioridad</Badge>
            <Badge variant="outline" className="cursor-pointer">Webchat</Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length ? (
            <ul className="divide-y">
              {filteredThreads.map((thread) => {
                const isActive = thread.id === selectedId;
                const displayTime = thread.previewAt || thread.ultimoMensajeEn || thread.iniciadoEn || "Sin actividad";
                const unread = thread.noLeidos > 0;
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
                        <span className="text-xs text-muted-foreground">{new Date(displayTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
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

            <InboxComposer conversationId={selectedThread.id} placeholder={`Responder a ${selectedThread.contactoNombre}`} />
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
