"use server";

import { callSupabaseRpc } from "@/lib/inbox/supabase";
import { mapMessagesFromRaw } from "@/lib/inbox/transform";
import type { InboxSummary, InboxThread, InboxPayload } from "@/lib/inbox/types";

type InboxResumenResponse = {
  total?: number;
  unread?: number;
  awaiting?: number;
  open?: number;
  closed?: number;
  assigned?: number;
  folders?: Array<{
    id?: string;
    count?: number;
  }>;
};

type InboxThreadRow = {
  conversacion_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  canal: string | null;
  estado: string | null;
  prioridad: number | null;
  iniciada_en: string | null;
  ultimo_mensaje_en: string | null;
  no_leidos: number | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  tags: string[] | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  messages: unknown;
  total_rows: number;
};

export type { InboxFolder, InboxSummary, InboxThread, InboxPayload, InboxMessage } from "@/lib/inbox/types";
export type { InboxMessageRow } from "@/lib/inbox/types";

const FOLDER_LABELS: Record<string, string> = {
  inbox: "Bandeja de entrada",
  assigned: "Asignados a mí",
  pending: "Seguimiento",
  closed: "Cerrados",
};

export async function loadInboxData(): Promise<InboxPayload> {
  const [resumen, threads] = await Promise.all([
    callSupabaseRpc<InboxResumenResponse>("panel_inbox_resumen"),
    callSupabaseRpc<InboxThreadRow[]>("panel_inbox_threads", {
      body: { p_limit: 25, p_message_limit: 20 },
    }),
  ]);

  const errors: string[] = [];
  if (!resumen.ok) errors.push(resumen.error);
  if (!threads.ok) errors.push(threads.error);

  const summary = mapSummary(resumen.ok ? resumen.data : undefined);
  const mappedThreads = mapThreads(threads.ok ? threads.data : undefined);
  const totalThreads =
    threads.ok && Array.isArray(threads.data) && threads.data.length
      ? threads.data[0].total_rows ?? threads.data.length
      : 0;

  return {
    summary,
    threads: mappedThreads,
    totalThreads,
    errors: Array.from(new Set(errors)),
  };
}

function mapSummary(payload?: InboxResumenResponse): InboxSummary {
  const folders = (payload?.folders ?? []).flatMap((folder) => {
    if (!folder?.id) return [];
    return [
      {
        id: folder.id,
        label: FOLDER_LABELS[folder.id] ?? folder.id,
        count: folder.count ?? 0,
      },
    ];
  });

  return {
    total: payload?.total ?? 0,
    unread: payload?.unread ?? 0,
    awaiting: payload?.awaiting ?? 0,
    folders,
  };
}

function mapThreads(payload?: InboxThreadRow[] | null): InboxThread[] {
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
      preview: row.last_message_preview ?? "",
      previewAt: row.last_message_at,
      messages,
    };
  });
}
