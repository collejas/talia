"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type WhatsAppAssignment = {
  id: string;
  creado_en: string;
  organizacion_id: string;
  organizacion_nombre: string | null;
  conversacion_id: string | null;
  conversacion_canal: string | null;
  oportunidad_id: string | null;
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
  metadata: Record<string, unknown> | null;
};

type WhatsAppAssignmentsResponse = {
  items: WhatsAppAssignment[];
  limit: number;
  offset: number;
};

export type CrmWhatsAppAssignmentsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmWhatsAppAssignments(): Promise<CrmWhatsAppAssignmentsPayload> {
  const response = await callCrmApi<WhatsAppAssignmentsResponse>("/crm/whatsapp/asignaciones", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((assignment, index) => ({
    id: index + 1,
    header: buildContactLabel(assignment),
    type: assignment.trigger_event || "sin_trigger",
    status: assignment.conversacion_canal || "whatsapp",
    target: assignment.vendedor_nombre || assignment.vendedor_usuario_id || "Sin vendedor",
    limit: formatTimestamp(assignment.creado_en),
    reviewer:
      assignment.oportunidad_titulo ||
      (assignment.oportunidad_id ? `Opp ${assignment.oportunidad_id.slice(0, 8)}` : "Sin oportunidad"),
    raw: assignment,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function buildContactLabel(assignment: WhatsAppAssignment): string {
  const parts = [
    assignment.contacto_nombre?.trim(),
    assignment.contacto_empresa?.trim(),
    assignment.contacto_correo?.trim(),
    assignment.contacto_telefono?.trim(),
  ].filter((value): value is string => Boolean(value && value.length > 0));
  if (parts.length > 0) {
    return parts[0]!;
  }
  if (assignment.conversacion_id) {
    return `Conv ${assignment.conversacion_id.slice(0, 8)}`;
  }
  return "Contacto WhatsApp";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
