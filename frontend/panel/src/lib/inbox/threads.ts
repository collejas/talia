import { mapMessagesFromRaw } from "@/lib/inbox/transform";
import type { InboxThread, InboxThreadRow } from "@/lib/inbox/types";

export function mapThreads(payload?: InboxThreadRow[] | null): InboxThread[] {
  if (!payload || !payload.length) return [];
  return payload.map((row) => {
    const contactoNombre = row.contacto_nombre?.trim() || "";
    const contactoProfileName = row.contacto_profile_name?.trim() || "";
    const messages = mapMessagesFromRaw(row.messages);
    const personaId = row.persona_id?.trim() || row.contacto_id?.trim() || row.conversacion_id;
    const contactoId = row.contacto_id?.trim() || undefined;
    return {
      id: row.conversacion_id,
      personaId,
      contactoId,
      contactoNombre: contactoNombre || contactoProfileName || "Contacto sin nombre",
      contactoProfileName: contactoProfileName || null,
      contactoCorreo: row.contacto_correo,
      contactoTelefono: row.contacto_telefono,
      contactoCountryCode: row.contacto_country_code ?? null,
      contactoCountryName: row.contacto_country_name ?? null,
      contactoStateName: row.contacto_state_name ?? null,
      contactoCityName: row.contacto_city_name ?? null,
      contactoLada: row.contacto_lada ?? null,
      canal: row.canal ?? "webchat",
      source: row.source ?? null,
      sourceDetail:
        row.source_detail && typeof row.source_detail === "object" && !Array.isArray(row.source_detail)
          ? row.source_detail
          : null,
      batchId: row.batch_id ?? null,
      batchLabel: row.batch_label ?? null,
      campanaId: row.campana_id ?? null,
      campanaLabel: row.campana_label ?? null,
      templateId: row.template_id ?? null,
      templateSlug: row.template_slug ?? null,
      templateLabel: row.template_label ?? null,
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
      opportunityId: row.oportunidad_id ?? null,
      parentOpportunityId: row.parent_opportunity_id ?? null,
      restartSequence: row.restart_sequence ?? 1,
      conversationHistory: row.conversation_history?.filter((id): id is string => Boolean(id && id.length)) ??
        (row.conversacion_id ? [row.conversacion_id] : []),
      reengageAttempts: row.reengage_attempts ? Math.max(0, row.reengage_attempts) : 0,
    };
  });
}
