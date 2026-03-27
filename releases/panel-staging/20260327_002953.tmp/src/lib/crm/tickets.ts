"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMTicket = {
  id: string;
  cuenta_id: string | null;
  contacto_id: string | null;
  asunto: string;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  canal_origen: string | null;
  asignado_a_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
};

type CRMTicketsResponse = {
  items: CRMTicket[];
  limit: number;
  offset: number;
};

export type CrmTicketsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmTickets(): Promise<CrmTicketsPayload> {
  const response = await callCrmApi<CRMTicketsResponse>("/crm/tickets", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok) {
    return { rows: [], total: 0, errors: [response.error] };
  }

  const rows = response.data.items.map<DataTableRow>((ticket, index) => ({
    id: index + 1,
    header: ticket.asunto || "Ticket sin asunto",
    type: ticket.estado,
    status: ticket.prioridad,
    target: ticket.canal_origen || "Sin canal",
    limit: ticket.contacto_id || "Sin contacto",
    reviewer: ticket.asignado_a_usuario_id || "Sin asignar",
    raw: ticket,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}
