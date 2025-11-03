"use server";

import { callSupabaseRpc } from "@/lib/leads/supabase";

type LeadsResumenResponse = {
  total?: number;
  abiertas?: number;
  ganadas?: number;
  perdidas?: number;
  nuevas?: number;
  vendedores_activos?: number;
  monto_total?: number;
  top_vendedor?: {
    id?: string;
    nombre?: string;
    total?: number;
  };
};

type LeadsTimelineRow = {
  bucket_date: string;
  nuevos: number;
  ganados: number;
  perdidos: number;
};

type LeadsListRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_estado: string | null;
  canal: string | null;
  etapa_id: string;
  etapa_nombre: string;
  categoria: "abierta" | "ganada" | "perdida";
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad: number | null;
  lead_score: number | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  propietario_id: string | null;
  propietario_nombre: string | null;
  conversacion_id: string | null;
  ultimo_mensaje_en: string | null;
  motivo_cierre: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  total_rows: number;
};

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

const DEFAULT_LIMIT = 200;

export async function loadLeadsData(): Promise<LeadsPayload> {
  const [resumen, timeline, listado] = await Promise.all([
    callSupabaseRpc<LeadsResumenResponse>("panel_leads_resumen"),
    callSupabaseRpc<LeadsTimelineRow[]>("panel_leads_timeline"),
    callSupabaseRpc<LeadsListRow[]>("panel_leads_list", {
      body: {
        p_limit: DEFAULT_LIMIT,
        p_offset: 0,
        p_order_by: "creado_en",
        p_order_dir: "desc",
      },
    }),
  ]);

  const errors: string[] = [];
  if (!resumen.ok) errors.push(resumen.error);
  if (!timeline.ok) errors.push(timeline.error);
  if (!listado.ok) errors.push(listado.error);

  const cards = mapCards(resumen.ok ? resumen.data : undefined);
  const chart = mapChart(timeline.ok ? timeline.data : undefined);
  const table = mapTable(listado.ok ? listado.data : undefined);
  const totalRows =
    listado.ok && Array.isArray(listado.data) && listado.data.length
      ? listado.data[0].total_rows ?? listado.data.length
      : 0;

  return {
    cards,
    chart,
    table,
    totalRows,
    errors: Array.from(new Set(errors)),
  };
}

function mapCards(payload?: LeadsResumenResponse): LeadCards {
  return {
    total: payload?.total ?? 0,
    abiertas: payload?.abiertas ?? 0,
    ganadas: payload?.ganadas ?? 0,
    perdidas: payload?.perdidas ?? 0,
    nuevas: payload?.nuevas ?? 0,
    montoTotal: payload?.monto_total ?? 0,
    topVendedor: payload?.top_vendedor,
  };
}

function mapChart(payload?: LeadsTimelineRow[] | null): LeadChartPoint[] {
  if (!payload || !payload.length) return [];
  return payload.map((row) => ({
    date: row.bucket_date,
    nuevos: row.nuevos ?? 0,
    ganados: row.ganados ?? 0,
    perdidos: row.perdidos ?? 0,
  }));
}

function formatCurrency(value: number | null | undefined, currency = "MXN"): string {
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

function mapTable(payload?: LeadsListRow[] | null): LeadTableRow[] {
  if (!payload || !payload.length) return [];
  return payload.map((row, index) => {
    const categoria = row.categoria ?? "abierta";
    const statusMeta = buildStatusMeta(categoria, row.cerrado_en);
    const metricMeta = {
      value: row.monto_estimado ?? undefined,
      currency: row.moneda ?? "MXN",
      formatted: formatCurrency(row.monto_estimado, row.moneda ?? "MXN"),
    };
    return {
      id: index + 1,
      header: row.contacto_nombre?.trim() || "Lead sin nombre",
      type: row.etapa_nombre || "Sin etapa",
      status: categoria,
      target: String(row.monto_estimado ?? 0),
      limit: "—",
      reviewer: row.asignado_nombre || "Sin asignar",
      raw: {
        lead_id: row.tarjeta_id,
        contacto_id: row.contacto_id,
        etapa_id: row.etapa_id,
        etapa_nombre: row.etapa_nombre,
        categoria,
        canal: row.canal,
        creado_en: row.creado_en,
        actualizado_en: row.actualizado_en,
        cerrado_en: row.cerrado_en,
        conversacion_id: row.conversacion_id,
        ultimo_mensaje_en: row.ultimo_mensaje_en,
        asignado_id: row.asignado_id,
        asignado_nombre: row.asignado_nombre,
        propietario_id: row.propietario_id,
        propietario_nombre: row.propietario_nombre,
        contacto_correo: row.contacto_correo,
        contacto_telefono: row.contacto_telefono,
        contacto_estado: row.contacto_estado,
        motivo_cierre: row.motivo_cierre,
        lead_score: row.lead_score,
        probabilidad: row.probabilidad,
        tags: row.tags,
        metadata: row.metadata,
        status_meta: statusMeta,
        metric_meta: metricMeta,
      },
    };
  });
}

type StatusMeta = {
  label: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
};

function buildStatusMeta(categoria: string, cerradoEn: string | null): StatusMeta {
  switch (categoria) {
    case "ganada":
      return { label: "Ganado", variant: "default" };
    case "perdida":
      return { label: "Perdido", variant: "destructive" };
    default:
      return cerradoEn ? { label: "Cerrado", variant: "secondary" } : { label: "En proceso", variant: "outline" };
  }
}
