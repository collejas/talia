"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunityContact = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
};

type CRMOpportunity = {
  id: string;
  cuenta_id: string | null;
  contacto_principal_id: string | null;
  contacto?: CRMOpportunityContact | null;
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

type LoadCrmOpportunitiesOptions = {
  contactId?: string;
};

export async function loadCrmOpportunities(
  options: LoadCrmOpportunitiesOptions = {},
): Promise<CrmOpportunitiesPayload> {
  const searchParams: Record<string, string> = { limit: "100", offset: "0" };
  if (options.contactId && options.contactId.trim().length) {
    searchParams.contacto_id = options.contactId.trim();
  }

  const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
    searchParams,
  });

  if (!response.ok) {
    return { rows: [], total: 0, errors: [response.error] };
  }

  const rows = response.data.items.map<DataTableRow>((op, index) => {
    const contactLabel = buildContactLabel(op);
    const restartSequence = extractRestartSequence(op.metadata);
    const stageLabel = formatEtapa(op);
    const statusLabel =
      restartSequence > 1 ? `${stageLabel} · Reinicio #${restartSequence}` : stageLabel;

    return {
      id: index + 1,
      header: op.titulo || contactLabel || "Oportunidad sin nombre",
      type: contactLabel || op.estado || "Contacto sin nombre",
      status: statusLabel,
      target: formatCurrency(op.monto_estimado, op.moneda),
      limit: op.fecha_cierre_probable || "Sin fecha",
      reviewer: op.asignado_a_usuario_id || "Sin asignar",
      raw: { ...op, restartSequence },
    };
  });

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

function buildContactLabel(op: CRMOpportunity): string {
  const contactName = op.contacto?.nombre_completo || op.metadata?.contacto_nombre;
  if (typeof contactName === "string" && contactName.trim().length) {
    return contactName.trim();
  }
  if (op.contacto_principal_id) {
    return `Contacto ${op.contacto_principal_id.slice(0, 8)}`;
  }
  return "Contacto sin nombre";
}

function extractRestartSequence(metadata: Record<string, unknown> | null | undefined): number {
  if (metadata && typeof metadata.restart_sequence !== "undefined") {
    const value = Number(metadata.restart_sequence);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
  }
  return 1;
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
