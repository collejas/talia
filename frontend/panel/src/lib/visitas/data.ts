"use server";

import { callCrmApi } from "@/lib/api/crm";
import { normalizeAcquisitionSourceClass } from "@/lib/mapa-conversion/source-class";

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
  persona_id?: string | null;
  contacto_id?: string | null;
  contacto_nombre?: string | null;
  contacto_correo?: string | null;
  contacto_telefono?: string | null;
  contacto?: {
    persona_id?: string | null;
    nombre_completo?: string | null;
    correo?: string | null;
    telefono_e164?: string | null;
    estado?: string | null;
    origen?: string | null;
    creado_en?: string | null;
  } | null;
  phone_location?: {
    country_code?: string | null;
    country_name?: string | null;
    state_code?: string | null;
    state_name?: string | null;
    municipality_code?: string | null;
    municipality_name?: string | null;
    municipality_cvegeo?: string | null;
    lada?: string | null;
    ok?: boolean | null;
  } | null;
  whatsapp_atribucion?: {
    canal_publicitario?: string | null;
    campana_publicitaria?: string | null;
    regla_id?: string | null;
    regla_nombre?: string | null;
    regla_frase?: string | null;
    template_id?: string | null;
    template_slug?: string | null;
    template_nombre?: string | null;
    adset?: string | null;
    anuncio?: string | null;
    creado_en?: string | null;
  } | null;
  whatsapp_prospeccion?: {
    batch_id?: string | null;
    batch_label?: string | null;
    campana_id?: string | null;
    campana_nombre?: string | null;
    campana_tipo?: string | null;
    template_id?: string | null;
    template_slug?: string | null;
    template_nombre?: string | null;
  } | null;
};

type ContactoTemplateRow = {
  id?: string;
  nombre?: string | null;
  slug?: string | null;
};

type WebSessionAttributionRow = {
  session_id?: string | null;
  eid?: string | null;
  persona_id?: string | null;
  contacto_id?: string | null;
  contacto_nombre?: string | null;
  contacto_origen?: string | null;
  contacto_telefono?: string | null;
  contacto_correo?: string | null;
  correo_envio?: string | null;
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
  referrer_host?: string | null;
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
  eid?: string | null;
  oportunidad_id: string | null;
  canal?: string | null;
  prospeccion_batch_id?: string | null;
  prospeccion_batch_label?: string | null;
  prospeccion_campana_id?: string | null;
  prospeccion_campana_nombre?: string | null;
  prospeccion_campana_tipo?: string | null;
  wa_canal_publicitario?: string | null;
  wa_campana_publicitaria?: string | null;
  wa_regla_id?: string | null;
  wa_regla_nombre?: string | null;
  wa_regla_frase?: string | null;
  whatsapp_atribucion?: Record<string, unknown> | null;
  whatsapp_prospeccion?: Record<string, unknown> | null;
  phone_location?: {
    country_code?: string | null;
    country_name?: string | null;
    state_code?: string | null;
    state_name?: string | null;
    municipality_code?: string | null;
    municipality_name?: string | null;
    municipality_cvegeo?: string | null;
    lada?: string | null;
    ok?: boolean | null;
  } | null;
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
  persona_id: string | null;
  contacto_id: string | null;
  contacto_nombre: string | null;
  contacto_origen?: string | null;
  contacto_correo: string | null;
  correo_envio?: string | null;
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
  referrer_host?: string | null;
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
  canales?: string[] | null;
  estado?: string | null;
  sourceClass?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  campanaId?: string | null;
  campanaTipo?: string | null;
  templateId?: string | null;
  waCanalPublicitario?: string | null;
  waCampanaPublicitaria?: string | null;
  waReglaId?: string | null;
  rango?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

function buildVisitsSearchParams(filters: VisitsFilters) {
  return {
    limit: 5000,
    offset: 0,
    estado: filters.estado || undefined,
    source_class: filters.sourceClass || undefined,
    utm_source: filters.utmSource || undefined,
    utm_medium: filters.utmMedium || undefined,
    utm_campaign: filters.utmCampaign || undefined,
    template_id: filters.templateId || undefined,
    rango: filters.rango || undefined,
    desde: filters.desde || undefined,
    hasta: filters.hasta || undefined,
  };
}

function hasAttributionFilters(filters: VisitsFilters): boolean {
  return Boolean(
    (filters.sourceClass || "").trim() ||
    (filters.utmSource || "").trim() ||
    (filters.utmMedium || "").trim() ||
    (filters.utmCampaign || "").trim() ||
    (filters.campanaId || "").trim() ||
    (filters.campanaTipo || "").trim() ||
    (filters.templateId || "").trim(),
  );
}

function hasWaAttributionFilters(filters: VisitsFilters): boolean {
  return Boolean(
    (filters.waCanalPublicitario || "").trim() ||
      (filters.waCampanaPublicitaria || "").trim() ||
      (filters.waReglaId || "").trim(),
  );
}

function unwrapWebSessionsPayload(payload: unknown): {
  rows: WebSessionAttributionRow[];
  shape: "array" | "items" | "other" | "none";
} {
  if (Array.isArray(payload)) {
    return { rows: payload as WebSessionAttributionRow[], shape: "array" };
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown[] }).items)
  ) {
    return {
      rows: (payload as { items: WebSessionAttributionRow[] }).items,
      shape: "items",
    };
  }
  if (payload != null) {
    return { rows: [], shape: "other" };
  }
  return { rows: [], shape: "none" };
}

function normalizeWebSessionRows(rows: WebSessionAttributionRow[]): VisitDetailRaw[] {
  const normalized: VisitDetailRaw[] = [];
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as WebSessionAttributionRow;
    try {
      normalized.push({
        session_id: row.session_id ?? null,
        eid: row.eid ?? null,
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
        persona_id: row.persona_id ?? row.contacto_id ?? null,
        contacto_id: row.persona_id ?? row.contacto_id ?? null,
        contacto_nombre: row.contacto_nombre ?? null,
        contacto_origen: row.contacto_origen ?? null,
        contacto_correo: row.correo_envio ?? row.contacto_correo ?? null,
        correo_envio: row.correo_envio ?? null,
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
        referrer_host: row.referrer_host ?? null,
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
      });
    } catch {
    }
  }
  return normalized;
}

function buildTemplateLookup(
  payload: { items?: ContactoTemplateRow[] } | undefined,
): { templateNameById: Map<string, string>; templateNameBySlug: Map<string, string> } {
  const templateNameById = new Map<string, string>();
  const templateNameBySlug = new Map<string, string>();
  const templateItems = Array.isArray(payload?.items) ? payload.items : [];
  for (const template of templateItems) {
    if (!template || typeof template !== "object") continue;
    const templateName = (typeof template.nombre === "string" ? template.nombre : "").trim();
    if (!templateName) continue;
    const templateId = (typeof template.id === "string" ? template.id : "").trim().toLowerCase();
    const templateSlug = (typeof template.slug === "string" ? template.slug : "").trim().toLowerCase();
    if (templateId) templateNameById.set(templateId, templateName);
    if (templateSlug) templateNameBySlug.set(templateSlug, templateName);
  }
  return { templateNameById, templateNameBySlug };
}

function applyChannelFilter(rows: VisitDetailRaw[], filters: VisitsFilters): VisitDetailRaw[] {
  const selectedCanales = new Set(
    (filters.canales ?? []).map((value) => (value || "").trim().toLowerCase()).filter(Boolean),
  );
  if (selectedCanales.size === 0) return rows;
  return rows.filter((row) => selectedCanales.has((row.canal || "").trim().toLowerCase()));
}

function enrichVisitRows(
  rows: VisitDetailRaw[],
  filters: VisitsFilters,
  lookup?: { templateNameById: Map<string, string>; templateNameBySlug: Map<string, string> },
): VisitDetailRaw[] {
  if (!hasAttributionFilters(filters)) {
    return rows;
  }
  const enriched: VisitDetailRaw[] = [];
  for (const row of rows) {
    try {
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
      enriched.push({
        ...row,
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        template_id: tracking.template_id,
        template_slug: tracking.template_slug,
        template_nombre:
          tracking.template_nombre ||
          lookup?.templateNameById.get(templateIdKey) ||
          lookup?.templateNameBySlug.get(templateSlugKey) ||
          null,
        template_captada: tracking.template_captada,
        referrer_host: row.referrer_host ?? null,
      });
    } catch {
    }
  }
  return enriched;
}

async function loadWebchatVisitRows(
  filters: VisitsFilters = {},
): Promise<{
  rows: VisitDetailRaw[];
  shape: "array" | "items" | "other" | "none";
  detailOk: boolean;
  detailRows: number;
  errors: string[];
}> {
  const detalleResult = await callCrmApi<WebSessionAttributionRow[]>("/crm/visitas/web-sessions", {
    withUserToken: true,
    searchParams: buildVisitsSearchParams(filters),
  });

  if (!detalleResult.ok) {
    return {
      rows: [],
      shape: "none",
      detailOk: false,
      detailRows: 0,
      errors: [detalleResult.error],
    };
  }

  const { rows: rawRows, shape } = unwrapWebSessionsPayload(detalleResult.data);
  const normalized = normalizeWebSessionRows(rawRows);
  return {
    rows: applyChannelFilter(normalized, filters),
    shape,
    detailOk: true,
    detailRows: rawRows.length,
    errors: [],
  };
}

export async function loadVisitsTableForConversionMap(
  filters: VisitsFilters = {},
): Promise<VisitTableRow[]> {
  const templatesResult = hasAttributionFilters(filters)
    ? await callCrmApi<{ items?: ContactoTemplateRow[] }>("/crm/prospeccion/contacto/templates", { withUserToken: true })
    : null;
  const webchat = await loadWebchatVisitRows(filters);
  if (webchat.errors.length) {
    throw new Error(webchat.errors[0]);
  }
  const lookup = templatesResult?.ok ? buildTemplateLookup(templatesResult.data) : undefined;
  const enrichedRows = enrichVisitRows(webchat.rows, filters, lookup);
  const filteredRows = enrichedRows.filter((row) => matchesVisitsFilters(row, filters));
  return mapTable(filteredRows, lookup);
}

export async function loadConversationsTableForConversionMap(
  filters: VisitsFilters = {},
): Promise<VisitTableRow[]> {
  const waFilterActive = hasWaAttributionFilters(filters);
  const templatesResult = hasAttributionFilters(filters)
    ? await callCrmApi<{ items?: ContactoTemplateRow[] }>("/crm/prospeccion/contacto/templates", {
        withUserToken: true,
      })
    : null;
  const webchat = await loadWebchatVisitRows(filters);
  if (webchat.errors.length) {
    throw new Error(webchat.errors[0]);
  }
  const whatsappResult = await callCrmApi<WhatsappConversationRow[]>(
    "/crm/visitas/whatsapp/conversaciones",
    {
      withUserToken: true,
      searchParams: {
        rango: filters.rango || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta || undefined,
        wa_canal_publicitario: filters.waCanalPublicitario || undefined,
        wa_campana_publicitaria: filters.waCampanaPublicitaria || undefined,
        wa_regla_id: filters.waReglaId || undefined,
        campana_id: filters.campanaId || undefined,
        campana_tipo: filters.campanaTipo || undefined,
        template_id: filters.templateId || undefined,
        limit: 500,
      },
    },
  );
  if (!whatsappResult.ok) {
    throw new Error(whatsappResult.error);
  }
  const lookup = templatesResult?.ok ? buildTemplateLookup(templatesResult.data) : undefined;
  const webchatChats = webchat.rows.filter((row) => row.tuvo_chat);
  const whatsappRows = mapWhatsappRows(whatsappResult.data);
  const baseRows = waFilterActive ? whatsappRows : [...webchatChats, ...whatsappRows];
  const merged = applyChannelFilter(baseRows, filters);
  const enriched = enrichVisitRows(merged, filters, lookup);
  const filtered = enriched.filter((row) => matchesVisitsFilters(row, filters));
  return mapTable(filtered, lookup);
}

export type ConversionMapTablesResult = {
  visitsTable: VisitTableRow[];
  conversationsTable: VisitTableRow[];
  errors: string[];
};

export type ConversionMapTableSection = "visits" | "conversations" | "both";

type ConversionMapTablesCacheEntry = {
  expiresAt: number;
  value: ConversionMapTablesResult;
};

const CONVERSION_MAP_TABLES_CACHE_TTL_MS = 45_000;
const CONVERSION_MAP_TABLES_CACHE_MAX_ENTRIES = 64;
const _CONVERSION_MAP_TABLES_CACHE = new Map<string, ConversionMapTablesCacheEntry>();

function buildConversionMapTablesCacheKey(
  filters: VisitsFilters,
  cacheScope: string | null | undefined,
  section: ConversionMapTableSection,
): string {
  return JSON.stringify({
    scope: (cacheScope || "global").trim() || "global",
    section,
    canales: (filters.canales || [])
      .map((value) => value.trim())
      .filter(Boolean)
      .sort(),
    estado: (filters.estado || "").trim().toLowerCase() || null,
    sourceClass: (filters.sourceClass || "").trim().toLowerCase() || null,
    utmSource: (filters.utmSource || "").trim().toLowerCase() || null,
    utmMedium: (filters.utmMedium || "").trim().toLowerCase() || null,
    utmCampaign: (filters.utmCampaign || "").trim().toLowerCase() || null,
    campanaId: (filters.campanaId || "").trim() || null,
    campanaTipo: (filters.campanaTipo || "").trim().toLowerCase() || null,
    templateId: (filters.templateId || "").trim() || null,
    waCanalPublicitario: (filters.waCanalPublicitario || "").trim() || null,
    waCampanaPublicitaria: (filters.waCampanaPublicitaria || "").trim() || null,
    waReglaId: (filters.waReglaId || "").trim() || null,
    rango: (filters.rango || "").trim().toLowerCase() || null,
    desde: (filters.desde || "").trim() || null,
    hasta: (filters.hasta || "").trim() || null,
  });
}

function cloneConversionMapTablesResult(result: ConversionMapTablesResult): ConversionMapTablesResult {
  return structuredClone(result);
}

export async function loadConversionMapTablesForConversionMap(
  filters: VisitsFilters = {},
  options: { cacheScope?: string | null; section?: ConversionMapTableSection } = {},
): Promise<ConversionMapTablesResult> {
  const section = options.section || "both";
  const cacheKey = buildConversionMapTablesCacheKey(filters, options.cacheScope, section)
  const now = Date.now()
  const cached = _CONVERSION_MAP_TABLES_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cloneConversionMapTablesResult(cached.value)
  }

  const templatesPromise = hasAttributionFilters(filters)
    ? callCrmApi<{ items?: ContactoTemplateRow[] }>("/crm/prospeccion/contacto/templates", {
        withUserToken: true,
      })
    : Promise.resolve(null);
  const webchatPromise = loadWebchatVisitRows(filters);
  const whatsappPromise =
    section === "visits"
      ? null
      : callCrmApi<WhatsappConversationRow[]>(
          "/crm/visitas/whatsapp/conversaciones",
          {
            withUserToken: true,
            searchParams: {
              rango: filters.rango || undefined,
              desde: filters.desde || undefined,
              hasta: filters.hasta || undefined,
              wa_canal_publicitario: filters.waCanalPublicitario || undefined,
              wa_campana_publicitaria: filters.waCampanaPublicitaria || undefined,
              wa_regla_id: filters.waReglaId || undefined,
              campana_id: filters.campanaId || undefined,
              campana_tipo: filters.campanaTipo || undefined,
              template_id: filters.templateId || undefined,
              limit: 500,
            },
          },
        );

  const [templatesResult, webchat] = await Promise.all([templatesPromise, webchatPromise]);
  const whatsappResult = whatsappPromise ? await whatsappPromise : null;

  const errors: string[] = [];
  if (templatesResult && !templatesResult.ok) errors.push(templatesResult.error);
  if (webchat.errors.length) errors.push(...webchat.errors);
  if (whatsappResult && !whatsappResult.ok) errors.push(whatsappResult.error);

  const lookup = templatesResult?.ok ? buildTemplateLookup(templatesResult.data) : undefined;
  const visitsTable = webchat.errors.length
    ? []
    : mapTable(
        enrichVisitRows(webchat.rows, filters, lookup).filter((row) =>
          matchesVisitsFilters(row, filters),
        ),
        lookup,
      );

  const whatsappRows = whatsappResult && whatsappResult.ok ? mapWhatsappRows(whatsappResult.data) : [];
  const webchatChats = webchat.rows.filter((row) => row.tuvo_chat);
  const waFilterActive = hasWaAttributionFilters(filters);
  const baseRows = waFilterActive ? whatsappRows : [...webchatChats, ...whatsappRows];
  const conversationsTable = whatsappResult && whatsappResult.ok
    ? mapTable(
        enrichVisitRows(applyChannelFilter(baseRows, filters), filters, lookup).filter((row) =>
          matchesVisitsFilters(row, filters),
        ),
        lookup,
      )
    : [];
  const finalVisitsTable = section === "conversations" ? [] : visitsTable;
  const finalConversationsTable = section === "visits" ? [] : conversationsTable;

  const payload = {
    visitsTable: finalVisitsTable,
    conversationsTable: finalConversationsTable,
    errors: Array.from(new Set(errors)),
  };
  _CONVERSION_MAP_TABLES_CACHE.set(cacheKey, {
    expiresAt: now + CONVERSION_MAP_TABLES_CACHE_TTL_MS,
    value: cloneConversionMapTablesResult(payload),
  });
  if (_CONVERSION_MAP_TABLES_CACHE.size > CONVERSION_MAP_TABLES_CACHE_MAX_ENTRIES) {
    const oldestKey = _CONVERSION_MAP_TABLES_CACHE.keys().next().value as string | undefined;
    if (oldestKey) {
      _CONVERSION_MAP_TABLES_CACHE.delete(oldestKey);
    }
  }
  return payload;
}

export async function loadVisitsData(filters: VisitsFilters = {}): Promise<VisitsPayload> {
  const [kpisResult, webchatResult, whatsappVisitResult, whatsappDetailResult, templatesResult] = await Promise.all([
    callCrmApi<DashboardKpisResponse>("/crm/visitas/kpis", { withUserToken: true }),
    loadWebchatVisitRows(filters),
    callCrmApi<VisitantesCounterResponse>("/crm/visitas/whatsapp/total", {
      withUserToken: true,
      searchParams: {
        rango: filters.rango || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta || undefined,
      },
    }),
    callCrmApi<WhatsappConversationRow[]>("/crm/visitas/whatsapp/conversaciones", {
      withUserToken: true,
      searchParams: {
        rango: filters.rango || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta || undefined,
        limit: 500,
      },
    }),
    callCrmApi<{ items?: ContactoTemplateRow[] }>("/crm/prospeccion/contacto/templates", { withUserToken: true }),
  ]);

  const errors: string[] = [];
  if (!kpisResult.ok) errors.push(kpisResult.error);
  errors.push(...webchatResult.errors);
  if (!whatsappVisitResult.ok) errors.push(whatsappVisitResult.error);
  if (!whatsappDetailResult.ok) errors.push(whatsappDetailResult.error);
  if (!templatesResult.ok) errors.push(templatesResult.error);

  const whatsappDetail = whatsappDetailResult.ok ? mapWhatsappRows(whatsappDetailResult.data) : [];
  const mergedDetalleBase: VisitDetailRaw[] = [...webchatResult.rows, ...applyChannelFilter(whatsappDetail, filters)];
  const lookup = templatesResult.ok ? buildTemplateLookup(templatesResult.data) : undefined;
  const enrichedDetalle = enrichVisitRows(mergedDetalleBase, filters, lookup);

  const filteredDetalle = enrichedDetalle.filter((row) => matchesVisitsFilters(row, filters));
  const whatsappTotal = extractTotal(whatsappVisitResult, whatsappDetail.length);
  const cards = mapCards(filters, kpisResult.ok ? kpisResult.data : undefined, filteredDetalle, whatsappTotal);
  const chart = mapChart(filteredDetalle);
  const table = mapTable(filteredDetalle, lookup);

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

      const contactId = row.persona_id || row.contacto_id || row.contacto_correo || row.contacto_nombre;
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
      row.contacto_nombre ||
      row.contacto_correo ||
      row.correo_envio ||
      row.contacto_telefono ||
      null;
    const contactIdentifier = formatContactIdentifier(row);
    const unresolvedContactLabel = isProspectionVisit(row)
      ? "Prospecto sin resolver"
      : "Visitante sin identificar";
    const header = isWhatsapp
      ? `WhatsApp · ${contactIdentifier || "Conversación"}`
      : contactLabel
        ? contactIdentifier || contactLabel
        : unresolvedContactLabel;
    const type = isWhatsapp
      ? `${resolveWhatsappLocationLabel(row) || "WhatsApp"} · WhatsApp`
      : row.contacto_origen
        ? formatContactOrigin(row.contacto_origen)
        : row.state_name ||
          row.country_name ||
          "Webchat";
    const status = row.tuvo_chat || isWhatsapp ? "Done" : "In Process";
    const target = isWhatsapp ? "1" : toNumber(row.visit_count).toString();
    const reviewer = contactIdentifier || contactLabel || "Asignar contacto";

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

function normalizeTrackingValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let raw: string;
  if (typeof value === "string") {
    raw = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    raw = String(value);
  } else {
    return null;
  }
  const cleaned = raw.trim();
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
  return normalizeAcquisitionSourceClass({
    sourceClass: row.source_class ?? null,
    referrerHost: row.referrer_host ?? null,
    referrer: row.referrer ?? null,
    landingUrl: row.landing_url ?? null,
    utmSource: row.utm_source ?? null,
    utmMedium: row.utm_medium ?? null,
    utmCampaign: row.utm_campaign ?? null,
  });
}

function formatContactOrigin(value: string | null | undefined): string {
  const cleaned = (value || "").trim().toLowerCase();
  if (!cleaned) return "Sin origen";
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatContactIdentifier(row: VisitDetailRaw): string | null {
  const email = (row.contacto_correo || row.correo_envio || "").trim();
  if (email) return email;
  const phone = (row.contacto_telefono || "").trim();
  if (phone) return phone;
  const name = (row.contacto_nombre || "").trim();
  if (name) return name;
  return null;
}

function isProspectionVisit(row: VisitDetailRaw): boolean {
  const sourceClass = (row.source_class || "").trim().toLowerCase();
  const utmSource = (row.utm_source || "").trim().toLowerCase();
  return sourceClass === "prospeccion" || utmSource === "prospeccion";
}

function matchesVisitsFilters(row: VisitDetailRaw, filters: VisitsFilters): boolean {
  const sourceClass = (filters.sourceClass || "").trim().toLowerCase();
  const utmSourceFilter = (filters.utmSource || "").trim().toLowerCase();
  const utmMediumFilter = (filters.utmMedium || "").trim().toLowerCase();
  const utmCampaignFilter = (filters.utmCampaign || "").trim().toLowerCase();
  const campanaIdFilter = (filters.campanaId || "").trim().toLowerCase();
  const campanaTipoFilter = (filters.campanaTipo || "").trim().toLowerCase();
  const templateIdFilter = (filters.templateId || "").trim().toLowerCase();
  const waCanalFilter = (filters.waCanalPublicitario || "").trim().toLowerCase();
  const waCampanaFilter = (filters.waCampanaPublicitaria || "").trim().toLowerCase();
  const waReglaFilter = (filters.waReglaId || "").trim().toLowerCase();

  if (sourceClass && resolveSourceClass(row) !== sourceClass) return false;
  if (utmSourceFilter && (normalizeTrackingValue(row.utm_source ?? null) || "") !== utmSourceFilter) return false;
  if (utmMediumFilter && (normalizeTrackingValue(row.utm_medium ?? null) || "") !== utmMediumFilter) return false;
  if (utmCampaignFilter && (normalizeTrackingValue(row.utm_campaign ?? null) || "") !== utmCampaignFilter) return false;
  if (campanaTipoFilter) {
    const value = (row.prospeccion_campana_tipo || row.canal || "").trim().toLowerCase();
    if (value !== campanaTipoFilter) return false;
  }
  if (campanaIdFilter) {
    const value = (row.prospeccion_campana_id || "").trim().toLowerCase();
    if (value !== campanaIdFilter) return false;
  }
  if (templateIdFilter) {
    const templateIdValue = normalizeTrackingValue(row.template_id ?? null) || "";
    const templateSlugValue = normalizeTrackingValue(row.template_slug ?? null) || "";
    if (templateIdValue !== templateIdFilter && templateSlugValue !== templateIdFilter) return false;
  }
  if (waCanalFilter) {
    const value = (row.wa_canal_publicitario || "").trim().toLowerCase();
    if (value !== waCanalFilter) return false;
  }
  if (waCampanaFilter) {
    const value = (row.wa_campana_publicitaria || "").trim().toLowerCase();
    if (value !== waCampanaFilter) return false;
  }
  if (waReglaFilter) {
    const value = (row.wa_regla_id || "").trim().toLowerCase();
    if (value !== waReglaFilter) return false;
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
    const contact = row.contacto && typeof row.contacto === "object" ? row.contacto : null;
    const apiLocation = row.phone_location ?? null;
    const prospeccion = row.whatsapp_prospeccion ?? {};
    const location = apiLocation
      ? {
          countryCode: apiLocation.country_code ?? null,
          countryName: apiLocation.country_name ?? null,
          lada: apiLocation.lada ?? null,
          stateCode: apiLocation.state_code ?? null,
          stateName: apiLocation.state_name ?? null,
          municipalityCode: apiLocation.municipality_code ?? null,
          municipalityName: apiLocation.municipality_name ?? null,
          municipalityCvegeo: apiLocation.municipality_cvegeo ?? null,
        }
      : {
          countryCode: null,
          countryName: null,
          lada: null,
          stateCode: null,
          stateName: null,
          municipalityCode: null,
          municipalityName: null,
          municipalityCvegeo: null,
        };
    const atribucion = row.whatsapp_atribucion ?? {};
    const templateId =
      atribucion.template_id ??
      prospeccion.template_id ??
      null;
    const templateSlug =
      atribucion.template_slug ??
      prospeccion.template_slug ??
      null;
    const templateNombre =
      atribucion.template_nombre ??
      prospeccion.template_nombre ??
      null;
    const sourceClass =
      atribucion.regla_id || atribucion.canal_publicitario || atribucion.campana_publicitaria
        ? "publicidad_whatsapp"
        : (prospeccion.campana_id || prospeccion.batch_id || prospeccion.template_id || prospeccion.template_slug)
          ? "prospeccion_whatsapp"
          : null;
    const personaId =
      row.persona_id ??
      contact?.persona_id ??
      row.contacto_id ??
      null;
    const contactoNombre =
      row.contacto_nombre ??
      contact?.nombre_completo ??
      null;
    const contactoCorreo =
      row.contacto_correo ??
      contact?.correo ??
      null;
    const contactoTelefono =
      row.contacto_telefono ??
      contact?.telefono_e164 ??
      null;
    return {
      session_id: `whatsapp-${row.id}`,
      oportunidad_id: null,
      canal: "whatsapp",
      prospeccion_batch_id: prospeccion.batch_id ?? null,
      prospeccion_batch_label: prospeccion.batch_label ?? null,
      prospeccion_campana_id: prospeccion.campana_id ?? null,
      prospeccion_campana_nombre: prospeccion.campana_nombre ?? null,
      prospeccion_campana_tipo: prospeccion.campana_tipo ?? null,
      wa_canal_publicitario: atribucion.canal_publicitario ?? null,
      wa_campana_publicitaria: atribucion.campana_publicitaria ?? null,
      wa_regla_id: atribucion.regla_id ?? null,
      wa_regla_nombre: atribucion.regla_nombre ?? null,
      wa_regla_frase: atribucion.regla_frase ?? null,
      whatsapp_atribucion: row.whatsapp_atribucion ?? null,
      whatsapp_prospeccion: row.whatsapp_prospeccion ?? null,
      phone_location: apiLocation
        ? {
            country_code: apiLocation.country_code ?? null,
            country_name: apiLocation.country_name ?? null,
            state_code: apiLocation.state_code ?? null,
            state_name: apiLocation.state_name ?? null,
            municipality_code: apiLocation.municipality_code ?? null,
            municipality_name: apiLocation.municipality_name ?? null,
            municipality_cvegeo: apiLocation.municipality_cvegeo ?? null,
            lada: apiLocation.lada ?? null,
            ok: apiLocation.ok ?? null,
          }
        : null,
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
      persona_id: personaId,
      contacto_id: row.contacto_id ?? null,
      contacto_nombre: contactoNombre,
      contacto_correo: contactoCorreo,
      contacto_telefono: contactoTelefono,
      contacto_empresa: null,
      contacto_estado: contact?.estado ?? null,
      contacto_captura: contact?.origen ?? null,
      contacto_creado_en: contact?.creado_en ?? null,
      country_code: location.countryCode,
      country_name: location.countryName,
      state_name: location.stateName,
      state_code: location.stateCode,
      city_name: location.municipalityName,
      cve_ent: location.stateCode,
      nom_ent: location.stateName,
      cve_mun: location.municipalityCode,
      nom_mun: location.municipalityName,
      cvegeo: location.municipalityCvegeo,
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
      source_class: sourceClass,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      template_id: templateId,
      template_slug: templateSlug,
      template_nombre: templateNombre,
      template_captada: Boolean(
        templateId || templateSlug || templateNombre,
      ),
      geo: null,
      total_rows: null,
      total_chat_rows: null,
      total_no_chat_rows: null,
    };
  });
}

function resolveWhatsappLocationLabel(row: VisitDetailRaw): string | null {
  const phoneLocation = row.phone_location as
    | {
        state_name?: string | null;
        municipality_name?: string | null;
        country_name?: string | null;
        country_code?: string | null;
        lada?: string | null;
        ok?: boolean | null;
      }
    | null
    | undefined;

  const municipalityName = row.city_name || row.nom_mun || phoneLocation?.municipality_name || null;
  const stateName = row.state_name || row.nom_ent || phoneLocation?.state_name || null;
  const countryCode = (row.country_code || phoneLocation?.country_code || "").trim().toUpperCase();
  const countryName = row.country_name || phoneLocation?.country_name || null;
  const lada = row.contacto_telefono || phoneLocation?.lada || null;

  if (countryCode && countryCode !== "MX") {
    return countryName ? `${countryName} (${countryCode})` : countryCode;
  }
  if (municipalityName && stateName) {
    return `${municipalityName}, ${stateName}`;
  }
  if (stateName) {
    return stateName;
  }
  if (municipalityName) {
    return municipalityName;
  }
  if (countryName && lada) {
    return `${countryName} · LADA ${lada}`;
  }
  return countryName || null;
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
