"use client";

import * as React from "react";
import { IconMoodSmile, IconPaperclip, IconSend } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

type InboxComposerProps = {
  conversationId: string;
  placeholder?: string;
};

export function InboxComposer({ conversationId, placeholder }: InboxComposerProps) {
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (!content.length) return;
    setSending(true);
    try {
      // Aquí se integraría el envío real al backend / Supabase.
      // Por ahora solo simulamos el envío.
      console.debug("[inbox] enviar mensaje", {
        conversationId,
        content,
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      setMessage("");
    } finally {
      setSending(false);
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
            disabled={sending}
            autoComplete="off"
            rows={2}
          />
          <Button type="submit" size="icon" className="size-9" disabled={sending || message.trim().length === 0}>
            <IconSend className="size-5" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Presiona Enter para enviar · Shift + Enter para salto de línea</span>
          {sending ? <span>Enviando…</span> : null}
        </div>
      </div>
    </form>
  );
}
