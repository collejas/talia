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
  disabled?: boolean;
  disabledMessage?: string;
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
  disabled,
  disabledMessage,
}: InboxComposerProps) {
  const [message, setMessage] = React.useState("");
  const [localPending, setLocalPending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const locked = Boolean(disabled);
  const busy = pending || localPending || uploadingAttachments;
  const interactionDisabled = locked || busy;
  const hasText = message.trim().length > 0;
  const hasAttachments = Boolean(attachments && attachments.length > 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
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
    if (interactionDisabled) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (locked) {
      event.target.value = "";
      return;
    }
    if (!onAttachmentAdd) return;
    const { files } = event.target;
    await onAttachmentAdd(files);
    // reset input to allow re-selecting same file
    event.target.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background/80 px-2.5 py-2"
    >
      <div className="flex flex-col gap-1.5">
        {attachments && attachments.length ? (
          <div className="flex flex-wrap gap-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1 rounded-md border border-muted px-2 py-0.5 text-[10px]"
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
                  disabled={interactionDisabled}
                >
                  <IconX className="size-3" />
                  <span className="sr-only">Eliminar adjunto</span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          disabled={interactionDisabled}
        >
          <IconMoodSmile className="size-4" />
          <span className="sr-only">Insertar emoji</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={handleFileTrigger}
          disabled={interactionDisabled}
        >
            <IconPaperclip className="size-4" />
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
              if (interactionDisabled) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder ?? "Escribe tu respuesta"}
            className="min-h-[34px] flex-1 resize-none rounded border border-input bg-background px-2 py-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={interactionDisabled}
            autoComplete="off"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            className="size-7"
            disabled={interactionDisabled || (!hasText && !hasAttachments)}
          >
            <IconSend className="size-4" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </div>
        <div className="flex justify-between text-[9px] leading-tight text-muted-foreground">
          <span>Presiona Enter para enviar · Shift + Enter para salto de línea</span>
          {busy ? <span>Procesando…</span> : null}
        </div>
        {locked && disabledMessage ? (
          <div className="rounded border border-muted/60 bg-muted px-2 py-1 text-[10px] text-muted-foreground">
            {disabledMessage}
          </div>
        ) : null}
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
