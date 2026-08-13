"use client";

import * as React from "react";
import {
  IconDownload,
  IconExternalLink,
  IconFile,
  IconPaperclip,
  IconPhoto,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  deleteNoteAttachment,
  uploadNoteAttachment,
  type NoteAttachment,
} from "@/lib/crm/note-attachments";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx";

function isImage(attachment: NoteAttachment): boolean {
  return attachment.content_type.startsWith("image/");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NoteAttachments({
  noteId,
  allowUpload = true,
  compact = false,
}: {
  noteId: string;
  allowUpload?: boolean;
  compact?: boolean;
}) {
  const [attachments, setAttachments] = React.useState<NoteAttachment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<NoteAttachment | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/notas/${encodeURIComponent(noteId)}/adjuntos`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar los archivos.");
      setAttachments(Array.isArray(body.data) ? body.data : []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los archivos.");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  React.useEffect(() => { void load(); }, [load]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: el límite es de 25 MB.`);
        await uploadNoteAttachment(noteId, file);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (attachment: NoteAttachment) => {
    if (!window.confirm(`¿Eliminar ${attachment.nombre_original}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteNoteAttachment(noteId, attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      if (preview?.id === attachment.id) setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "mt-3 space-y-2 rounded-lg border bg-muted/10 p-3"}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <IconPaperclip className="size-3.5" /> Evidencias ({attachments.length})
        </p>
        {allowUpload ? (
          <>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleFiles} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} className="h-7 gap-1.5 text-xs">
              <IconUpload className="size-3.5" /> {busy ? "Procesando…" : "Agregar"}
            </Button>
          </>
        ) : null}
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Cargando archivos…</p> : null}
      {!loading && !attachments.length ? <p className="text-xs text-muted-foreground">Sin evidencias adjuntas.</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="group relative overflow-hidden rounded-md border bg-background">
            {isImage(attachment) && attachment.url ? (
              <button type="button" className="block aspect-square w-full" onClick={() => setPreview(attachment)} aria-label={`Abrir ${attachment.nombre_original}`}>
                {/* Signed Supabase URLs are tenant-specific and are not part of next/image remotePatterns. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.nombre_original} className="size-full object-cover transition group-hover:scale-105" />
              </button>
            ) : (
              <a href={attachment.url ?? "#"} target="_blank" rel="noreferrer" className="flex min-h-20 items-center gap-2 p-2 text-xs hover:bg-muted">
                <IconFile className="size-6 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{attachment.nombre_original}</span>
                <IconExternalLink className="size-3.5 shrink-0" />
              </a>
            )}
            <div className="flex items-center justify-between gap-1 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1 truncate"><IconPhoto className="size-3 shrink-0" /> {formatSize(attachment.tamano_bytes)}</span>
              <div className="flex shrink-0 gap-1">
                {isImage(attachment) && attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${attachment.nombre_original}`}><IconExternalLink className="size-3.5" /></a> : <a href={attachment.url ?? "#"} download={attachment.nombre_original} aria-label={`Descargar ${attachment.nombre_original}`}><IconDownload className="size-3.5" /></a>}
                {allowUpload ? <button type="button" onClick={() => void handleDelete(attachment)} disabled={busy} aria-label={`Eliminar ${attachment.nombre_original}`}><IconTrash className="size-3.5 text-destructive" /></button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-5xl p-3">
          <DialogTitle className="sr-only">{preview?.nombre_original ?? "Vista previa"}</DialogTitle>
          {preview?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.nombre_original} className="max-h-[80vh] w-full object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
