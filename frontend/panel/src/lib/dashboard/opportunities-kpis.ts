"use server";

import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunityStage = {
  id: string;
  nombre: string | null;
};

type CRMOpportunity = {
  id: string;
  etapa?: CRMOpportunityStage | null;
  etapa_id: string;
  monto_estimado: number | null;
  moneda: string | null;
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
  montoTotal: number;
  monedas: string[];
  stale: number;
  avgAgeDays: number;
  topStage: OpportunityStageSummary | null;
};

type LoadOpportunityKpisOptions = {
  limit?: number;
  staleDays?: number;
};

const DEFAULT_LIMIT = 500;
const DEFAULT_STALE_DAYS = 14;

export async function fetchOpportunityKpis(
  options: LoadOpportunityKpisOptions = {},
): Promise<OpportunityKpis> {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const staleDays = Math.max(1, options.staleDays ?? DEFAULT_STALE_DAYS);
  const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
    withUserToken: true,
    searchParams: {
      limit: String(limit),
      offset: "0",
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
  let total = 0;
  let montoTotal = 0;
  let stale = 0;
  let ageSum = 0;
  const currencies = new Set<string>();

  for (const row of rows) {
    total += 1;
    const amount = Number(row.monto_estimado ?? 0);
    if (Number.isFinite(amount)) {
      montoTotal += amount;
    }
    if (row.moneda) currencies.add(row.moneda);

    const stageLabel = row.etapa?.nombre?.trim()
      ? row.etapa.nombre.trim()
      : `Etapa ${row.etapa_id.slice(0, 8)}`;
    stageCounts.set(stageLabel, (stageCounts.get(stageLabel) ?? 0) + 1);

    const updated = Date.parse(row.actualizado_en);
    if (Number.isFinite(updated)) {
      const days = Math.floor((now - updated) / (24 * 60 * 60 * 1000));
      if (days >= staleDays) stale += 1;
    }

    const created = Date.parse(row.creado_en);
    if (Number.isFinite(created)) {
      ageSum += Math.max(0, (now - created) / (24 * 60 * 60 * 1000));
    }
  }

  const topStage = Array.from(stageCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const avgAgeDays = total > 0 ? Math.round(ageSum / total) : 0;

  return {
    total,
    montoTotal,
    monedas: Array.from(currencies),
    stale,
    avgAgeDays,
    topStage,
  };
}
