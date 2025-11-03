"use server";

import { callSupabaseRpc } from "@/lib/contactos/supabase";

type ContactosResumenResponse = {
  total?: number;
  completos?: number;
  incompletos?: number;
  activos?: number;
  leads?: number;
  webchat?: number;
  propietarios?: number;
  ultimo?: string | null;
};

type ContactosTimelineRow = {
  bucket_date: string;
  nuevos: number;
  completos: number;
  webchat: number;
};

type ContactosListRow = {
  contacto_id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  estado: string | null;
  captura_estado: string | null;
  origen: string | null;
  creado_en: string;
  actualizado_en: string | null;
  company_name: string | null;
  propietario_id: string | null;
  propietario_nombre: string | null;
  ultimo_contacto_en: string | null;
  conversaciones: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  total_rows: number;
};

export type ContactCards = {
  total: number;
  completos: number;
  incompletos: number;
  activos: number;
  leads: number;
  webchat: number;
  propietarios: number;
  ultimo?: string | null;
};

export type ContactChartPoint = {
  date: string;
  nuevos: number;
  completos: number;
  webchat: number;
};

export type ContactTableRow = {
  id: number;
  header: string;
  type: string;
  status: string;
  target: string;
  limit: string;
  reviewer: string;
  raw?: Record<string, unknown>;
};

export type ContactosPayload = {
  cards: ContactCards;
  chart: ContactChartPoint[];
  table: ContactTableRow[];
  totalRows: number;
  errors: string[];
};

const DEFAULT_LIMIT = 200;

export async function loadContactosData(): Promise<ContactosPayload> {
  const [resumen, timeline, listado] = await Promise.all([
    callSupabaseRpc<ContactosResumenResponse>("panel_contactos_resumen"),
    callSupabaseRpc<ContactosTimelineRow[]>("panel_contactos_timeline"),
    callSupabaseRpc<ContactosListRow[]>("panel_contactos_list", {
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

function mapCards(payload?: ContactosResumenResponse): ContactCards {
  return {
    total: payload?.total ?? 0,
    completos: payload?.completos ?? 0,
    incompletos: payload?.incompletos ?? 0,
    activos: payload?.activos ?? 0,
    leads: payload?.leads ?? 0,
    webchat: payload?.webchat ?? 0,
    propietarios: payload?.propietarios ?? 0,
    ultimo: payload?.ultimo ?? null,
  };
}

function mapChart(payload?: ContactosTimelineRow[] | null): ContactChartPoint[] {
  if (!payload || !payload.length) return [];
  return payload.map((row) => ({
    date: row.bucket_date,
    nuevos: row.nuevos ?? 0,
    completos: row.completos ?? 0,
    webchat: row.webchat ?? 0,
  }));
}

function mapTable(payload?: ContactosListRow[] | null): ContactTableRow[] {
  if (!payload || !payload.length) return [];
  return payload.map((row, index) => {
    const captureDone = (row.captura_estado || "").toLowerCase() === "completo";
    const status = captureDone ? "Done" : "In Process";
    const conversations = Number.isFinite(row.conversaciones) ? Number(row.conversaciones) : 0;
    const lastContact =
      row.ultimo_contacto_en && !Number.isNaN(Date.parse(row.ultimo_contacto_en))
        ? new Date(row.ultimo_contacto_en).toISOString()
        : "";

    return {
      id: index + 1,
      header: row.nombre?.trim() || "Contacto sin nombre",
      type: normalizeLabel(row.estado) || "Desconocido",
      status,
      target: conversations.toString(),
      limit: lastContact,
      reviewer: row.propietario_nombre || "Sin asignar",
      raw: {
        contacto_id: row.contacto_id,
        correo: row.correo,
        telefono: row.telefono,
        estado: row.estado,
        captura_estado: row.captura_estado,
        origen: row.origen,
        creado_en: row.creado_en,
        actualizado_en: row.actualizado_en,
        company_name: row.company_name,
        propietario_id: row.propietario_id,
        propietario_nombre: row.propietario_nombre,
        ultimo_contacto_en: row.ultimo_contacto_en,
        conversaciones: conversations,
        notes: row.notes,
        metadata: row.metadata,
        status_meta: {
          label: captureDone ? "Completo" : "Incompleto",
          variant: captureDone ? "default" : "outline",
        },
        metric_meta: {
          value: conversations,
          formatted: conversations.toLocaleString("es-MX"),
        },
      },
    };
  });
}

function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "Desconocido";
  const trimmed = value.trim();
  return trimmed.length ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "Desconocido";
}
