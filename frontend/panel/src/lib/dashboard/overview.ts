"use server";

import { callCrmApi } from "@/lib/api/crm";
import type { AgendaMetrics } from "@/lib/agenda/data";
import type { DashboardKpis } from "@/lib/dashboard/kpis";
import type {
  ProspeccionCampanaItem,
  ProspeccionFraseByRule,
  ProspeccionMetricasSummary,
  ProspeccionTimeseries,
} from "@/lib/dashboard/prospeccion-kpis";
import type { OpportunityKpis } from "@/lib/dashboard/opportunities-kpis";
import type {
  LeadCards,
  LeadChartPoint,
  LeadSellerPoint,
  LeadTableRow,
} from "@/lib/leads/data";

type RangeFilters = {
  rango?: string;
  desde?: string;
  hasta?: string;
};

export type DashboardOverview = {
  leads: {
    cards: LeadCards;
    chart: LeadChartPoint[];
    salesBySeller: LeadSellerPoint[];
    table: LeadTableRow[];
    totalRows: number;
  };
  attention: DashboardKpis;
  marketing: {
    summary: ProspeccionMetricasSummary;
    timeseries: ProspeccionTimeseries;
    items: ProspeccionCampanaItem[];
    byRule: ProspeccionFraseByRule[];
  };
  opportunity: OpportunityKpis;
  agenda: AgendaMetrics;
};

type DashboardOverviewResponse = {
  ok?: boolean;
  overview?: DashboardOverview;
  errors?: Record<string, string>;
};

export async function fetchDashboardOverview(
  filters: RangeFilters = {},
): Promise<DashboardOverview> {
  const response = await callCrmApi<DashboardOverviewResponse>("/crm/dashboard/overview", {
    withUserToken: true,
    searchParams: {
      rango: filters.rango || undefined,
      desde: filters.desde || undefined,
      hasta: filters.hasta || undefined,
    },
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  const overview = response.data?.overview;
  if (!overview) {
    throw new Error("Respuesta inválida del dashboard overview.");
  }

  return overview;
}
