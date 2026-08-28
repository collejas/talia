"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type AssignmentRow = {
  id: string;
  creado_en: string;
  conversacion_id: string | null;
  conversacion_canal: string | null;
  oportunidad_id: string | null;
  codigo_oportunidad: string | null;
  oportunidad_titulo: string | null;
  contacto_id: string | null;
  contacto_nombre: string | null;
  contacto_empresa: string | null;
  contacto_telefono: string | null;
  contacto_correo: string | null;
  vendedor_usuario_id: string;
  vendedor_nombre: string | null;
  vendedor_correo: string | null;
  vendedor_telefono: string | null;
  trigger_event: string;
  asignacion_canal: string | null;
  notificacion_message_sid: string | null;
  aceptado_en: string | null;
  aceptado_por_usuario_id: string | null;
  aceptado_por_nombre: string | null;
  aceptado_por_correo: string | null;
  aceptado_via: string | null;
  metadata: Record<string, unknown> | null;
};

type AssignmentsResponse = {
  items: AssignmentRow[];
  limit: number;
  offset: number;
};

export type SalesAssignmentsPayload = {
  rows: DataTableRow[];
  errors: string[];
};

function formatAssignmentEvent(triggerEvent: string): string {
  const labels: Record<string, string> = {
    auto_assign: "Asignación automática",
    manual_reassign: "Reasignación manual",
    notify_followup_escalate: "Escalamiento de seguimiento",
    notify_close_lead: "Cierre de oportunidad",
    notify_booking_confirmed: "Cita confirmada",
    notify_booking_canceled: "Cita cancelada",
    notify_information_email: "Información enviada por correo",
    notify_webchat_session_closed: "Cierre de chat web",
    restart_conversation: "Reinicio de conversación",
  };

  const normalized = triggerEvent.trim().toLowerCase();
  if (labels[normalized]) return labels[normalized];

  return normalized
    .replace(/^notify_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Evento de asignación";
}

export async function loadSalesAssignments(): Promise<SalesAssignmentsPayload> {
  const response = await callCrmApi<AssignmentsResponse>("/crm/asignaciones_vendedores", {
    searchParams: { limit: "200", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((item, index) => ({
    id: index + 1,
    header: item.vendedor_nombre || item.vendedor_correo || "Vendedor",
    type: formatAssignmentEvent(item.trigger_event),
    status: item.aceptado_en ? "Aceptada" : "Pendiente",
    target:
      item.codigo_oportunidad?.trim()
        ? `${item.codigo_oportunidad.trim().replace(/\s*-\s*/g, " - ")} · ${item.oportunidad_titulo || "Oportunidad"}`
        : item.oportunidad_titulo || "Sin oportunidad",
    limit: item.asignacion_canal || item.conversacion_canal || "—",
    reviewer: item.aceptado_en
      ? `Aceptada${item.aceptado_por_nombre ? ` por ${item.aceptado_por_nombre}` : ""} · ${item.aceptado_en}`
      : "Pendiente de aceptar",
    raw: item,
  }));

  return { rows, errors: [] };
}
