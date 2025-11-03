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

export type VisitDetailRaw = {
  session_id: string | null;
  ip: string | null;
  registrado_en: string | null;
  primera_visita_en: string | null;
  ultimo_evento_en: string | null;
  closed_at: string | null;
  stay_seconds: number | null;
  avg_stay_seconds: number | null;
  visit_count: number | null;
  total_visitas: number | null;
  tuvo_chat: boolean | null;
  mensajes_entrantes: number | null;
  mensajes_salientes: number | null;
  primer_mensaje_en: string | null;
  ultimo_mensaje_conversacion: string | null;
  contacto_id: string | null;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_empresa: string | null;
  contacto_estado: string | null;
  contacto_captura: string | null;
  contacto_creado_en: string | null;
  country_code: string | null;
  country_name: string | null;
  state_name: string | null;
  state_code: string | null;
  city_name: string | null;
  cve_ent: string | null;
  nom_ent: string | null;
  cve_mun: string | null;
  nom_mun: string | null;
  cvegeo: string | null;
  ubicacion_cache: Record<string, unknown> | null;
  device_type: string | null;
  dispositivo_cache: Record<string, unknown> | null;
  pantalla_cache: Record<string, unknown> | null;
  sistema_operativo: string | null;
  idioma: string | null;
  timezone: string | null;
  prefiere_modo_oscuro: boolean | null;
  referrer: string | null;
  landing_url: string | null;
  trazabilidad_cache: Record<string, unknown> | null;
  geo: Record<string, unknown> | null;
  total_rows: number | null;
  total_chat_rows: number | null;
  total_no_chat_rows: number | null;
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
  raw?: VisitDetailRaw;
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
    callSupabaseRpc<VisitDetailRaw[]>("panel_webchat_visitas_detalle", {
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

  const detalle = detalleResult.ok ? detalleResult.data : undefined;
  const cards = mapCards(kpisResult.ok ? kpisResult.data : undefined, detalle);
  const chart = mapChart(detalle);
  const table = mapTable(detalle);

  return {
    cards,
    chart,
    table,
    errors: Array.from(new Set(errors)),
  };
}

function mapCards(
  payload?: DashboardKpisResponse,
  detalle?: VisitDetailRaw[] | null,
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

function mapChart(detalle?: VisitDetailRaw[] | null): VisitChartPoint[] {
  if (!detalle || !detalle.length) return [];
  const totals = new Map<string, { desktop: number; mobile: number }>();
  for (const row of detalle) {
    const date = normalizeDate(row.primera_visita_en ?? row.registrado_en ?? row.ultimo_evento_en ?? undefined);
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

function mapTable(detalle?: VisitDetailRaw[] | null): VisitTableRow[] {
  if (!detalle || !detalle.length) return [];
  return detalle.map((row, index) => ({
    id: index + 1,
    header: row.session_id || `Sesión ${index + 1}`,
    type: row.state_name || row.country_name || "Sin ubicación",
    status: row.tuvo_chat ? "Done" : "In Process",
    target: toNumber(row.visit_count).toString(),
    limit: formatDuration(row.avg_stay_seconds ?? undefined),
    reviewer: row.contacto_nombre || row.contacto_correo || "Asignar contacto",
    raw: row,
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
