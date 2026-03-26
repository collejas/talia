"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type AssignmentRow = {
  id: string;
  creado_en: string;
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

type AssignmentsResponse = {
  items: AssignmentRow[];
  limit: number;
  offset: number;
};

export type SalesAssignmentsPayload = {
  rows: DataTableRow[];
  errors: string[];
};

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
    type: item.trigger_event,
    status: item.contacto_nombre || "Contacto",
    target: item.oportunidad_titulo || item.oportunidad_id || "Oportunidad",
    limit: item.conversacion_canal || "—",
    reviewer: item.creado_en,
    raw: item,
  }));

  return { rows, errors: [] };
}
