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
  errors: string[];
};

type PipelineOverviewResponse = {
  cards: LeadCards;
  chart: LeadChartPoint[];
  table: LeadTableRow[];
  total_rows: number;
};

const DEFAULT_LIMIT = 200;
const EMPTY_CARDS: LeadCards = {
  total: 0,
  abiertas: 0,
  ganadas: 0,
  perdidas: 0,
  nuevas: 0,
  montoTotal: 0,
};

export async function loadLeadsData(): Promise<LeadsPayload> {
  const response = await callCrmApi<PipelineOverviewResponse>("/crm/pipeline/overview", {
    searchParams: {
      limit: String(DEFAULT_LIMIT),
    },
  });

  if (!response.ok) {
    return {
      cards: EMPTY_CARDS,
      chart: [],
      table: [],
      totalRows: 0,
      errors: [response.error],
    };
  }

  const cards = normalizeCards(response.data.cards);
  const chart = Array.isArray(response.data.chart) ? response.data.chart : [];
  const table = Array.isArray(response.data.table) ? response.data.table : [];
  const totalRows = Number.isFinite(response.data.total_rows) ? response.data.total_rows : table.length;

  return {
    cards,
    chart,
    table,
    totalRows,
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
