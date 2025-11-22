"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunity = {
  id: string;
  cuenta_id: string | null;
  contacto_principal_id: string | null;
  etapa_id: string;
  titulo: string;
  descripcion: string | null;
  monto_estimado: number | null;
  moneda: string;
  probabilidad: number | null;
  fecha_cierre_probable: string | null;
  estado: string;
  motivo_perdida: string | null;
  propietario_usuario_id: string | null;
  asignado_a_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
};

type CRMOpportunitiesResponse = {
  items: CRMOpportunity[];
  limit: number;
  offset: number;
};

export type CrmOpportunitiesPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmOpportunities(): Promise<CrmOpportunitiesPayload> {
  const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok) {
    return { rows: [], total: 0, errors: [response.error] };
  }

  const rows = response.data.items.map<DataTableRow>((op, index) => ({
    id: index + 1,
    header: op.titulo || "Oportunidad sin nombre",
    type: op.estado,
    status: formatEtapa(op),
    target: formatCurrency(op.monto_estimado, op.moneda),
    limit: op.fecha_cierre_probable || "Sin fecha",
    reviewer: op.asignado_a_usuario_id || "Sin asignar",
    raw: op,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function formatEtapa(op: CRMOpportunity): string {
  const metadata = op.metadata;
  if (metadata && typeof metadata === "object") {
    const stageName = metadata.etapa_nombre;
    if (typeof stageName === "string" && stageName.trim().length) {
      return stageName;
    }
  }
  return `Etapa ${op.etapa_id.slice(0, 8)}`;
}

function formatCurrency(value: number | null, currency: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("es-MX");
  }
}
