import { mapMessagesFromRaw } from "@/lib/inbox/transform";
import type { InboxThread, InboxThreadRow } from "@/lib/inbox/types";

export function mapThreads(payload?: InboxThreadRow[] | null): InboxThread[] {
  if (!payload || !payload.length) return [];
  return payload.map((row) => {
    const messages = mapMessagesFromRaw(row.messages);
    return {
      id: row.conversacion_id,
      contactoId: row.contacto_id,
      contactoNombre: row.contacto_nombre?.trim() || "Contacto sin nombre",
      contactoCorreo: row.contacto_correo,
      contactoTelefono: row.contacto_telefono,
      canal: row.canal ?? "webchat",
      estado: row.estado ?? "abierta",
      prioridad: row.prioridad ?? 0,
      iniciadoEn: row.iniciada_en,
      ultimoMensajeEn: row.ultimo_mensaje_en,
      noLeidos: row.no_leidos ?? 0,
      asignadoId: row.asignado_id,
      asignadoNombre: row.asignado_nombre,
      tags: row.tags?.filter(Boolean) ?? [],
      manualMode: Boolean(row.manual_override),
      preview: row.last_message_preview ?? "",
      previewAt: row.last_message_at,
      messages,
    };
  });
}
