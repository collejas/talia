"use server";

import { callSupabaseRpc } from "@/lib/visitas/supabase";

type DashboardKpisResponse = {
  visitantes?: number;
  visitas_totales?: number;
  webchat?: {
    visitas_sin_chat?: number;
    visitas_totales?: number;
    conversaciones?: number;
    contactos_completos?: number;
  };
};

type VisitantesEstadosResponse = {
  items?: Array<{
    cve_ent?: string | number;
    nombre?: string;
    total?: number;
  }>;
};

type VisitasDetalleRow = {
  session_id?: string;
  ip?: string;
  visit_count?: number;
  total_visitas?: number;
  tuvo_chat?: boolean;
  country_name?: string;
  state_name?: string;
  city_name?: string;
  registrado_en?: string;
  primera_visita_en?: string;
  ultimo_evento_en?: string;
  stay_seconds?: number;
  avg_stay_seconds?: number;
  contacto_nombre?: string;
  contacto_correo?: string;
  contacto_estado?: string;
  contacto_captura?: string;
  total_rows?: number;
  total_chat_rows?: number;
  total_no_chat_rows?: number;
};

export type VisitCards = {
  totalVisits: number;
  sinChat: number;
  conChat: number;
  contactos: number;
};

export type VisitChartPoint = {
  date: string;
  desktop: number;
  mobile: number;
};

export type VisitTableRow = {
  id: number;
  header: string;
  type: string;
  status: "Done" | "In Process";
  target: string;
  limit: string;
  reviewer: string;
};

export type VisitsPayload = {
  cards: VisitCards;
  chart: VisitChartPoint[];
  table: VisitTableRow[];
  errors: string[];
};

export async function loadVisitsData(): Promise<VisitsPayload> {
  const [kpisResult, estadosResult, detalleResult] = await Promise.all([
    callSupabaseRpc<DashboardKpisResponse>("dashboard_kpis"),
    callSupabaseRpc<VisitantesEstadosResponse>("panel_visitantes_sin_chat_estados"),
    callSupabaseRpc<VisitasDetalleRow[]>("panel_webchat_visitas_detalle", {
      body: {
        p_limit: 200,
        p_offset: 0,
        p_order_by: "primera",
        p_order_dir: "asc",
      },
    }),
  ]);

  const errors: string[] = [];
  if (!kpisResult.ok) errors.push(kpisResult.error);
  if (!estadosResult.ok) errors.push(estadosResult.error);
  if (!detalleResult.ok) errors.push(detalleResult.error);

  const cards = mapCards(kpisResult.ok ? kpisResult.data : undefined, detalleResult.ok ? detalleResult.data : undefined);
  const chart = mapChart(detalleResult.ok ? detalleResult.data : undefined);
  const table = mapTable(detalleResult.ok ? detalleResult.data : undefined);

  return {
    cards,
    chart,
    table,
    errors: Array.from(new Set(errors)),
  };
}

function mapCards(
  payload?: DashboardKpisResponse,
  detalle?: VisitasDetalleRow[] | null,
): VisitCards {
  if (payload) {
    return {
      totalVisits: toNumber(payload.visitas_totales ?? payload.webchat?.visitas_totales),
      sinChat: toNumber(payload.webchat?.visitas_sin_chat ?? payload.visitantes),
      conChat: toNumber(payload.webchat?.conversaciones),
      contactos: toNumber(payload.webchat?.contactos_completos),
    };
  }

  if (detalle && Array.isArray(detalle)) {
    let totalVisits = 0;
    let sinChat = 0;
    let conChat = 0;
    const contactos = new Set<string>();
    for (const row of detalle) {
      const visits = toNumber(row.visit_count);
      totalVisits += visits;
      if (row.tuvo_chat) {
        conChat += visits;
      } else {
        sinChat += visits;
      }
      const contactId = row.contacto_correo || row.contacto_nombre;
      if (contactId) contactos.add(contactId);
    }
    return {
      totalVisits,
      sinChat,
      conChat,
      contactos: contactos.size,
    };
  }

  return {
    totalVisits: 0,
    sinChat: 0,
    conChat: 0,
    contactos: 0,
  };
}

function mapChart(detalle?: VisitasDetalleRow[] | null): VisitChartPoint[] {
  if (!detalle || !detalle.length) return [];
  const totals = new Map<string, { desktop: number; mobile: number }>();
  for (const row of detalle) {
    const date = normalizeDate(row.primera_visita_en || row.registrado_en || row.ultimo_evento_en);
    if (!date) continue;
    const bucket = totals.get(date) ?? { desktop: 0, mobile: 0 };
    const visits = toNumber(row.visit_count);
    if (row.tuvo_chat) {
      bucket.desktop += visits;
    } else {
      bucket.mobile += visits;
    }
    totals.set(date, bucket);
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, values]) => ({
      date,
      desktop: values.desktop,
      mobile: values.mobile,
    }));
}

function mapTable(detalle?: VisitasDetalleRow[] | null): VisitTableRow[] {
  if (!detalle || !detalle.length) return [];
  return detalle.map((row, index) => ({
    id: index + 1,
    header: row.session_id || `Sesión ${index + 1}`,
    type: row.state_name || row.country_name || "Sin ubicación",
    status: row.tuvo_chat ? "Done" : "In Process",
    target: toNumber(row.visit_count).toString(),
    limit: formatDuration(row.avg_stay_seconds),
    reviewer: row.contacto_nombre || row.contacto_correo || "Asignar contacto",
  }));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatDuration(value?: number): string {
  if (!value || value <= 0) return "—";
  const minutes = value / 60;
  if (minutes < 1) {
    return `${Math.round(value)}s`;
  }
  return `${minutes.toFixed(1)} min`;
}
