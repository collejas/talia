"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMLead = {
  id: string;
  campana_id: string | null;
  contacto_id: string | null;
  cuenta_id: string | null;
  origen: string | null;
  estado: string;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMLeadsResponse = {
  items: CRMLead[];
  limit: number;
  offset: number;
};

export type CrmLeadsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmLeads(): Promise<CrmLeadsPayload> {
  const response = await callCrmApi<CRMLeadsResponse>("/crm/leads", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((lead, index) => ({
    id: index + 1,
    header: resolveLeadHeader(lead),
    type: lead.estado,
    status: lead.origen || "Desconocido",
    target: lead.contacto_id || "Sin contacto",
    limit: lead.campana_id || "Sin campaña",
    reviewer: lead.cuenta_id || "Cuenta pendiente",
    raw: lead,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function resolveLeadHeader(lead: CRMLead): string {
  const metadata = lead.metadata;
  const nombre =
    metadata && typeof metadata === "object" && typeof metadata.nombre === "string"
      ? metadata.nombre
      : null;
  if (nombre && nombre.trim().length) return nombre.trim();
  return `Lead ${lead.id.slice(0, 8)}`;
}
