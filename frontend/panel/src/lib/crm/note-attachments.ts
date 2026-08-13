export type NoteAttachment = {
  id: string;
  nota_id: string;
  nombre_original: string;
  content_type: string;
  tamano_bytes: number;
  subido_en: string;
  url: string | null;
};

export async function uploadNoteAttachment(noteId: string, file: File): Promise<NoteAttachment> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await fetch(`/api/crm/notas/${encodeURIComponent(noteId)}/adjuntos`, {
    method: "POST",
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No se pudo subir el archivo.");
  return body.data as NoteAttachment;
}

export async function deleteNoteAttachment(noteId: string, attachmentId: string): Promise<void> {
  const response = await fetch(
    `/api/crm/notas/${encodeURIComponent(noteId)}/adjuntos/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "No se pudo eliminar el archivo.");
  }
}
