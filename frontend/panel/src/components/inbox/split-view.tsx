"use client";

import * as React from "react";
import {
  IconChevronRight,
  IconCircleFilled,
  IconDots,
  IconSend,
} from "@tabler/icons-react";

import type { InboxFolder, InboxThread } from "@/app/inbox/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type InboxSplitViewProps = {
  folders: InboxFolder[];
  threads: InboxThread[];
};

export function InboxSplitView({ folders, threads }: InboxSplitViewProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    threads[0]?.id ?? null,
  );

  React.useEffect(() => {
    if (!selectedId && threads.length) {
      setSelectedId(threads[0]!.id);
    }
  }, [selectedId, threads]);

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
      <div className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">
              Carpetas
            </h3>
            <p className="text-xs text-muted-foreground">
              Organiza conversaciones por prioridad
            </p>
          </div>
          <IconChevronRight className="size-4 text-muted-foreground" />
        </div>
        <div className="border-b px-2 py-2">
          <div className="flex flex-col gap-1">
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
              >
                <span>{folder.label}</span>
                <Badge variant="secondary">{folder.count}</Badge>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">
            Conversaciones
          </h3>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
            <IconDots className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length ? (
            <div className="divide-y">
              {threads.map((thread) => {
                const isActive = thread.id === selectedId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedId(thread.id)}
                    className={[
                      "flex w-full flex-col gap-1 px-4 py-3 text-left transition",
                      isActive ? "bg-primary/10" : "hover:bg-muted",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{thread.sender}</span>
                        {thread.unread ? (
                          <IconCircleFilled className="size-2 fill-primary" />
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{thread.time}</span>
                    </div>
                    <p className="line-clamp-1 text-sm font-medium text-foreground">
                      {thread.subject}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {thread.preview}
                    </p>
                    {thread.tags?.length ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {thread.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
              No hay conversaciones en esta carpeta.
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border bg-card">
        {selectedThread ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{selectedThread.subject}</h3>
                  {selectedThread.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedThread.sender}
                  {selectedThread.senderTitle ? ` · ${selectedThread.senderTitle}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  Programar seguimiento
                </Button>
                <Button size="sm">
                  <IconSend className="mr-2 size-4" />
                  Responder
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-6">
                {selectedThread.messages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-lg border bg-background/40 p-4 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {message.author}
                        {message.role === "usuario" ? " · Tal-IA" : ""}
                      </span>
                      <Separator orientation="vertical" className="hidden h-4 lg:block" />
                      <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-relaxed">
                      {message.body.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <h3 className="text-lg font-semibold">Selecciona una conversación</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              El detalle de la conversación se mostrará aquí. Puedes filtrar por etiquetas, asignados o prioridad para encontrarla rápidamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
