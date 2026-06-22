"use server";

import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunityStage = {
  id: string;
  nombre: string | null;
  categoria?: string | null;
};

type CRMOpportunity = {
  id: string;
  codigo_oportunidad: string | null;
  etapa?: CRMOpportunityStage | null;
  etapa_id: string;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad?: number | null;
  estado?: string | null;
  asignado_a_usuario_id?: string | null;
  fecha_cierre_probable?: string | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMOpportunitiesResponse = {
  items: CRMOpportunity[];
  limit: number;
  offset: number;
};

export type OpportunityStageSummary = {
  label: string;
  count: number;
};

export type OpportunityKpis = {
  total: number;
  activeTotal: number;
  montoTotal: number;
  weightedAmount: number;
  monedas: string[];
  stale: number;
  unassigned: number;
  unassignedPct: number;
  avgAgeDays: number;
  topStage: OpportunityStageSummary | null;
  topStaleStage: OpportunityStageSummary | null;
  upcomingCloseCount: number;
};

type LoadOpportunityKpisOptions = {
  limit?: number;
  staleDays?: number;
  creadoDesde?: string | null;
  creadoHasta?: string | null;
};

const DEFAULT_LIMIT = 200;
const DEFAULT_STALE_DAYS = 14;

export async function fetchOpportunityKpis(
  options: LoadOpportunityKpisOptions = {},
): Promise<OpportunityKpis> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 200));
  const staleDays = Math.max(1, options.staleDays ?? DEFAULT_STALE_DAYS);
  const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
    withUserToken: true,
    searchParams: {
      limit: String(limit),
      offset: "0",
      creado_desde: options.creadoDesde ?? undefined,
      creado_hasta: options.creadoHasta ?? undefined,
    },
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return summarizeOpportunities(response.data.items ?? [], staleDays);
}

function summarizeOpportunities(rows: CRMOpportunity[], staleDays: number): OpportunityKpis {
  const now = Date.now();
  const stageCounts = new Map<string, number>();
  const staleStageCounts = new Map<string, number>();
  let total = 0;
  let activeTotal = 0;
  let montoTotal = 0;
  let weightedAmount = 0;
  let stale = 0;
  let unassigned = 0;
  let ageSum = 0;
  let upcomingCloseCount = 0;
  const currencies = new Set<string>();

  for (const row of rows) {
    total += 1;
    const category = normalizeOpportunityCategory(row);
    const isActive = category !== "ganada" && category !== "perdida";
    if (isActive) activeTotal += 1;

    const amount = Number(row.monto_estimado ?? 0);
    if (Number.isFinite(amount)) {
      montoTotal += amount;
      const probability = Number(row.probabilidad ?? 0);
      if (Number.isFinite(probability) && probability > 0) {
        weightedAmount += amount * (probability / 100);
      }
    }
    if (row.moneda) currencies.add(row.moneda);

    const stageLabel = row.etapa?.nombre?.trim()
      ? row.etapa.nombre.trim()
      : "Etapa";
    if (isActive) {
      stageCounts.set(stageLabel, (stageCounts.get(stageLabel) ?? 0) + 1);
    }

    const updated = Date.parse(row.actualizado_en);
    if (Number.isFinite(updated)) {
      const days = Math.floor((now - updated) / (24 * 60 * 60 * 1000));
      if (isActive && days >= staleDays) {
        stale += 1;
        staleStageCounts.set(stageLabel, (staleStageCounts.get(stageLabel) ?? 0) + 1);
      }
    }

    const created = Date.parse(row.creado_en);
    if (isActive && Number.isFinite(created)) {
      ageSum += Math.max(0, (now - created) / (24 * 60 * 60 * 1000));
    }

    if (isActive && !row.asignado_a_usuario_id) {
      unassigned += 1;
    }

    const probableClose = Date.parse(row.fecha_cierre_probable ?? "");
    if (isActive && Number.isFinite(probableClose)) {
      const daysUntilClose = Math.ceil((probableClose - now) / (24 * 60 * 60 * 1000));
      if (daysUntilClose >= 0 && daysUntilClose <= 14) {
        upcomingCloseCount += 1;
      }
    }
  }

  const topStage = Array.from(stageCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const topStaleStage = Array.from(staleStageCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const avgAgeDays = activeTotal > 0 ? Math.round(ageSum / activeTotal) : 0;
  const unassignedPct = activeTotal > 0 ? Math.round((unassigned / activeTotal) * 100) : 0;

  return {
    total,
    activeTotal,
    montoTotal,
    weightedAmount: Math.round(weightedAmount),
    monedas: Array.from(currencies),
    stale,
    unassigned,
    unassignedPct,
    avgAgeDays,
    topStage,
    topStaleStage,
    upcomingCloseCount,
  };
}

function normalizeOpportunityCategory(row: CRMOpportunity): string {
  return (row.etapa?.categoria || row.estado || "abierta").trim().toLowerCase();
}
