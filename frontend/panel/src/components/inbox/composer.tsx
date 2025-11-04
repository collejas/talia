"use client";

import * as React from "react";
import { IconMoodSmile, IconPaperclip, IconSend, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import type { InboxAttachment } from "@/lib/inbox/types";

type ComposerAttachment = InboxAttachment & { id: string };

type InboxComposerProps = {
  placeholder?: string;
  pending?: boolean;
  uploadingAttachments?: boolean;
  attachments?: ComposerAttachment[];
  error?: string | null;
  attachmentError?: string | null;
  onSend?: (content: string, attachments: ComposerAttachment[]) => Promise<boolean | void> | boolean | void;
  onAttachmentAdd?: (files: FileList | null) => Promise<void> | void;
  onAttachmentRemove?: (id: string) => void;
};

export function InboxComposer({
  placeholder,
  pending,
  uploadingAttachments,
  attachments,
  error,
  attachmentError,
  onSend,
  onAttachmentAdd,
  onAttachmentRemove,
}: InboxComposerProps) {
  const [message, setMessage] = React.useState("");
  const [localPending, setLocalPending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const busy = pending || localPending || uploadingAttachments;
  const hasText = message.trim().length > 0;
  const hasAttachments = Boolean(attachments && attachments.length > 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSend) return;
    if (!hasText && !hasAttachments) return;

    setLocalPending(true);
    try {
      const result = await onSend(message.trim(), attachments ?? []);
      if (result !== false) {
        setMessage("");
      }
    } finally {
      setLocalPending(false);
    }
  }

  function handleFileTrigger() {
    if (busy) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!onAttachmentAdd) return;
    const { files } = event.target;
    await onAttachmentAdd(files);
    // reset input to allow re-selecting same file
    event.target.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background/80 px-5 py-4"
    >
      <div className="flex flex-col gap-3">
        {attachments && attachments.length ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-full border border-muted px-3 py-1 text-xs"
              >
                <span className="max-w-[160px] truncate">{attachment.name ?? attachment.url}</span>
                {attachment.size ? (
                  <span className="text-muted-foreground">
                    {(attachment.size / 1024).toFixed(1)} KB
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground"
                  onClick={() => onAttachmentRemove?.(attachment.id)}
                  disabled={busy}
                >
                  <IconX className="size-3" />
                  <span className="sr-only">Eliminar adjunto</span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground" disabled={busy}>
            <IconMoodSmile className="size-5" />
            <span className="sr-only">Insertar emoji</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground"
            onClick={handleFileTrigger}
            disabled={busy}
          >
            <IconPaperclip className="size-5" />
            <span className="sr-only">Adjuntar archivo</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileChange}
          />
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
          <Button
            type="submit"
            size="icon"
            className="size-9"
            disabled={busy || (!hasText && !hasAttachments)}
          >
            <IconSend className="size-5" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Presiona Enter para enviar · Shift + Enter para salto de línea</span>
          {busy ? <span>Procesando…</span> : null}
        </div>
        {attachmentError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {attachmentError}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </form>
  );
}
