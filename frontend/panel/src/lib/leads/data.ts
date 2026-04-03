"use server";

import { callCrmApi } from "@/lib/api/crm";

export type LeadCards = {
  total: number;
  abiertas: number;
  ganadas: number;
  perdidas: number;
  nuevas: number;
  montoTotal: number;
  topVendedor?: {
    id?: string;
    nombre?: string;
    total?: number;
  };
};

export type LeadChartPoint = {
  date: string;
  nuevos: number;
  ganados: number;
  perdidos: number;
};

export type LeadTableRow = {
  id: number;
  header: string;
  type: string;
  status: string;
  target: string;
  limit: string;
  reviewer: string;
  raw?: Record<string, unknown>;
};

export type LeadsPayload = {
  cards: LeadCards;
  chart: LeadChartPoint[];
  table: LeadTableRow[];
  totalRows: number;
  restartTable: LeadTableRow[];
  restartKpis: RestartKpis;
  errors: string[];
};

type PipelineOverviewResponse = {
  cards: LeadCards;
  chart: LeadChartPoint[];
  table: LeadTableRow[];
  total_rows: number;
};

type CRMLeadRestartStat = {
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

export type RestartKpis = {
  reconversionRate: number;
  avgDaysBetweenCycles: number;
  avgAmountPerCycle: number;
};

const DEFAULT_LIMIT = 200;
const DEFAULT_RESTART_MIN_SEQUENCE = 1;
const DEFAULT_RESTART_LIMIT = 200;
const EMPTY_CARDS: LeadCards = {
  total: 0,
  abiertas: 0,
  ganadas: 0,
  perdidas: 0,
  nuevas: 0,
  montoTotal: 0,
};

export async function loadLeadsData(options: { days?: number } = {}): Promise<LeadsPayload> {
  const days = Math.max(7, Math.min(90, options.days ?? 30));
  const [overviewResp, restartResp] = await Promise.all([
    callCrmApi<PipelineOverviewResponse>("/crm/pipeline/overview", {
      searchParams: {
        limit: String(DEFAULT_LIMIT),
        days: String(days),
      },
    }),
    callCrmApi<CRMLeadRestartStat[]>("/crm/leads/restarts", {
      searchParams: {
        min_restart_sequence: String(DEFAULT_RESTART_MIN_SEQUENCE),
        limit: String(DEFAULT_RESTART_LIMIT),
      },
    }),
  ]);

  const errors: string[] = [];

  let cards = EMPTY_CARDS;
  let chart: LeadChartPoint[] = [];
  let table: LeadTableRow[] = [];
  let totalRows = 0;
  let restartKpis: RestartKpis = {
    reconversionRate: 0,
    avgDaysBetweenCycles: 0,
    avgAmountPerCycle: 0,
  };

  if (!overviewResp.ok) {
    errors.push(overviewResp.error);
  } else {
    cards = normalizeCards(overviewResp.data.cards);
    chart = Array.isArray(overviewResp.data.chart) ? overviewResp.data.chart : [];
    table = Array.isArray(overviewResp.data.table) ? overviewResp.data.table : [];
    totalRows = Number.isFinite(overviewResp.data.total_rows)
      ? overviewResp.data.total_rows
      : table.length;
  }

  let restartTable: LeadTableRow[] = [];
  if (!restartResp.ok) {
    errors.push(restartResp.error);
  } else if (!Array.isArray(restartResp.data)) {
    errors.push("Respuesta inválida del CRM (reinicios).");
  } else {
    restartTable = buildRestartTable(restartResp.data);
    restartKpis = calculateRestartKpis(restartResp.data);
  }

  return {
    cards,
    chart,
    table,
    totalRows,
    restartTable,
    restartKpis,
    errors,
  };
}

export async function loadRestartKpis(
  options: { minRestartSequence?: number; limit?: number } = {},
): Promise<{ kpis: RestartKpis; errors: string[] }> {
  const minRestartSequence = Math.max(1, options.minRestartSequence ?? DEFAULT_RESTART_MIN_SEQUENCE);
  const limit = Math.max(1, options.limit ?? DEFAULT_RESTART_LIMIT);

  const response = await callCrmApi<CRMLeadRestartStat[]>("/crm/leads/restarts", {
    searchParams: {
      min_restart_sequence: String(minRestartSequence),
      limit: String(limit),
    },
  });

  if (!response.ok) {
    return { kpis: { reconversionRate: 0, avgDaysBetweenCycles: 0, avgAmountPerCycle: 0 }, errors: [response.error] };
  }

  if (!Array.isArray(response.data)) {
    return { kpis: { reconversionRate: 0, avgDaysBetweenCycles: 0, avgAmountPerCycle: 0 }, errors: ["Respuesta inválida del CRM (reinicios)."] };
  }

  return {
    kpis: calculateRestartKpis(response.data),
    errors: [],
  };
}

function normalizeCards(payload?: Partial<LeadCards> & { monto_total?: number; top_vendedor?: LeadCards["topVendedor"] }): LeadCards {
  if (!payload) return EMPTY_CARDS;
  return {
    total: payload.total ?? 0,
    abiertas: payload.abiertas ?? 0,
    ganadas: payload.ganadas ?? 0,
    perdidas: payload.perdidas ?? 0,
    nuevas: payload.nuevas ?? 0,
    montoTotal: payload.montoTotal ?? payload.monto_total ?? 0,
    topVendedor: payload.topVendedor ?? payload.top_vendedor,
  };
}

function buildRestartTable(stats: CRMLeadRestartStat[]): LeadTableRow[] {
  return stats.map<LeadTableRow>((stat, index) => ({
    id: index + 1,
    header: formatContactName(stat),
    type: formatStageLabel(stat),
    status: "restart",
    target: formatCurrency(stat.monto_total),
    limit: formatUpdatedAt(stat.actualizado_en),
    reviewer: formatSellerName(stat),
    raw: {
      ...stat,
      status_meta: {
        label: formatRestartStatus(stat),
        variant: "default",
      },
    },
  }));
}

function formatContactName(stat: CRMLeadRestartStat): string {
  if (stat.contacto_nombre && stat.contacto_nombre.trim().length) {
    return stat.contacto_nombre.trim();
  }
  return `Contacto ${stat.contacto_id.slice(0, 8)}`;
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

function calculateRestartKpis(stats: CRMLeadRestartStat[]): RestartKpis {
  if (!stats.length) {
    return {
      reconversionRate: 0,
      avgDaysBetweenCycles: 0,
      avgAmountPerCycle: 0,
    };
  }

  let totalCycles = 0;
  let successfulCycles = 0;
  let totalDaysBetween = 0;
  let intervalSamples = 0;
  let totalAmount = 0;

  for (const stat of stats) {
    const cycles = Array.isArray(stat.ciclos_detalle) ? stat.ciclos_detalle : [];
    totalCycles += cycles.length || stat.total_ciclos || 0;
    totalAmount += Number(stat.monto_total ?? 0);

    for (const cycle of cycles) {
      const estado = (cycle.estado ?? "").toLowerCase();
      if (
        estado.includes("ganado") ||
        estado.includes("ganada") ||
        estado.includes("demo") ||
        estado.includes("agend")
      ) {
        successfulCycles += 1;
      }
    }

    const sortedCycles = cycles
      .map((cycle) => new Date(cycle.creado_en ?? cycle.actualizado_en ?? "").getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    for (let i = 1; i < sortedCycles.length; i += 1) {
      const diffDays = Math.max(0, (sortedCycles[i] - sortedCycles[i - 1]) / (1000 * 60 * 60 * 24));
      totalDaysBetween += diffDays;
      intervalSamples += 1;
    }
  }

  return {
    reconversionRate: totalCycles > 0 ? (successfulCycles / totalCycles) * 100 : 0,
    avgDaysBetweenCycles: intervalSamples > 0 ? totalDaysBetween / intervalSamples : 0,
    avgAmountPerCycle: totalCycles > 0 ? totalAmount / totalCycles : 0,
  };
}
