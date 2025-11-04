"use client";

import * as React from "react";
import { IconMoodSmile, IconPaperclip, IconSend } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

type InboxComposerProps = {
  placeholder?: string;
  pending?: boolean;
  error?: string | null;
  onSend?: (content: string) => Promise<boolean | void> | boolean | void;
};

export function InboxComposer({ placeholder, pending, error, onSend }: InboxComposerProps) {
  const [message, setMessage] = React.useState("");
  const [localPending, setLocalPending] = React.useState(false);

  const busy = pending || localPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSend) return;
    const content = message.trim();
    if (!content.length) return;

    setLocalPending(true);
    try {
      const result = await onSend(content);
      if (result !== false) {
        setMessage("");
      }
    } finally {
      setLocalPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background/80 px-5 py-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground">
            <IconMoodSmile className="size-5" />
            <span className="sr-only">Insertar emoji</span>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground">
            <IconPaperclip className="size-5" />
            <span className="sr-only">Adjuntar archivo</span>
          </Button>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder ?? "Escribe tu respuesta"}
            className="min-h-[48px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={busy}
            autoComplete="off"
            rows={2}
          />
          <Button type="submit" size="icon" className="size-9" disabled={busy || message.trim().length === 0}>
            <IconSend className="size-5" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Presiona Enter para enviar · Shift + Enter para salto de línea</span>
          {busy ? <span>Enviando…</span> : null}
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </form>
  );
}
