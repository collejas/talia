"use server";

import { callCrmApi } from "@/lib/api/crm";
import type { CrmResult } from "@/lib/api/crm";

export type LeadCards = {
  total: number;
  abiertas: number;
  ganadas: number;
  perdidas: number;
  nuevas: number;
  montoTotal: number;
  ticketPromedioGanado: number;
  diasPromedioCierre: number;
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
  valorGanado: number;
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

export type LeadSellerPoint = {
  id: string;
  nombre: string;
  ganados: number;
  valorGanado: number;
};

export type LeadsPayload = {
  cards: LeadCards;
  chart: LeadChartPoint[];
  salesBySeller: LeadSellerPoint[];
  table: LeadTableRow[];
  totalRows: number;
  restartTable: LeadTableRow[];
  restartKpis: RestartKpis;
  errors: string[];
};

type CRMOpportunityContact = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  company_name?: string | null;
};

type CRMOpportunityStage = {
  id: string;
  nombre: string | null;
  codigo: string | null;
  categoria: string | null;
  orden: number | null;
  metadata?: Record<string, unknown> | null;
};

type CRMOpportunityUser = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
};

type CRMOpportunityAccount = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
};

type CRMOpportunity = {
  id: string;
  codigo_oportunidad: string | null;
  cuenta_id: string | null;
  contacto_principal_id: string | null;
  contacto?: CRMOpportunityContact | null;
  cuenta?: CRMOpportunityAccount | null;
  etapa?: CRMOpportunityStage | null;
  etapa_id: string;
  titulo: string | null;
  descripcion: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad: number | null;
  fecha_cierre_probable: string | null;
  estado: string | null;
  motivo_perdida: string | null;
  propietario_usuario_id: string | null;
  asignado_a_usuario_id: string | null;
  asignado?: CRMOpportunityUser | null;
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
  ticketPromedioGanado: 0,
  diasPromedioCierre: 0,
};

export async function loadLeadsData(
  options: { days?: number; rango?: string; desde?: string; hasta?: string; includeRestarts?: boolean } = {},
): Promise<LeadsPayload> {
  const days = Math.max(7, Math.min(90, options.days ?? 30));
  const includeRestarts = options.includeRestarts ?? true;
  const [opportunitiesResp, restartResp] = await Promise.all([
    fetchAllOpportunities({
      days,
      desde: options.desde,
      hasta: options.hasta,
    }),
    includeRestarts
      ? callCrmApi<CRMLeadRestartStat[]>("/crm/leads/restarts", {
          searchParams: {
            min_restart_sequence: String(DEFAULT_RESTART_MIN_SEQUENCE),
            limit: String(DEFAULT_RESTART_LIMIT),
          },
        })
      : Promise.resolve({ ok: true, data: [] as CRMLeadRestartStat[] } as CrmResult<CRMLeadRestartStat[]>),
  ]);

  const errors: string[] = [];

  let cards = EMPTY_CARDS;
  let chart: LeadChartPoint[] = [];
  let table: LeadTableRow[] = [];
  let salesBySeller: LeadSellerPoint[] = [];
  let totalRows = 0;
  let restartKpis: RestartKpis = {
    reconversionRate: 0,
    avgDaysBetweenCycles: 0,
    avgAmountPerCycle: 0,
  };

  if (!opportunitiesResp.ok) {
    errors.push(opportunitiesResp.error);
  } else {
    const rows = opportunitiesResp.data.items ?? [];
    cards = buildLeadCards(rows, days);
    chart = buildLeadChart(rows, options.desde, options.hasta, days);
    table = buildLeadTable(rows);
    salesBySeller = buildSalesBySeller(rows);
    totalRows = rows.length;
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
    salesBySeller,
    totalRows,
    restartTable,
    restartKpis,
    errors,
  };
}

async function fetchAllOpportunities(options: {
  days: number;
  desde?: string;
  hasta?: string;
}): Promise<CrmResult<CRMOpportunitiesResponse>> {
  const createdRange = resolveCreatedRange(options);
  const pageSize = 200;
  let offset = 0;
  const items: CRMOpportunity[] = [];

  while (true) {
    const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
      withUserToken: true,
      searchParams: {
        limit: String(pageSize),
        offset: String(offset),
        creado_desde: createdRange.creadoDesde,
        creado_hasta: createdRange.creadoHasta,
      },
    });

    if (!response.ok) {
      return response;
    }

    const pageItems = Array.isArray(response.data.items) ? response.data.items : [];
    items.push(...pageItems);
    if (pageItems.length < pageSize) {
      return {
        ok: true,
        data: {
          items,
          limit: pageSize,
          offset: 0,
        },
      };
    }
    offset += pageItems.length;
  }
}

function resolveCreatedRange(options: {
  days: number;
  desde?: string;
  hasta?: string;
}): { creadoDesde: string; creadoHasta: string } {
  if (options.desde && options.hasta) {
    return {
      creadoDesde: options.desde,
      creadoHasta: options.hasta,
    };
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today.getTime());
  start.setUTCDate(start.getUTCDate() - (options.days - 1));
  return {
    creadoDesde: start.toISOString().slice(0, 10),
    creadoHasta: today.toISOString().slice(0, 10),
  };
}

function buildLeadCards(rows: CRMOpportunity[], days: number): LeadCards {
  const now = Date.now();
  const newThreshold = now - Math.max(1, days) * 24 * 60 * 60 * 1000;
  let abiertas = 0;
  let ganadas = 0;
  let perdidas = 0;
  let nuevas = 0;
  let montoTotal = 0;
  let ticketPromedioGanado = 0;
  let diasPromedioCierre = 0;
  const wonAmounts: number[] = [];
  const closeDurations: number[] = [];
  const sellerCounts = new Map<string, { nombre: string; total: number }>();

  for (const row of rows) {
    const categoria = normalizeOpportunityCategory(row);
    if (categoria === "ganada") {
      ganadas += 1;
      const amount = Number(row.monto_estimado ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        montoTotal += amount;
        wonAmounts.push(amount);
      }
      const createdAt = Date.parse(row.creado_en);
      const closedAt = Date.parse(row.cerrado_en ?? row.actualizado_en);
      if (Number.isFinite(createdAt) && Number.isFinite(closedAt) && closedAt >= createdAt) {
        closeDurations.push((closedAt - createdAt) / (24 * 60 * 60 * 1000));
      }
    } else if (categoria === "perdida") {
      perdidas += 1;
    } else {
      abiertas += 1;
    }

    const createdAt = Date.parse(row.creado_en);
    if (Number.isFinite(createdAt) && createdAt >= newThreshold) {
      nuevas += 1;
    }

    const sellerId = row.asignado?.id ?? row.asignado_a_usuario_id;
    const sellerName = row.asignado?.nombre_completo?.trim() || row.asignado?.correo?.trim() || "Sin asignar";
    if (sellerId) {
      const current = sellerCounts.get(sellerId) ?? { nombre: sellerName, total: 0 };
      current.total += 1;
      if (!current.nombre && sellerName) current.nombre = sellerName;
      sellerCounts.set(sellerId, current);
    }
  }

  if (wonAmounts.length) {
    ticketPromedioGanado = Math.round(wonAmounts.reduce((a, b) => a + b, 0) / wonAmounts.length);
  }
  if (closeDurations.length) {
    diasPromedioCierre = Math.round(closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length);
  }

  let topVendedor: LeadCards["topVendedor"] | undefined;
  for (const [id, seller] of sellerCounts.entries()) {
    if (!topVendedor || seller.total > (topVendedor.total ?? 0)) {
      topVendedor = { id, nombre: seller.nombre, total: seller.total };
    }
  }

  return {
    total: rows.length,
    abiertas,
    ganadas,
    perdidas,
    nuevas,
    montoTotal,
    ticketPromedioGanado,
    diasPromedioCierre,
    topVendedor,
  };
}

function buildLeadChart(
  rows: CRMOpportunity[],
  desde: string | undefined,
  hasta: string | undefined,
  days: number,
): LeadChartPoint[] {
  const range = resolveCreatedRange({ days, desde, hasta });
  const start = new Date(`${range.creadoDesde}T00:00:00.000Z`);
  const end = new Date(`${range.creadoHasta}T00:00:00.000Z`);
  const buckets = new Map<string, LeadChartPoint>();

  for (let cursor = new Date(start.getTime()); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    buckets.set(date, { date, nuevos: 0, ganados: 0, perdidos: 0, valorGanado: 0 });
  }

  for (const row of rows) {
    const createdDate = normalizeDateKey(row.creado_en);
    const createdBucket = createdDate ? buckets.get(createdDate) : undefined;
    if (createdBucket) createdBucket.nuevos += 1;

    const closedDate = normalizeDateKey(row.cerrado_en ?? row.actualizado_en);
    const closedBucket = closedDate ? buckets.get(closedDate) : undefined;
    if (!closedBucket) continue;

    const categoria = normalizeOpportunityCategory(row);
    if (categoria === "ganada") {
      closedBucket.ganados += 1;
      const amount = Number(row.monto_estimado ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        closedBucket.valorGanado += amount;
      }
    } else if (categoria === "perdida") {
      closedBucket.perdidos += 1;
    }
  }

  return Array.from(buckets.values());
}


function buildSalesBySeller(rows: CRMOpportunity[]): LeadSellerPoint[] {
  const sellers = new Map<string, LeadSellerPoint>();

  for (const row of rows) {
    if (normalizeOpportunityCategory(row) !== "ganada") continue;

    const id = row.asignado?.id ?? row.asignado_a_usuario_id ?? "sin-asignar";
    const nombre = row.asignado?.nombre_completo?.trim() || row.asignado?.correo?.trim() || "Sin asignar";
    const amount = Number(row.monto_estimado ?? 0);
    const current = sellers.get(id) ?? { id, nombre, ganados: 0, valorGanado: 0 };
    current.ganados += 1;
    if (Number.isFinite(amount) && amount > 0) {
      current.valorGanado += amount;
    }
    sellers.set(id, current);
  }

  return Array.from(sellers.values())
    .sort((a, b) => (b.valorGanado - a.valorGanado) || (b.ganados - a.ganados) || a.nombre.localeCompare(b.nombre))
    .slice(0, 6);
}

function buildLeadTable(rows: CRMOpportunity[]): LeadTableRow[] {
  const sortedRows = [...rows].sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en));
  return sortedRows.slice(0, DEFAULT_LIMIT).map((row, index) => ({
    id: index + 1,
    header: row.titulo?.trim() || buildOpportunityContactLabel(row),
    type: row.etapa?.nombre?.trim() || "Sin etapa",
    status: normalizeOpportunityCategory(row),
    target: formatMoney(row.monto_estimado, row.moneda || "MXN"),
    limit: row.contacto?.correo || "—",
    reviewer: row.asignado?.nombre_completo?.trim() || "Sin asignar",
    raw: row as unknown as Record<string, unknown>,
  }));
}

function normalizeOpportunityCategory(row: CRMOpportunity): string {
  return (row.etapa?.categoria || row.estado || "abierta").trim().toLowerCase();
}

function normalizeDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildOpportunityContactLabel(row: CRMOpportunity): string {
  const name = row.contacto?.nombre_completo?.trim();
  if (name) return name;
  const company = row.cuenta?.nombre?.trim() || row.contacto?.company_name?.trim();
  if (company) return company;
  if (row.contacto_principal_id) return `Contacto ${row.contacto_principal_id.slice(0, 8)}`;
  return "Oportunidad sin nombre";
}

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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
      persona_id: stat.persona_id ?? stat.contacto_id,
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
