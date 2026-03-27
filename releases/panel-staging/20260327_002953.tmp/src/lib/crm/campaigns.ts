"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMCampaign = {
  id: string;
  nombre: string;
  tipo: string | null;
  canal: string | null;
  presupuesto: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMCampaignsResponse = {
  items: CRMCampaign[];
  limit: number;
  offset: number;
};

export type CrmCampaignsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmCampaigns(): Promise<CrmCampaignsPayload> {
  const response = await callCrmApi<CRMCampaignsResponse>("/crm/campanas", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((campaign, index) => ({
    id: index + 1,
    header: campaign.nombre || "Campaña sin nombre",
    type: campaign.tipo || "General",
    status: campaign.canal || "Sin canal",
    target: formatCurrency(campaign.presupuesto),
    limit: formatRange(campaign.fecha_inicio, campaign.fecha_fin),
    reviewer: campaign.metadata?.owner?.toString() || "Sin responsable",
    raw: campaign,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function formatCurrency(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("es-MX");
  }
}

function formatRange(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 10)} → ${end.slice(0, 10)}`;
  if (start) return `${start.slice(0, 10)} → …`;
  if (end) return `… → ${end.slice(0, 10)}`;
  return "Sin fechas";
}
