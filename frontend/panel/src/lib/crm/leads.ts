"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMLead = {
  id: string;
  campana_id: string | null;
  persona_id?: string | null;
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

type LeadRestartCycleDetail = {
  oportunidad_id: string | null;
  restart_sequence: number;
  monto_estimado: number | null;
  etapa_id: string | null;
  estado: string | null;
  asignado_a_usuario_id: string | null;
  actualizado_en: string | null;
  creado_en: string | null;
};

type CRMLeadRestartStat = {
  persona_id?: string | null;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  total_ciclos: number;
  ciclo_actual: number;
  monto_total: number | null;
  monto_ciclo_actual: number | null;
  monto_ciclos_previos: number | null;
  oportunidad_id: string | null;
  etapa_id: string | null;
  etapa_nombre: string | null;
  estado: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  actualizado_en: string;
  primer_ciclo_en: string | null;
  ultimo_reinicio_en: string | null;
  ciclos_detalle: LeadRestartCycleDetail[] | null;
  reengage_attempts: number;
};

export type CrmLeadsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export type LeadRestartStatsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

type LoadLeadRestartStatsOptions = {
  minRestartSequence?: number;
};

export async function loadCrmLeads(): Promise<CrmLeadsPayload> {
  const response = await callCrmApi<CRMLeadsResponse | CRMLead[]>("/crm/leads", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data) {
    const errorMessage = !response.ok
      ? response.error
      : "No se pudieron cargar los leads.";
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const items = Array.isArray(response.data) ? response.data : response.data.items;
  if (!Array.isArray(items)) {
    return { rows: [], total: 0, errors: ["Respuesta inválida del CRM"] };
  }

  const rows = items.map<DataTableRow>((lead, index) => ({
    id: index + 1,
    header: resolveLeadHeader(lead),
    type: lead.estado,
    status: lead.origen || "Desconocido",
    target: lead.persona_id || lead.contacto_id || "Sin contacto",
    limit: lead.campana_id || "Sin campaña",
    reviewer: lead.cuenta_id || "Cuenta pendiente",
    raw: lead,
  }));

  return {
    rows,
    total: items.length,
    errors: [],
  };
}

export async function loadLeadRestartStats(
  options: LoadLeadRestartStatsOptions = {},
): Promise<LeadRestartStatsPayload> {
  const minRestartSequence = Math.max(1, options.minRestartSequence ?? 1);

  const response = await callCrmApi<CRMLeadRestartStat[]>("/crm/leads/restarts", {
    searchParams: {
      min_restart_sequence: String(minRestartSequence),
      limit: "200",
    },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.map<DataTableRow>((stat, index) => ({
    id: index + 1,
    header: formatContactName(stat),
    type: formatSellerName(stat),
    status: formatRestartStatus(stat),
    target: formatCurrency(stat.monto_total),
    limit: formatStageLabel(stat),
    reviewer: formatUpdatedAt(stat.actualizado_en),
    raw: stat,
  }));

  return {
    rows,
    total: response.data.length,
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

function formatContactName(stat: CRMLeadRestartStat): string {
  if (stat.contacto_nombre && stat.contacto_nombre.trim().length) {
    return stat.contacto_nombre.trim();
  }
  const personaId = stat.persona_id?.trim();
  return `Contacto ${(personaId || stat.contacto_id).slice(0, 8)}`;
}

function formatSellerName(stat: CRMLeadRestartStat): string {
  if (stat.vendedor_nombre && stat.vendedor_nombre.trim().length) {
    return stat.vendedor_nombre.trim();
  }
  return "Sin vendedor asignado";
}

function formatRestartStatus(stat: CRMLeadRestartStat): string {
  const attempts = Number(stat.reengage_attempts) || 0;
  if (attempts <= 0) {
    return "Sin reenganches";
  }
  return `${attempts} reenganche${attempts === 1 ? "" : "s"}`;
}

function formatStageLabel(stat: CRMLeadRestartStat): string {
  if (stat.etapa_nombre && stat.etapa_nombre.trim().length) {
    return stat.etapa_nombre.trim();
  }
  if (stat.estado && stat.estado.trim().length) {
    return stat.estado.trim();
  }
  return "Etapa sin nombre";
}

function formatUpdatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return Number(value).toLocaleString("es-MX");
  }
}
