"use server";

import { callCrmApi } from "@/lib/api/crm";
import { inferPhoneLocation } from "@/lib/visitas/phone-location";

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

type VisitantesCounterResponse = { total?: number | string | null } | number | string | null;

type WhatsappConversationRow = {
  id: string;
  canal: string | null;
  iniciada_en: string | null;
  ultimo_mensaje_en: string | null;
  contacto: {
    nombre_completo?: string | null;
    correo?: string | null;
    telefono_e164?: string | null;
  } | null;
};

export type VisitDetailRaw = {
  session_id: string | null;
  oportunidad_id: string | null;
  canal?: string | null;
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
  whatsapp: number;
};

export type VisitChartPoint = {
  date: string;
  conChat: number;
  sinChat: number;
  whatsapp: number;
};

export type VisitTableRow = {
  id: number;
  header: string;
  type: string;
  status: string;
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
  const [kpisResult, estadosResult, detalleResult, whatsappVisitResult, whatsappDetailResult] = await Promise.all([
    callCrmApi<DashboardKpisResponse>("/crm/visitas/kpis", { withUserToken: true }),
    callCrmApi<VisitantesEstadosResponse>("/crm/visitas/estados", { withUserToken: true }),
    callCrmApi<VisitDetailRaw[]>("/crm/visitas/detalle", {
      withUserToken: true,
      searchParams: {
        limit: 200,
        offset: 0,
        order_by: "primera",
        order_dir: "asc",
      },
    }),
    callCrmApi<VisitantesCounterResponse>("/crm/visitas/whatsapp/total", { withUserToken: true }),
    callCrmApi<WhatsappConversationRow[]>("/crm/visitas/whatsapp/conversaciones", { withUserToken: true }),
  ]);

  const errors: string[] = [];
  if (!kpisResult.ok) errors.push(kpisResult.error);
  if (!estadosResult.ok) errors.push(estadosResult.error);
  if (!detalleResult.ok) errors.push(detalleResult.error);
  if (!whatsappVisitResult.ok) errors.push(whatsappVisitResult.error);
  if (!whatsappDetailResult.ok) errors.push(whatsappDetailResult.error);

  const detalleWebchat = detalleResult.ok ? detalleResult.data : undefined;
  const normalizedWebchat = detalleWebchat?.map((row) => ({ ...row, canal: "webchat" as const })) ?? [];
  const whatsappDetail = whatsappDetailResult.ok ? mapWhatsappRows(whatsappDetailResult.data) : [];
  const mergedDetalle: VisitDetailRaw[] = [...normalizedWebchat, ...whatsappDetail];

  const whatsappTotal = extractTotal(whatsappVisitResult, whatsappDetail.length);
  const cards = mapCards(kpisResult.ok ? kpisResult.data : undefined, mergedDetalle, whatsappTotal);
  const chart = mapChart(mergedDetalle);
  const table = mapTable(mergedDetalle);

  return {
    cards,
    chart,
    table,
    errors: Array.from(new Set(errors)),
  };
}

function mapCards(
  payload: DashboardKpisResponse | undefined,
  detalle: VisitDetailRaw[] | null | undefined,
  whatsappTotal: number,
): VisitCards {
  if (payload) {
    const sinChat = toNumber(payload.webchat?.visitas_sin_chat ?? payload.visitantes);
    const conChat = toNumber(payload.webchat?.conversaciones);
    return {
      totalVisits: sinChat + conChat + whatsappTotal,
      sinChat,
      conChat,
      contactos: toNumber(payload.webchat?.contactos_completos),
      whatsapp: whatsappTotal,
    };
  }

  if (detalle && Array.isArray(detalle)) {
    let totalVisits = 0;
    let sinChat = 0;
    let conChat = 0;
    let whatsapp = 0;
    const contactos = new Set<string>();
    const seenSessions = new Set<string>();
    detalle.forEach((row, index) => {
      const sessionKey = row.session_id ?? `row-${index}`;
      totalVisits += 1;
      if (row.canal === "whatsapp") {
        whatsapp += 1;
        seenSessions.add(sessionKey);
      } else if (row.tuvo_chat) {
        conChat += 1;
        seenSessions.add(sessionKey);
      } else if (!seenSessions.has(sessionKey)) {
        sinChat += 1;
      }

      const contactId = row.contacto_id || row.contacto_correo || row.contacto_nombre;
      if (contactId) contactos.add(contactId);
    });

    return {
      totalVisits: totalVisits + whatsappTotal,
      sinChat,
      conChat,
      contactos: contactos.size,
      whatsapp,
    };
  }

  return {
    totalVisits: 0,
    sinChat: 0,
    conChat: 0,
    contactos: 0,
    whatsapp: whatsappTotal,
  };
}

function mapChart(detalle?: VisitDetailRaw[] | null): VisitChartPoint[] {
  if (!detalle || !detalle.length) return [];
  const totals = new Map<string, { conChat: number; sinChat: number; whatsapp: number }>();
  const seenSessions = new Set<string>();
  detalle.forEach((row, index) => {
    const sessionKey = row.session_id ?? `row-${index}`;
    const date = normalizeDate(
      row.primera_visita_en ?? row.registrado_en ?? row.ultimo_evento_en ?? undefined
    );
    if (!date) return;

    const bucket = totals.get(date) ?? { conChat: 0, sinChat: 0, whatsapp: 0 };
    if (row.canal === "whatsapp") {
      bucket.whatsapp += 1;
      seenSessions.add(sessionKey);
    } else if (row.tuvo_chat) {
      bucket.conChat += 1;
      seenSessions.add(sessionKey);
    } else if (!seenSessions.has(sessionKey)) {
      bucket.sinChat += 1;
    }
    totals.set(date, bucket);
  });
  return Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, values]) => ({
      date,
      conChat: values.conChat,
      sinChat: values.sinChat,
      whatsapp: values.whatsapp,
    }));
}

function mapTable(detalle?: VisitDetailRaw[] | null): VisitTableRow[] {
  if (!detalle || !detalle.length) return [];
  return detalle.map((row, index) => {
    const isWhatsapp = row.canal === "whatsapp";
    const header = isWhatsapp
      ? `WhatsApp · ${row.contacto_nombre || row.contacto_telefono || row.contacto_correo || "Conversación"}`
      : row.session_id || `Sesión ${index + 1}`;
    const phoneLocation = isWhatsapp ? inferPhoneLocation(row.contacto_telefono || null) : null;
    const type =
      row.state_name ||
      row.country_name ||
      (isWhatsapp
        ? phoneLocation?.stateName || phoneLocation?.countryName || "WhatsApp"
        : "Webchat");
    const status = row.tuvo_chat || isWhatsapp ? "Done" : "In Process";
    const target = isWhatsapp ? "1" : toNumber(row.visit_count).toString();
    const reviewer =
      row.contacto_nombre || row.contacto_correo || row.contacto_telefono || "Asignar contacto";

    return {
      id: index + 1,
      header,
      type,
      status,
      target,
      limit: formatDuration(row.avg_stay_seconds ?? undefined),
      reviewer,
      raw: row,
    };
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function extractTotal(
  result: Awaited<ReturnType<typeof callCrmApi<VisitantesCounterResponse>>>,
  fallbackCount: number,
) {
  if (!result || !result.ok) return fallbackCount;
  const payload = result.data;
  const value =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { total?: number | string | null }).total
      : payload;
  const parsed = toNumber(value);
  return parsed || fallbackCount;
}

function mapWhatsappRows(rows?: WhatsappConversationRow[] | null): VisitDetailRaw[] {
  if (!rows || !rows.length) return [];
  return rows.map((row) => {
    const location = inferPhoneLocation(row.contacto?.telefono_e164 || null);
    return {
      session_id: `whatsapp-${row.id}`,
      oportunidad_id: null,
      canal: "whatsapp",
      ip: null,
      registrado_en: row.iniciada_en,
      primera_visita_en: row.iniciada_en,
      ultimo_evento_en: row.ultimo_mensaje_en,
      closed_at: null,
      stay_seconds: null,
      avg_stay_seconds: null,
      visit_count: 1,
      total_visitas: 1,
      tuvo_chat: true,
      mensajes_entrantes: null,
      mensajes_salientes: null,
      primer_mensaje_en: row.iniciada_en,
      ultimo_mensaje_conversacion: row.ultimo_mensaje_en,
      contacto_id: row.contacto?.telefono_e164 || row.contacto?.correo || null,
      contacto_nombre: row.contacto?.nombre_completo || null,
      contacto_correo: row.contacto?.correo || null,
      contacto_telefono: row.contacto?.telefono_e164 || null,
      contacto_empresa: null,
      contacto_estado: "whatsapp",
      contacto_captura: null,
      contacto_creado_en: null,
      country_code: location.countryCode,
      country_name: location.countryName,
      state_name: location.stateName,
      state_code: location.stateCode,
      city_name: location.municipalityName,
      cve_ent: location.stateCode,
      nom_ent: location.stateName,
      cve_mun: null,
      nom_mun: location.municipalityName,
      cvegeo: null,
      ubicacion_cache: null,
      device_type: null,
      dispositivo_cache: null,
      pantalla_cache: null,
      sistema_operativo: null,
      idioma: null,
      timezone: null,
      prefiere_modo_oscuro: null,
      referrer: "WhatsApp",
      landing_url: null,
      trazabilidad_cache: null,
      geo: null,
      total_rows: null,
      total_chat_rows: null,
      total_no_chat_rows: null,
    };
  });
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
