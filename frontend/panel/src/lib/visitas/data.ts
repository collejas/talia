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

type ContactoTemplateRow = {
  id?: string;
  nombre?: string | null;
  slug?: string | null;
};

type WebSessionAttributionRow = {
  session_id?: string | null;
  contacto_id?: string | null;
  contacto_nombre?: string | null;
  contacto_telefono?: string | null;
  contacto_correo?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  visit_count?: number | null;
  ip?: string | null;
  device_type?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  cve_ent?: string | null;
  nom_ent?: string | null;
  cve_mun?: string | null;
  nom_mun?: string | null;
  cvegeo?: string | null;
  referrer?: string | null;
  landing_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  source_class?: string | null;
  template_id?: string | null;
  template_slug?: string | null;
  template_nombre?: string | null;
  metadata?: Record<string, unknown> | null;
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
  source_class?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  template_id?: string | null;
  template_slug?: string | null;
  template_nombre?: string | null;
  template_captada?: boolean | null;
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

type VisitsFilters = {
  sourceClass?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  templateId?: string | null;
  rango?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

export async function loadVisitsData(filters: VisitsFilters = {}): Promise<VisitsPayload> {
  const [kpisResult, detalleResult, whatsappVisitResult, whatsappDetailResult, templatesResult] = await Promise.all([
    callCrmApi<DashboardKpisResponse>("/crm/visitas/kpis", { withUserToken: true }),
    callCrmApi<WebSessionAttributionRow[]>("/crm/visitas/web-sessions", {
      withUserToken: true,
      searchParams: {
        limit: 5000,
        offset: 0,
        source_class: filters.sourceClass || undefined,
        utm_source: filters.utmSource || undefined,
        utm_medium: filters.utmMedium || undefined,
        utm_campaign: filters.utmCampaign || undefined,
        template_id: filters.templateId || undefined,
        rango: filters.rango || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta || undefined,
      },
    }),
    callCrmApi<VisitantesCounterResponse>("/crm/visitas/whatsapp/total", { withUserToken: true }),
    callCrmApi<WhatsappConversationRow[]>("/crm/visitas/whatsapp/conversaciones", { withUserToken: true }),
    callCrmApi<{ items?: ContactoTemplateRow[] }>("/crm/prospeccion/contacto/templates", { withUserToken: true }),
  ]);

  const errors: string[] = [];
  if (!kpisResult.ok) errors.push(kpisResult.error);
  if (!detalleResult.ok) errors.push(detalleResult.error);
  if (!whatsappVisitResult.ok) errors.push(whatsappVisitResult.error);
  if (!whatsappDetailResult.ok) errors.push(whatsappDetailResult.error);
  if (!templatesResult.ok) errors.push(templatesResult.error);

  const detalleWebchat = detalleResult.ok ? detalleResult.data : undefined;
  const normalizedWebchat: VisitDetailRaw[] =
    detalleWebchat?.map((row) => ({
      session_id: row.session_id ?? null,
      oportunidad_id: null,
      canal: "webchat",
      ip: row.ip ?? null,
      registrado_en: row.first_seen_at ?? null,
      primera_visita_en: row.first_seen_at ?? null,
      ultimo_evento_en: row.last_seen_at ?? null,
      closed_at: null,
      stay_seconds: null,
      avg_stay_seconds: null,
      visit_count: row.visit_count ?? 1,
      total_visitas: row.visit_count ?? 1,
      tuvo_chat: null,
      mensajes_entrantes: null,
      mensajes_salientes: null,
      primer_mensaje_en: null,
      ultimo_mensaje_conversacion: null,
      contacto_id: row.contacto_id ?? null,
      contacto_nombre: row.contacto_nombre ?? null,
      contacto_correo: row.contacto_correo ?? null,
      contacto_telefono: row.contacto_telefono ?? null,
      contacto_empresa: null,
      contacto_estado: null,
      contacto_captura: null,
      contacto_creado_en: null,
      country_code: row.country_code ?? null,
      country_name: row.country_name ?? null,
      state_name: row.nom_ent ?? null,
      state_code: row.cve_ent ?? null,
      city_name: row.nom_mun ?? null,
      cve_ent: row.cve_ent ?? null,
      nom_ent: row.nom_ent ?? null,
      cve_mun: row.cve_mun ?? null,
      nom_mun: row.nom_mun ?? null,
      cvegeo: row.cvegeo ?? null,
      ubicacion_cache: null,
      device_type: row.device_type ?? null,
      dispositivo_cache: null,
      pantalla_cache: null,
      sistema_operativo: null,
      idioma: null,
      timezone: null,
      prefiere_modo_oscuro: null,
      referrer: row.referrer ?? null,
      landing_url: row.landing_url ?? null,
      trazabilidad_cache: row.metadata ?? null,
      source_class: row.source_class ?? null,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      template_id: row.template_id ?? null,
      template_slug: row.template_slug ?? null,
      template_nombre: row.template_nombre ?? null,
      template_captada: Boolean(row.template_id || row.template_slug),
      geo: null,
      total_rows: null,
      total_chat_rows: null,
      total_no_chat_rows: null,
    })) ?? [];
  const whatsappDetail = whatsappDetailResult.ok ? mapWhatsappRows(whatsappDetailResult.data) : [];
  const mergedDetalleBase: VisitDetailRaw[] = [...normalizedWebchat, ...whatsappDetail];
  const templateNameById = new Map<string, string>();
  const templateNameBySlug = new Map<string, string>();
  if (templatesResult.ok) {
    const templateItems = Array.isArray(templatesResult.data?.items) ? templatesResult.data.items : [];
    for (const template of templateItems) {
      if (!template || typeof template !== "object") continue;
      const templateName = (typeof template.nombre === "string" ? template.nombre : "").trim();
      if (!templateName) continue;
      const templateId = (typeof template.id === "string" ? template.id : "").trim().toLowerCase();
      const templateSlug = (typeof template.slug === "string" ? template.slug : "").trim().toLowerCase();
      if (templateId) templateNameById.set(templateId, templateName);
      if (templateSlug) templateNameBySlug.set(templateSlug, templateName);
    }
  }

  const enrichedDetalle = mergedDetalleBase.map((row) => {
    const tracking = extractTrackingFields(
      row.trazabilidad_cache,
      row.landing_url || null,
      row.referrer || null,
      {
        utm_source: row.utm_source ?? null,
        utm_medium: row.utm_medium ?? null,
        utm_campaign: row.utm_campaign ?? null,
        template_id: row.template_id ?? null,
        template_slug: row.template_slug ?? null,
        template_nombre: row.template_nombre ?? null,
      },
    );
    const templateIdKey = (tracking.template_id || "").trim().toLowerCase();
    const templateSlugKey = (tracking.template_slug || "").trim().toLowerCase();
    const templateNombre =
      tracking.template_nombre ||
      templateNameById.get(templateIdKey) ||
      templateNameBySlug.get(templateSlugKey) ||
      null;
    return {
      ...row,
      utm_source: tracking.utm_source,
      utm_medium: tracking.utm_medium,
      utm_campaign: tracking.utm_campaign,
      template_id: tracking.template_id,
      template_slug: tracking.template_slug,
      template_nombre: templateNombre,
      template_captada: tracking.template_captada,
    } satisfies VisitDetailRaw;
  });

  const filteredDetalle = enrichedDetalle.filter((row) => matchesVisitsFilters(row, filters));
  const whatsappTotal = extractTotal(whatsappVisitResult, whatsappDetail.length);
  const cards = mapCards(filters, kpisResult.ok ? kpisResult.data : undefined, filteredDetalle, whatsappTotal);
  const chart = mapChart(filteredDetalle);
  const table = mapTable(filteredDetalle, {
    templateNameById,
    templateNameBySlug,
  });

  return {
    cards,
    chart,
    table,
    errors: Array.from(new Set(errors)),
  };
}

function mapCards(
  filters: VisitsFilters,
  payload: DashboardKpisResponse | undefined,
  detalle: VisitDetailRaw[] | null | undefined,
  whatsappTotal: number,
): VisitCards {
  const hasAttributionOrRangeFilter = Boolean(
    (filters.sourceClass || "").trim() ||
    (filters.utmSource || "").trim() ||
    (filters.utmMedium || "").trim() ||
    (filters.utmCampaign || "").trim() ||
    (filters.templateId || "").trim() ||
    (filters.rango || "").trim() ||
    (filters.desde || "").trim() ||
    (filters.hasta || "").trim(),
  );
  if (hasAttributionOrRangeFilter) {
    payload = undefined;
  }

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

function mapTable(
  detalle?: VisitDetailRaw[] | null,
  options?: {
    templateNameById?: Map<string, string>;
    templateNameBySlug?: Map<string, string>;
  },
): VisitTableRow[] {
  if (!detalle || !detalle.length) return [];
  return detalle.map((row, index) => {
    const templateIdKey = (row.template_id || "").trim().toLowerCase();
    const templateSlugKey = (row.template_slug || "").trim().toLowerCase();
    const templateNombre = row.template_nombre ||
      options?.templateNameById?.get(templateIdKey) ||
      options?.templateNameBySlug?.get(templateSlugKey) ||
      null;
    const mergedRow: VisitDetailRaw = {
      ...row,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      template_id: row.template_id ?? null,
      template_slug: row.template_slug ?? null,
      template_nombre: templateNombre,
      template_captada: row.template_captada ?? Boolean(templateNombre || row.template_id || row.template_slug),
    };
    const isWhatsapp = row.canal === "whatsapp";
    const contactLabel =
      row.contacto_nombre || row.contacto_correo || row.contacto_telefono || null;
    const header = isWhatsapp
      ? `WhatsApp · ${row.contacto_nombre || row.contacto_telefono || row.contacto_correo || "Conversación"}`
      : contactLabel
      ? `Webchat · ${contactLabel}`
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
    const reviewer = contactLabel || "Asignar contacto";

    return {
      id: index + 1,
      header,
      type,
      status,
      target,
      limit: formatDuration(row.avg_stay_seconds ?? undefined),
      reviewer,
      raw: mergedRow,
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeTrackingValue(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned === "(none)") return null;
  return cleaned.toLowerCase();
}

function extractLandingTracking(landingUrl: string | null) {
  if (!landingUrl) {
    return { utm_source: null, utm_medium: null, utm_campaign: null, template_id: null, template_slug: null };
  }
  try {
    const url = new URL(landingUrl, "https://tracking.local");
    const utmSource = normalizeTrackingValue(url.searchParams.get("utm_source"));
    const utmMedium = normalizeTrackingValue(url.searchParams.get("utm_medium"));
    const utmCampaign = normalizeTrackingValue(url.searchParams.get("utm_campaign"));
    const templateId = normalizeTrackingValue(url.searchParams.get("template_id") || url.searchParams.get("tid"));
    const templateSlug = normalizeTrackingValue(url.searchParams.get("template_slug") || url.searchParams.get("kw"));
    return {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      template_id: templateId,
      template_slug: templateSlug,
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null, template_id: null, template_slug: null };
  }
}

function resolveSourceClass(row: VisitDetailRaw): string {
  const explicit = normalizeTrackingValue(row.source_class ?? null);
  if (explicit) return explicit;
  const utmSource = normalizeTrackingValue(row.utm_source ?? null);
  const utmMedium = normalizeTrackingValue(row.utm_medium ?? null);
  const utmCampaign = normalizeTrackingValue(row.utm_campaign ?? null);
  const referrer = (row.referrer || "").trim().toLowerCase();
  if (utmSource || utmMedium || utmCampaign) return "campaign";
  if (!referrer) return "direct";
  if (/google\./i.test(referrer)) return "organic_search";
  if (/(facebook|instagram|twitter|t\.co|linkedin)\./i.test(referrer)) return "organic_social";
  return "referral";
}

function matchesVisitsFilters(row: VisitDetailRaw, filters: VisitsFilters): boolean {
  const sourceClass = (filters.sourceClass || "").trim().toLowerCase();
  const utmSourceFilter = (filters.utmSource || "").trim().toLowerCase();
  const utmMediumFilter = (filters.utmMedium || "").trim().toLowerCase();
  const utmCampaignFilter = (filters.utmCampaign || "").trim().toLowerCase();
  const templateIdFilter = (filters.templateId || "").trim().toLowerCase();

  if (sourceClass && resolveSourceClass(row) !== sourceClass) return false;
  if (utmSourceFilter && (normalizeTrackingValue(row.utm_source ?? null) || "") !== utmSourceFilter) return false;
  if (utmMediumFilter && (normalizeTrackingValue(row.utm_medium ?? null) || "") !== utmMediumFilter) return false;
  if (utmCampaignFilter && (normalizeTrackingValue(row.utm_campaign ?? null) || "") !== utmCampaignFilter) return false;
  if (templateIdFilter) {
    const templateIdValue = normalizeTrackingValue(row.template_id ?? null) || "";
    const templateSlugValue = normalizeTrackingValue(row.template_slug ?? null) || "";
    if (templateIdValue !== templateIdFilter && templateSlugValue !== templateIdFilter) return false;
  }
  return true;
}

function extractReferrerUtmSource(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const referrerUrl = new URL(referrer, "https://tracking.local");
    return normalizeTrackingValue(referrerUrl.searchParams.get("utm_source"));
  } catch {
    return null;
  }
}

function extractTrackingFields(
  trazabilidadCache: Record<string, unknown> | null,
  landingUrl: string | null,
  referrer: string | null,
  seed?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    template_id?: string | null;
    template_slug?: string | null;
    template_nombre?: string | null;
  },
) {
  const root = asRecord(trazabilidadCache);
  const utm = asRecord(root?.utm);
  const campaign = asRecord(root?.campaign);
  const attribution = asRecord(root?.attribution);
  const landingTracking = extractLandingTracking(landingUrl);
  const referrerUtmSource = extractReferrerUtmSource(referrer);

  const utmSource = normalizeTrackingValue(
    pickString(root, ["utm_source"]) ||
      pickString(utm, ["source", "utm_source"]) ||
      pickString(campaign, ["utm_source"]) ||
      seed?.utm_source ||
      referrerUtmSource ||
      landingTracking.utm_source
  );
  const utmMedium = normalizeTrackingValue(
    pickString(root, ["utm_medium"]) ||
      pickString(utm, ["medium", "utm_medium"]) ||
      pickString(campaign, ["utm_medium"]) ||
      seed?.utm_medium ||
      landingTracking.utm_medium
  );
  const utmCampaign = normalizeTrackingValue(
    pickString(root, ["utm_campaign"]) ||
      pickString(utm, ["campaign", "utm_campaign"]) ||
      pickString(campaign, ["utm_campaign", "campaign"]) ||
      seed?.utm_campaign ||
      landingTracking.utm_campaign
  );
  const templateId = normalizeTrackingValue(
    pickString(root, ["tid", "template_id", "templateId"]) ||
      pickString(campaign, ["tid", "template_id", "templateId"]) ||
      pickString(attribution, ["template_id", "templateId"]) ||
      seed?.template_id ||
      landingTracking.template_id
  );
  const templateSlug = normalizeTrackingValue(
    pickString(root, ["template_slug", "templateSlug"]) ||
      pickString(campaign, ["template_slug", "templateSlug"]) ||
      pickString(attribution, ["template_slug", "templateSlug"]) ||
      seed?.template_slug ||
      landingTracking.template_slug
  );
  const templateNombre =
    seed?.template_nombre ||
    pickString(root, ["template_nombre", "template_name"]) ||
    pickString(campaign, ["template_nombre", "template_name"]) ||
    pickString(attribution, ["template_nombre", "template_name"]) ||
    null;

  return {
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    template_id: templateId,
    template_slug: templateSlug,
    template_nombre: templateNombre,
    template_captada: Boolean(templateId || templateSlug),
  };
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
