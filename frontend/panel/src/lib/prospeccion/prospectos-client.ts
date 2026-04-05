import { refreshSession, shouldAttemptSessionRefresh } from "@/lib/auth/session-refresh"

const RETRYABLE_STATUS = new Set([502, 503, 504, 522, 524])

import type { BuscadorJob } from "./buscador-client"

export type ProspectoItem = {
  id: string
  display_name: string | null
  actividad: string | null
  estrato?: string | null
  phone: string | null
  phone_e164?: string | null
  email: string | null
  website: string | null
  address: string | null
  fuente: "google_places" | "denue" | "usuario"
  fuente_busqueda?: string | null
  segmento?: string | null
  lookup_status?: string | null
  whatsapp_permitido?: boolean | null
  llamada_permitida?: boolean | null
  carrier_type?: string | null
  rating?: number | null
  distancia_m?: number | null
  creado_en?: string | null
  scraper_ejecutado?: boolean | null
  scraper_ultimo_en?: string | null
  scraper_ultimo_estado?: string | null
  metadata?: Record<string, unknown> | null
}

export type ProspectosTableColumnPreference =
  | "prospecto"
  | "correo"
  | "sitio_web"
  | "telefono"
  | "tipo_linea"
  | "telefono_verificado"
  | "fuente"
  | "tamano_rating"
  | "campana"
  | "con_envio"
  | "creado"

export type ProspectosTablePreferences = {
  order?: ProspectosTableColumnPreference[]
  visibility?: Partial<Record<ProspectosTableColumnPreference, boolean>>
}

export type ProspectosSavedView = {
  id: string
  name: string
  state: Record<string, unknown>
}

export type ProspectoFiltroInput = {
  search?: string | null
  fuente?: "google_places" | "denue" | "usuario" | ""
  lookup_status?: string | null
  segmento?: string | null
  carrier_type?: "mobile" | "landline" | "voip" | ""
  stage?: "discover" | "enrich" | "prepare" | "launch" | "evaluate" | ""
  whatsapp_permitido?: boolean | null
  llamada_permitida?: boolean | null
}

export type ProspeccionCanalConfigInput = {
  canal: "correo" | "whatsapp" | "llamada"
  template_id?: string
  subject?: string | null
  body?: string | null
  body_html?: string | null
  message?: string | null
  programado_en?: string | null
  metadata?: Record<string, unknown>
}

export type ProspeccionLista = {
  id: string
  nombre: string
  descripcion?: string | null
  filtros: Record<string, unknown>
  metadata?: Record<string, unknown> | null
  total_estimado?: number | null
}

export type ProspeccionCampanaBatch = {
  id: string
  campana_id?: string | null
  campana_nombre?: string | null
  titulo?: string | null
  estado?: string | null
  total_prospectos?: number | null
  canales: string[]
  programacion: Record<string, unknown>
  filtros: Record<string, unknown>
  metadata: Record<string, unknown>
  lista_id?: string | null
  creado_en?: string | null
  totales: Record<string, number>
}

export type ProspeccionCampanaGroup = {
  campana_id?: string | null
  campana_nombre?: string | null
  totales: Record<string, number>
  batches: ProspeccionCampanaBatch[]
}

export type ProspeccionCampanaAtribucionItem = {
  campana_id?: string | null
  campana_nombre?: string | null
  canal?: string | null
  template_id?: string | null
  template_slug?: string | null
  template_nombre?: string | null
  twilio_content_sid?: string | null
  envios_totales: number
  envios_enviados: number
  envios_entregados: number
  envios_fallidos: number
  envios_omitidos: number
  envios_respondidos: number
  envios_pendientes?: number | null
  envios_procesando?: number | null
  envios_enviados_puros?: number | null
  brevo_aperturas: number
  brevo_clicks: number
  sesiones_utm: number
  tasa_entrega_pct: number
  tasa_respuesta_pct: number
  click_to_session_pct: number
}

export type ProspeccionCampanaDuplicateDefaults = {
  campana: {
    id: string
    nombre?: string | null
    descripcion?: string | null
  }
  defaults: {
    campana_id?: string | null
    campana_nombre?: string | null
    titulo?: string | null
    source?: "selected" | "lista" | "filters"
    lista_id?: string | null
    filtros?: ProspectoFiltroInput
    canales?: Record<
      "correo" | "whatsapp" | "llamada",
      {
        enabled?: boolean
        templateSlug?: string | null
        subject?: string | null
        body?: string | null
        message?: string | null
        schedule?: string | null
      }
    >
    programacion?: Record<string, string>
    separacion_segundos?: number | null
  }
}

export type CrmCampaign = {
  id: string
  nombre: string
  tipo?: string | null
  canal?: string | null
  presupuesto?: number | null
  fecha_inicio?: string | null
  fecha_fin?: string | null
  metadata?: Record<string, unknown> | null
}

export type ProspectosResponse = {
  ok: boolean
  items: ProspectoItem[]
  total: number
  limit: number
  offset: number
}

export type ProspectosBootstrapResponse = {
  ok: boolean
  prospectos: ProspectosResponse
  metadata: {
    ok: boolean
    queries: ProspectoQueryOption[]
    activities: string[]
    segmentos: string[]
  }
  preferences?: Record<string, unknown> | null
}

export type ProspectoGuardarResponse = {
  ok: boolean
  total: number
  prospectos: ProspectoItem[]
}

export type ProspectoLookupResponse = {
  ok: boolean
  procesados: number
  detalles: Array<{ prospecto_id: string; lookup_status?: string | null; carrier_type?: string | null }>
}

export type ChecklistLookupResponse = ProspectoLookupResponse & {
  prospecto_ids?: string[]
}

export type ProspectoContactarResponse = {
  ok: boolean
  batch_id: string
  contactos: ProspectoContactoResumen[]
  omitidos?: ProspeccionOmitido[]
}

export type ContactarProspectosPayload = {
  prospecto_ids?: string[]
  correo_asunto?: string
  correo_cuerpo?: string
  whatsapp_mensaje?: string
  llamada_notas?: string
  lista_id?: string
  filtros?: ProspectoFiltroInput
  canales?: ProspeccionCanalConfigInput[]
  campana_id?: string
  batch_titulo?: string
  separacion_segundos?: number
}

export type ProspectoContactoResumen = {
  prospecto_id: string
  correo?: string
  whatsapp?: string
  llamada?: string
  display_name?: string | null
  email?: string | null
  telefono?: string | null
  segmento?: string | null
  stage?: string | null
}

export type ProspectoCanalIndicator = {
  total?: number | null
  pendientes?: number | null
  exitosos?: number | null
  fallidos?: number | null
  omitidos?: number | null
  cancelados?: number | null
  ultimo_estado?: string | null
  ultima_actividad_en?: string | null
}

export type ProspectoContactIndicators = {
  prospecto_id: string
  canales?: Record<string, ProspectoCanalIndicator> | null
  total_envios?: number | null
  ultimo_contacto_en?: string | null
  total_respuestas?: number | null
  respondio?: boolean | null
  ultima_respuesta_en?: string | null
}

export type ProspeccionOmitido = {
  motivo: string
  prospecto_ids: string[]
  total: number
}

export type ProspectoAuditEntry = {
  id: string
  accion: "insert" | "update" | "delete"
  cambios: Record<string, unknown>
  realizado_por?: string | null
  realizado_en: string
}

export type ChecklistScraperResponse = {
  ok: boolean
  programados: number
  jobs: BuscadorJob[]
}

export async function getProspectosTablePreferences(): Promise<ProspectosTablePreferences | null> {
  const response = await requestJson<{
    ok: boolean
    preferences?: ProspectosTablePreferences | null
  }>("/api/prospeccion/prospectos/preferences")
  return response.preferences ?? null
}

export async function saveProspectosTablePreferences(
  preferences: ProspectosTablePreferences
): Promise<ProspectosTablePreferences | null> {
  const response = await requestJson<{
    ok: boolean
    preferences?: ProspectosTablePreferences | null
  }>("/api/prospeccion/prospectos/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  })
  return response.preferences ?? null
}

export async function listProspectosSavedViews(): Promise<ProspectosSavedView[]> {
  const response = await requestJson<{
    ok: boolean
    views?: ProspectosSavedView[]
  }>("/api/prospeccion/prospectos/views")
  return Array.isArray(response.views) ? response.views : []
}

export async function saveProspectosSavedViews(views: ProspectosSavedView[]): Promise<ProspectosSavedView[]> {
  const response = await requestJson<{
    ok: boolean
    views?: ProspectosSavedView[]
  }>("/api/prospeccion/prospectos/views", {
    method: "PUT",
    body: JSON.stringify({ views }),
  })
  return Array.isArray(response.views) ? response.views : []
}

export type ContactoBatch = {
  id: string
  iniciado_por?: string | null
  canales: string[]
  total_prospectos: number
  estado: string
  programado_en?: string | null
  finalizado_en?: string | null
  metadata?: Record<string, unknown> | null
  creado_en?: string | null
  campana_id?: string | null
  lista_id?: string | null
  titulo?: string | null
  filtros?: Record<string, unknown> | null
  programacion?: Record<string, unknown> | null
  totales?: Record<string, number> | null
  total_envios?: number | null
}

export type ContactoEnvio = {
  id: string
  batch_id: string
  prospecto_id: string
  canal: "correo" | "whatsapp" | "llamada"
  estado: string
  detalle?: Record<string, unknown> | null
  mensaje_id?: string | null
  sesiones_utm?: number | null
  programado_en?: string | null
  procesado_en?: string | null
}

export type ContactoLog = {
  id: string
  prospecto_id: string
  canal: string
  accion?: string | null
  estado: string
  detalle?: Record<string, unknown> | null
  error?: string | null
  creado_en?: string | null
  batch_id?: string | null
  envio_id?: string | null
}

export type ContactoBatchResumen = {
  ok: boolean
  batch: ContactoBatch
  totales: Record<string, number>
  total_envios: number
}

export type ContactoTemplate = {
  id: string
  canal: "correo" | "whatsapp" | "llamada"
  slug: string
  nombre: string
  descripcion?: string | null
  asunto?: string | null
  cuerpo_texto?: string | null
  cuerpo_html?: string | null
  activo?: boolean
  metadata?: Record<string, unknown> | null
}

export type WhatsAppAtribucionTipoMatch = "exacta" | "contiene" | "regex"

export type WhatsAppAtribucionRule = {
  id: string
  parent_regla_id?: string | null
  version?: number | null
  vigente_desde?: string | null
  vigente_hasta?: string | null
  nombre_regla: string
  canal_publicitario: string
  frase_objetivo: string
  frase_normalizada?: string | null
  tipo_match: WhatsAppAtribucionTipoMatch
  campana_publicitaria?: string | null
  adset?: string | null
  anuncio?: string | null
  prioridad: number
  activo: boolean
  metadata?: Record<string, unknown> | null
  creado_en?: string | null
  actualizado_en?: string | null
}

export type WhatsAppAtribucionRuleInput = {
  nombre_regla: string
  canal_publicitario: string
  frase_objetivo: string
  tipo_match: WhatsAppAtribucionTipoMatch
  campana_publicitaria?: string | null
  adset?: string | null
  anuncio?: string | null
  prioridad?: number
  activo?: boolean
  metadata?: Record<string, unknown> | null
}

export type WhatsAppAtribucionRuleUpdateInput = Partial<WhatsAppAtribucionRuleInput>

export type WhatsAppAtribucionSimulation = {
  ok: boolean
  match: boolean
  frase_normalizada: string
  applied_match_type?: WhatsAppAtribucionTipoMatch | null
  regla?: WhatsAppAtribucionRule | null
}

export type BrevoCatalogTemplate = {
  id: number
  name: string
  subject?: string | null
  is_active: boolean
  updated_at?: string | null
}

export type ProspectoManualInput = {
  display_name: string
  actividad?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  segmento?: string | null
  metadata?: Record<string, unknown> | null
}

export type ProspectoUpdateInput = Partial<ProspectoManualInput>

/**
 * Build an absolute URL when the code runs on the client, otherwise fall back to env origin.
 */
function buildClientUrl(path: string): URL {
  const origin =
    typeof window === "undefined" ? process.env.NEXT_PUBLIC_PANEL_ORIGIN || "http://localhost" : window.location.origin
  return new URL(path, origin)
}

/**
 * Parse JSON responses, surfacing backend error details when possible.
 */
async function requestJson<T>(input: string, init?: RequestInit, retryAuth = true, retryNetwork = true): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    })
  } catch (error) {
    if (retryNetwork) {
      await delay(400)
      return requestJson<T>(input, init, retryAuth, false)
    }
    const message = error instanceof Error ? error.message : null
    throw new Error(message || "Error de red al contactar el backend.")
  }

  const rawText = await response.text()
  let data: unknown = null
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = rawText
    }
  }

  if (!response.ok) {
    if (retryAuth && shouldAttemptSessionRefresh(response.status, data)) {
      const refreshed = await refreshSession()
      if (refreshed) {
        return requestJson<T>(input, init, false, retryNetwork)
      }
    }
    if (retryNetwork && RETRYABLE_STATUS.has(response.status)) {
      await delay(400)
      return requestJson<T>(input, init, retryAuth, false)
    }
    const detail =
      extractStringField(data, "detail") ||
      extractStringField(data, "error") ||
      extractStringField(data, "message") ||
      (typeof rawText === "string" && rawText.trim().length ? rawText : null) ||
      `Error ${response.status}`
    if (detail === "twilio_not_configured" || detail.includes("Twilio credentials are not configured")) {
      throw new Error("Twilio no está configurado (faltan credenciales). Configura `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` en el backend.")
    }
    if (detail === "whatsapp_template_required") {
      throw new Error(
        "WhatsApp de prospección en frío requiere plantilla aprobada. Configura `whatsapp.templates.sales` o selecciona una plantilla con `twilio_content_sid`."
      )
    }
    if (detail.startsWith("brevo_daily_quota_exceeded:")) {
      const parts = detail.split(":")
      const remaining = Number.parseInt(parts[1] ?? "", 10)
      const requested = Number.parseInt(parts[2] ?? "", 10)
      const quotaDay = parts[3] ?? ""
      if (Number.isFinite(remaining) && Number.isFinite(requested)) {
        const dayLabel = quotaDay ? ` (día Brevo UTC ${quotaDay})` : ""
        throw new Error(
          `No hay cupo suficiente en Brevo para este lote${dayLabel}. Restantes: ${remaining}. Intentas enviar: ${requested}.`
        )
      }
      throw new Error("Se alcanzó la cuota diaria de Brevo para correo.")
    }
    throw new Error(detail)
  }

  return (data as T) ?? ({} as T)
}

/**
 * List saved prospects with optional filters for fuente, lookup status or search term.
 */
type ListProspectosParams = {
  limit?: number
  offset?: number
  search?: string
  fuente?: "google_places" | "denue" | "usuario"
  lookupStatus?: string
  segmento?: string
  carrierType?: "mobile" | "landline" | "voip"
  order?: "creado" | "nombre"
  stage?: "discover" | "enrich" | "prepare" | "launch" | "evaluate"
  whatsappPermitido?: boolean
  llamadaPermitida?: boolean
  phonePresent?: boolean
  emailPresent?: boolean
  websitePresent?: boolean
  metadataQueries?: string[]
  actividades?: string[]
  dateFrom?: string
  dateTo?: string
  geoEstado?: string
  geoMunicipio?: string
  minRating?: number
  estratoGroup?: "micro" | "pequena" | "mediana" | "grande"
  campanaId?: string
  conEnvio?: boolean
  conScraper?: boolean
  includeScraperStatus?: boolean
}

function buildProspectosListUrl(basePath: string, params: ListProspectosParams = {}): URL {
  const url = buildClientUrl(basePath)
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.search?.trim().length) url.searchParams.set("search", params.search.trim())
  if (params.fuente) url.searchParams.set("fuente", params.fuente)
  if (params.lookupStatus?.trim().length) url.searchParams.set("lookup_status", params.lookupStatus.trim())
  if (params.segmento?.trim().length) url.searchParams.set("segmento", params.segmento.trim())
  if (params.carrierType) url.searchParams.set("carrier_type", params.carrierType)
  if (params.order) url.searchParams.set("order", params.order)
  if (params.stage) url.searchParams.set("stage", params.stage)
  if (typeof params.whatsappPermitido === "boolean") {
    url.searchParams.set("whatsapp_permitido", params.whatsappPermitido ? "true" : "false")
  }
  if (typeof params.llamadaPermitida === "boolean") {
    url.searchParams.set("llamada_permitida", params.llamadaPermitida ? "true" : "false")
  }
  if (typeof params.phonePresent === "boolean") {
    url.searchParams.set("phone_present", params.phonePresent ? "true" : "false")
  }
  if (typeof params.emailPresent === "boolean") {
    url.searchParams.set("email_present", params.emailPresent ? "true" : "false")
  }
  if (typeof params.websitePresent === "boolean") {
    url.searchParams.set("website_present", params.websitePresent ? "true" : "false")
  }
  if (params.dateFrom) {
    url.searchParams.set("date_from", params.dateFrom)
  }
  if (params.dateTo) {
    url.searchParams.set("date_to", params.dateTo)
  }
  if (params.geoEstado?.trim().length) {
    url.searchParams.set("geo_estado", params.geoEstado.trim())
  }
  if (params.geoMunicipio?.trim().length) {
    url.searchParams.set("geo_municipio", params.geoMunicipio.trim())
  }
  if (typeof params.minRating === "number") {
    url.searchParams.set("min_rating", String(params.minRating))
  }
  if (params.estratoGroup) {
    url.searchParams.set("estrato_group", params.estratoGroup)
  }
  if (params.campanaId?.trim().length) {
    url.searchParams.set("campana_id", params.campanaId.trim())
  }
  if (typeof params.conEnvio === "boolean") {
    url.searchParams.set("con_envio", params.conEnvio ? "true" : "false")
  }
  if (typeof params.conScraper === "boolean") {
    url.searchParams.set("con_scraper", params.conScraper ? "true" : "false")
  }
  if (typeof params.includeScraperStatus === "boolean") {
    url.searchParams.set("include_scraper_status", params.includeScraperStatus ? "true" : "false")
  }
  if (params.metadataQueries?.length) {
    for (const value of params.metadataQueries) {
      const trimmed = value?.trim()
      if (trimmed) {
        url.searchParams.append("metadata_query", trimmed)
      }
    }
  }
  if (params.actividades?.length) {
    for (const value of params.actividades) {
      const trimmed = value?.trim()
      if (trimmed) {
        url.searchParams.append("actividad", trimmed)
      }
    }
  }
  return url
}

export async function listProspectos(params: ListProspectosParams = {}): Promise<ProspectosResponse> {
  const url = buildProspectosListUrl("/api/prospeccion/prospectos", params)
  return requestJson<ProspectosResponse>(url.toString())
}

export async function listProspectosBootstrap(
  params: ListProspectosParams & {
    queryFilters?: string[]
    includePreferences?: boolean
  } = {}
): Promise<ProspectosBootstrapResponse> {
  const url = buildProspectosListUrl("/api/prospeccion/prospectos/bootstrap", params)
  if (params.queryFilters?.length) {
    for (const value of params.queryFilters) {
      const trimmed = value?.trim()
      if (trimmed) {
        url.searchParams.append("query", trimmed)
      }
    }
  }
  if (typeof params.includePreferences === "boolean") {
    url.searchParams.set("include_preferences", params.includePreferences ? "true" : "false")
  }
  return requestJson<ProspectosBootstrapResponse>(url.toString())
}

export type ProspectoQueryOption = {
  value: string
  label: string
  count?: number
  created_at?: string | null
  estado?: string | null
  municipio?: string | null
}

type ProspectosQueryMetadataResult = {
  queries: ProspectoQueryOption[]
  activities: string[]
  segmentos: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const prospectosQueryMetadataInflight = new Map<string, Promise<ProspectosQueryMetadataResult>>()

function buildProspectosQueryMetadataInflightKey(params?: {
  queries?: string[]
  fuente?: "google_places" | "denue" | "usuario"
  dateFrom?: string
  dateTo?: string
}): string {
  const normalizedQueries = Array.from(
    new Set((params?.queries ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  ).sort()
  return JSON.stringify({
    queries: normalizedQueries,
    fuente: params?.fuente ?? "",
    dateFrom: params?.dateFrom ?? "",
    dateTo: params?.dateTo ?? "",
  })
}

export async function listProspectosQueryMetadata(params?: {
  queries?: string[]
  fuente?: "google_places" | "denue" | "usuario"
  dateFrom?: string
  dateTo?: string
}): Promise<ProspectosQueryMetadataResult> {
  const inflightKey = buildProspectosQueryMetadataInflightKey(params)
  const existingRequest = prospectosQueryMetadataInflight.get(inflightKey)
  if (existingRequest) {
    return existingRequest
  }
  const requestPromise = (async (): Promise<ProspectosQueryMetadataResult> => {
  const url = buildClientUrl("/api/prospeccion/prospectos/queries")
  if (params?.queries?.length) {
    for (const query of params.queries) {
      const trimmed = query?.trim()
      if (trimmed) {
        url.searchParams.append("query", trimmed)
      }
    }
  }
  if (params?.fuente) {
    url.searchParams.set("fuente", params.fuente)
  }
  if (params?.dateFrom) {
    url.searchParams.set("date_from", params.dateFrom)
  }
  if (params?.dateTo) {
    url.searchParams.set("date_to", params.dateTo)
  }
  const response = await requestJson<{
    queries: Array<
      | string
      | {
          value: string
          label?: string
          count?: number
          created_at?: string | null
          estado?: string | null
          municipio?: string | null
        }
    >
    activities: string[]
    segmentos?: string[]
  }>(url.toString())
  const normalizedQueries = (response.queries ?? [])
    .map((item) => {
      if (typeof item === "string") {
        return { value: item, label: item, count: undefined, created_at: null, estado: null, municipio: null }
      }
      return {
        value: item.value,
        label: item.label ?? item.value,
        count: item.count,
        created_at: item.created_at ?? null,
        estado: item.estado ?? null,
        municipio: item.municipio ?? null,
      }
    })
    .filter((item) => item.value)
  return {
    queries: normalizedQueries,
    activities: response.activities ?? [],
    segmentos: response.segmentos ?? [],
  }
  })()
  prospectosQueryMetadataInflight.set(inflightKey, requestPromise)
  try {
    return await requestPromise
  } finally {
    prospectosQueryMetadataInflight.delete(inflightKey)
  }
}

/**
 * Persist selected results from Google or DENUE searches as prospects.
 */
export async function guardarProspectos(payload: {
  fuente: "google_places" | "denue"
  resultado_ids: string[]
  segmento?: string
  metadata?: Record<string, unknown>
}): Promise<ProspectoGuardarResponse> {
  return requestJson<ProspectoGuardarResponse>("/api/prospeccion/prospectos", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * Run phone verification for the provided prospect IDs.
 */
export async function verificarProspectos(payload: {
  prospecto_ids: string[]
  country_code?: string
  reintentar?: boolean
  proveedor?: "gratis" | "twilio"
}): Promise<ProspectoLookupResponse> {
  const prospectoIds = payload.prospecto_ids
    .map((id) => (id || "").trim())
    .filter((id) => UUID_RE.test(id))
  if (!prospectoIds.length) {
    throw new Error("No hay prospectos válidos para verificar.")
  }
  return requestJson<ProspectoLookupResponse>("/api/prospeccion/prospectos/verificar-telefonos", {
    method: "POST",
    body: JSON.stringify({
      proveedor: payload.proveedor ?? "gratis",
      ...payload,
      prospecto_ids: prospectoIds,
    }),
  })
}

export async function ejecutarChecklistLookup(payload: {
  limit?: number
  reintentar?: boolean
  countryCode?: string
  proveedor?: "gratis" | "twilio"
} = {}): Promise<ChecklistLookupResponse> {
  const body: Record<string, unknown> = {}
  body.proveedor = payload.proveedor ?? "gratis"
  if (typeof payload.limit === "number") {
    body.limit = payload.limit
  }
  if (typeof payload.reintentar === "boolean") {
    body.reintentar = payload.reintentar
  }
  if (payload.countryCode?.trim().length) {
    body.country_code = payload.countryCode.trim().toUpperCase()
  }
  return requestJson<ChecklistLookupResponse>("/api/prospeccion/prospectos/checklist/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function ejecutarChecklistScraper(payload: {
  limit?: number
  mode?: "generic" | "government" | "intelligent" | "auto" | "stealth"
  maxPages?: number
  maxDepth?: number
  maxRuntime?: number
  prospectoIds?: string[]
} = {}): Promise<ChecklistScraperResponse> {
  const body: Record<string, unknown> = {}
  if (typeof payload.limit === "number") {
    body.limit = payload.limit
  }
  if (payload.mode) {
    body.mode = payload.mode
  }
  if (typeof payload.maxPages === "number") {
    body.max_pages = payload.maxPages
  }
  if (typeof payload.maxDepth === "number") {
    body.max_depth = payload.maxDepth
  }
  if (typeof payload.maxRuntime === "number") {
    body.max_runtime = payload.maxRuntime
  }
  if (Array.isArray(payload.prospectoIds)) {
    for (const id of payload.prospectoIds) {
      const trimmed = (id || "").trim()
      if (UUID_RE.test(trimmed)) {
        if (!Array.isArray(body.prospecto_ids)) {
          body.prospecto_ids = []
        }
        ;(body.prospecto_ids as string[]).push(trimmed)
      }
    }
  }
  return requestJson<ChecklistScraperResponse>("/api/prospeccion/prospectos/checklist/scraper", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/**
 * Schedule outbound contact (correo, WhatsApp o llamada) for the selected prospects.
 */
export async function contactarProspectos(payload: ContactarProspectosPayload): Promise<ProspectoContactarResponse> {
  return requestJson<ProspectoContactarResponse>("/api/prospeccion/prospectos/contactar", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function listProspeccionListas(params: {
  limit?: number
  offset?: number
  search?: string
} = {}): Promise<{ ok: boolean; items: ProspeccionLista[]; total: number; limit: number; offset: number }> {
  const url = buildClientUrl("/api/prospeccion/contacto/listas")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.search?.trim().length) url.searchParams.set("search", params.search.trim())
  return requestJson(url.toString())
}

export async function createProspeccionLista(payload: {
  nombre: string
  descripcion?: string
  filtros: ProspectoFiltroInput
  metadata?: Record<string, unknown>
}): Promise<{ ok: boolean; lista: ProspeccionLista }> {
  return requestJson("/api/prospeccion/contacto/listas", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateProspeccionLista(
  listaId: string,
  payload: Partial<Omit<ProspeccionLista, "id" | "filtros">> & { filtros?: ProspectoFiltroInput }
): Promise<{ ok: boolean; lista: ProspeccionLista }> {
  return requestJson(`/api/prospeccion/contacto/listas/${listaId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteProspeccionLista(listaId: string): Promise<void> {
  await requestJson(`/api/prospeccion/contacto/listas/${listaId}`, {
    method: "DELETE",
  })
}

export async function getProspeccionCampanas(limit?: number) {
  const url = buildClientUrl("/api/prospeccion/campanas")
  if (typeof limit === "number") url.searchParams.set("limit", String(limit))
  return requestJson<{ ok: boolean; items: ProspeccionCampanaGroup[] }>(url.toString())
}

export async function getProspeccionCampanaAtribucion(params: { campana_id?: string; limit?: number } = {}) {
  const url = buildClientUrl("/api/prospeccion/campanas/atribucion")
  if (params.campana_id?.trim()) {
    url.searchParams.set("campana_id", params.campana_id.trim())
  }
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit))
  }
  return requestJson<{ ok: boolean; items: ProspeccionCampanaAtribucionItem[] }>(url.toString())
}

export async function listWhatsAppAtribucionReglas(params: {
  limit?: number
  offset?: number
  canal_publicitario?: string
  activo?: boolean
  search?: string
  include_historial?: boolean
} = {}) {
  const url = buildClientUrl("/api/prospeccion/whatsapp/atribucion/reglas")
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit))
  }
  if (typeof params.offset === "number") {
    url.searchParams.set("offset", String(params.offset))
  }
  if (params.canal_publicitario?.trim()) {
    url.searchParams.set("canal_publicitario", params.canal_publicitario.trim())
  }
  if (typeof params.activo === "boolean") {
    url.searchParams.set("activo", params.activo ? "true" : "false")
  }
  if (params.search?.trim()) {
    url.searchParams.set("search", params.search.trim())
  }
  if (typeof params.include_historial === "boolean") {
    url.searchParams.set("include_historial", params.include_historial ? "true" : "false")
  }
  return requestJson<{
    ok: boolean
    items: WhatsAppAtribucionRule[]
    total: number
    limit: number
    offset: number
  }>(url.toString())
}

export async function createWhatsAppAtribucionRegla(payload: WhatsAppAtribucionRuleInput) {
  return requestJson<{ ok: boolean; regla: WhatsAppAtribucionRule }>("/api/prospeccion/whatsapp/atribucion/reglas", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateWhatsAppAtribucionRegla(reglaId: string, payload: WhatsAppAtribucionRuleUpdateInput) {
  return requestJson<{ ok: boolean; regla: WhatsAppAtribucionRule; versionado?: boolean; regla_anterior_id?: string }>(
    `/api/prospeccion/whatsapp/atribucion/reglas/${reglaId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  )
}

export async function deleteWhatsAppAtribucionRegla(reglaId: string) {
  await requestJson(`/api/prospeccion/whatsapp/atribucion/reglas/${reglaId}`, {
    method: "DELETE",
  })
}

export async function simulateWhatsAppAtribucionRegla(payload: { frase: string; include_inactive?: boolean }) {
  return requestJson<WhatsAppAtribucionSimulation>("/api/prospeccion/whatsapp/atribucion/reglas/simular", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function getProspeccionCampanaPreset(campanaId: string) {
  return requestJson<{ ok: boolean } & ProspeccionCampanaDuplicateDefaults>(
    `/api/prospeccion/campanas/${campanaId}/duplicar`
  )
}

export async function updateProspeccionCampana(
  campanaId: string,
  payload: {
    campana_nombre?: string
    batch_titulo?: string
    lista_id?: string | null
    filtros?: ProspectoFiltroInput
    canales?: ProspeccionCanalConfigInput[]
    separacion_segundos?: number
  }
) {
  return requestJson<{
    ok: boolean
    campana_id: string
    batch_id: string
    contactos: ProspectoContactoResumen[]
    omitidos?: ProspeccionOmitido[]
  }>(`/api/prospeccion/campanas/${campanaId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteProspeccionCampana(campanaId: string) {
  return requestJson<{ ok: boolean; campana_id: string; envios_cancelados: number }>(
    `/api/prospeccion/campanas/${campanaId}`,
    { method: "DELETE", body: JSON.stringify({}) }
  )
}

export async function listCrmCampaigns() {
  return requestJson<CrmCampaign[]>("/api/prospeccion/crm/campanas")
}

export async function createCrmCampaign(payload: {
  nombre: string
  tipo?: string
  canal: "correo" | "whatsapp" | "llamada"
  presupuesto?: number
  fecha_inicio?: string
  fecha_fin?: string
  metadata?: Record<string, unknown>
}) {
  return requestJson<CrmCampaign>("/api/prospeccion/crm/campanas", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export type ConvertirProspectoPayload = {
  nombre?: string
  correo?: string
  telefono?: string
  company_name?: string
  notas?: string
  stage?: "discover" | "enrich" | "prepare" | "launch" | "evaluate"
  canal_origen?: "correo" | "whatsapp" | "llamada" | "otro"
}

export async function convertirProspectoAContacto(prospectoId: string, payload: ConvertirProspectoPayload) {
  return requestJson<{ ok: boolean; prospecto: ProspectoItem; contacto: Record<string, unknown> }>(
    `/api/prospeccion/prospectos/${prospectoId}/convertir-contacto`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )
}

export async function listContactoBatches(params: {
  limit?: number
  offset?: number
  estado?: string
  order?: "reciente" | "antiguo"
} = {}): Promise<{ ok: boolean; items: ContactoBatch[]; total: number; limit: number; offset: number }> {
  const url = buildClientUrl("/api/prospeccion/contacto/batches")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.estado?.trim()) url.searchParams.set("estado", params.estado.trim())
  if (params.order) url.searchParams.set("order", params.order)
  return requestJson(url.toString())
}

export async function getContactoBatchResumen(batchId: string): Promise<ContactoBatchResumen> {
  return requestJson<ContactoBatchResumen>(`/api/prospeccion/contacto/batches/${batchId}`)
}

export async function listContactoEnvios(params: {
  limit?: number
  offset?: number
  batch_id?: string
  prospecto_id?: string
  canal?: "correo" | "whatsapp" | "llamada"
  estado?: string
  order?: "reciente" | "antiguo"
} = {}): Promise<{ ok: boolean; items: ContactoEnvio[]; total: number; limit: number; offset: number }> {
  const url = buildClientUrl("/api/prospeccion/contacto/envios")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.batch_id) url.searchParams.set("batch_id", params.batch_id)
  if (params.prospecto_id) url.searchParams.set("prospecto_id", params.prospecto_id)
  if (params.canal) url.searchParams.set("canal", params.canal)
  if (params.estado?.trim()) url.searchParams.set("estado", params.estado.trim())
  if (params.order) url.searchParams.set("order", params.order)
  return requestJson(url.toString())
}

export async function listContactoEnviosPorProspecto(
  prospectoId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<{ ok: boolean; items: ContactoEnvio[]; total: number; limit: number; offset: number }> {
  const url = buildClientUrl(`/api/prospeccion/prospectos/${prospectoId}/contactos`)
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  return requestJson(url.toString())
}

export async function listProspectoContactIndicators(prospectoIds: string[]) {
  const normalizedIds = Array.from(
    new Set(
      prospectoIds
        .map((value) => (value || "").trim())
        .filter((value) => value.length > 0)
    )
  )
  if (!normalizedIds.length) {
    return { ok: true, items: [] as ProspectoContactIndicators[] }
  }
  const CHUNK_SIZE = 40
  const chunks: string[][] = []
  for (let index = 0; index < normalizedIds.length; index += CHUNK_SIZE) {
    chunks.push(normalizedIds.slice(index, index + CHUNK_SIZE))
  }
  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const url = buildClientUrl("/api/prospeccion/prospectos/contact-indicadores")
      const search = new URLSearchParams(url.search)
      for (const id of chunk) {
        search.append("prospecto_id", id)
      }
      url.search = search.toString()
      return requestJson<{ ok: boolean; items: ProspectoContactIndicators[] }>(url.toString())
    })
  )
  const mergedItems: ProspectoContactIndicators[] = []
  for (const response of responses) {
    if (Array.isArray(response.items)) {
      mergedItems.push(...response.items)
    }
  }
  return { ok: true, items: mergedItems }
}

export async function listContactoLogs(params: {
  limit?: number
  offset?: number
  batch_id?: string
  envio_id?: string
  prospecto_id?: string
  canal?: "correo" | "whatsapp" | "llamada"
  estado?: string
  order?: "reciente" | "antiguo"
} = {}): Promise<{ ok: boolean; items: ContactoLog[]; total: number; limit: number; offset: number }> {
  const url = buildClientUrl("/api/prospeccion/contacto/logs")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.batch_id) url.searchParams.set("batch_id", params.batch_id)
  if (params.envio_id) url.searchParams.set("envio_id", params.envio_id)
  if (params.prospecto_id) url.searchParams.set("prospecto_id", params.prospecto_id)
  if (params.canal) url.searchParams.set("canal", params.canal)
  if (params.estado?.trim()) url.searchParams.set("estado", params.estado.trim())
  if (params.order) url.searchParams.set("order", params.order)
  return requestJson(url.toString())
}

export async function listProspectoAudit(
  prospectoId: string,
  params: { limit?: number } = {},
): Promise<{ ok: boolean; items: ProspectoAuditEntry[] }> {
  const url = buildClientUrl(`/api/prospeccion/prospectos/${prospectoId}/audit`)
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit))
  }
  return requestJson(url.toString())
}

export async function listContactoTemplates(params: {
  canal?: "correo" | "whatsapp" | "llamada"
  campana_id?: string
} = {}) {
  const url = buildClientUrl("/api/prospeccion/contacto/templates")
  if (params.canal) url.searchParams.set("canal", params.canal)
  if (params.campana_id?.trim()) url.searchParams.set("campana_id", params.campana_id.trim())
  return requestJson<{ ok: boolean; items: ContactoTemplate[] }>(url.toString())
}

export async function createContactoTemplate(payload: {
  canal: "correo" | "whatsapp" | "llamada"
  nombre: string
  slug: string
  descripcion?: string | null
  asunto?: string | null
  cuerpo_texto?: string | null
  cuerpo_html?: string | null
  metadata?: Record<string, unknown>
  activo?: boolean
  campana_id?: string | null
}) {
  return requestJson<{ ok: boolean; template: ContactoTemplate }>("/api/prospeccion/contacto/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateContactoTemplate(
  templateId: string,
  payload: {
    canal?: "correo" | "whatsapp" | "llamada"
    nombre?: string
    slug?: string
    descripcion?: string | null
    asunto?: string | null
    cuerpo_texto?: string | null
    cuerpo_html?: string | null
    metadata?: Record<string, unknown>
    activo?: boolean
    campana_id?: string | null
  },
) {
  return requestJson<{ ok: boolean; template: ContactoTemplate }>(`/api/prospeccion/contacto/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteContactoTemplate(templateId: string) {
  await requestJson(`/api/prospeccion/contacto/templates/${templateId}`, {
    method: "DELETE",
  })
}

export async function listBrevoCatalogTemplates(params: { limit?: number; search?: string } = {}) {
  const url = buildClientUrl("/api/prospeccion/contacto/templates/brevo-catalog")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (params.search?.trim()) url.searchParams.set("search", params.search.trim())
  return requestJson<{ ok: boolean; items: BrevoCatalogTemplate[] }>(url.toString())
}

export async function importBrevoContactoTemplate(payload: {
  brevo_template_id: number
  campana_id: string
  slug?: string | null
  nombre?: string | null
  descripcion?: string | null
}) {
  return requestJson<{ ok: boolean; template: ContactoTemplate }>("/api/prospeccion/contacto/templates/import-brevo", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function reintentarContactoEnvio(envioId: string) {
  return requestJson<{ ok: boolean; envio: ContactoEnvio }>(
    `/api/prospeccion/contacto/envios/${envioId}/reintentar`,
    {
      method: "POST",
    }
  )
}

export async function cancelarContactoEnvio(envioId: string) {
  return requestJson<{ ok: boolean; envio: ContactoEnvio }>(
    `/api/prospeccion/contacto/envios/${envioId}/cancelar`,
    {
      method: "POST",
    }
  )
}

export async function cancelarContactoBatch(batchId: string) {
  return requestJson<{ ok: boolean; batch: ContactoBatch; envios_cancelados: number }>(
    `/api/prospeccion/contacto/batches/${batchId}/cancelar`,
    {
      method: "POST",
    }
  )
}

export type ContactoMetrics = {
  ok: boolean
  canales: Record<
    string,
    {
      totales: number
      por_estado: Record<string, number>
    }
  >
  conversion_por_fuente?: Array<{
    fuente: string
    total_prospectos: number
    prospectos_contactados: number
    envios_totales: number
    envios_enviados: number
    prospectos_convertidos: number
    conversion_contacto_pct: number
    conversion_convertido_pct: number
  }>
  brevo_eventos?: Array<{
    evento: string
    total: number
    ultimo_evento_en?: string | null
  }>
}

export type BrevoQuotaSnapshot = {
  ok: boolean
  configured: boolean
  available: boolean
  timezone?: string | null
  date_local?: string | null
  date_brevo_utc?: string | null
  sent_today: number | null
  scheduled_today?: number | null
  projected_today?: number | null
  daily_limit: number | null
  remaining: number | null
  remaining_after_scheduled?: number | null
  usage_pct: number | null
  plan_type?: string | null
  plan_credits?: number | null
  warnings?: string[]
}

export type ProspeccionMetricasCampanaSummary = {
  envios_totales: number
  envios_enviados: number
  envios_entregados: number
  envios_respondidos: number
  brevo_aperturas: number
  brevo_clicks: number
  sesiones_utm: number
  tasa_entrega_pct: number
  tasa_respuesta_pct: number
}

export type ProspeccionMetricasFrasesSummary = {
  conversaciones_atribuidas: number
  contactos_unicos: number
  oportunidades_creadas: number
  tasa_conversacion_oportunidad_pct: number
  monto_estimado_total: number
}

export type ProspeccionMetricasFrasesByChannel = {
  canal_publicitario: string
  conversaciones_atribuidas: number
  contactos_unicos: number
  oportunidades_creadas: number
  tasa_conversacion_oportunidad_pct: number
  monto_estimado_total: number
}

export type ProspeccionMetricasFrasesByRule = {
  regla_id?: string | null
  regla_nombre: string
  canal_publicitario: string
  campana_publicitaria?: string | null
  conversaciones_atribuidas: number
  contactos_unicos: number
  oportunidades_creadas: number
  tasa_conversacion_oportunidad_pct: number
  monto_estimado_total: number
}

export type ProspeccionMetricasCampanaTimeseriesItem = {
  fecha: string
  envios_totales: number
  envios_enviados: number
  envios_entregados: number
  envios_respondidos: number
}

export type ProspeccionMetricasFrasesTimeseriesItem = {
  fecha: string
  conversaciones_atribuidas: number
  oportunidades_creadas: number
  monto_estimado_total: number
}

export type ProspeccionMetricasResponse = {
  ok: boolean
  filters: {
    date_from?: string | null
    date_to?: string | null
    campana_id?: string | null
    canal: "todos" | "correo" | "whatsapp" | "llamada"
    campana_publicitaria?: string | null
    regla_id?: string | null
  }
  campanas: {
    summary: ProspeccionMetricasCampanaSummary
    items: ProspeccionCampanaAtribucionItem[]
    timeseries: ProspeccionMetricasCampanaTimeseriesItem[]
  }
  frases_whatsapp: {
    summary: ProspeccionMetricasFrasesSummary
    by_channel: ProspeccionMetricasFrasesByChannel[]
    by_rule: ProspeccionMetricasFrasesByRule[]
    timeseries: ProspeccionMetricasFrasesTimeseriesItem[]
  }
}

export type LandingCtaVariantSummary = {
  variant: string
  clicks: number
  share_pct: number
}

export type LandingCtaByCta = {
  cta_id: string
  clicks: number
}

export type LandingCtaByVariantCta = {
  variant: string
  cta_id: string
  clicks: number
}

export type LandingCtaByDay = {
  date: string
  variant: string
  clicks: number
}

export type LandingCtaByHour = {
  hour: number
  variant: string
  clicks: number
}

export type LandingCtaByWeekday = {
  weekday: number
  variant: string
  clicks: number
}

export type LandingCtaEventsResponse = {
  ok: boolean
  total: number
  by_variant: LandingCtaVariantSummary[]
  by_cta: LandingCtaByCta[]
  by_variant_cta: LandingCtaByVariantCta[]
  by_day: LandingCtaByDay[]
  events?: Array<{
    created_at?: string | null
    created_at_local?: string | null
    variant?: string | null
    cta_id?: string | null
    location_href?: string | null
    referrer?: string | null
  }>
  by_hour?: LandingCtaByHour[]
  by_weekday?: LandingCtaByWeekday[]
  timezone?: string
}

export async function getContactoMetrics() {
  return requestJson<ContactoMetrics>("/api/prospeccion/contacto/metrics")
}

export async function getBrevoQuota() {
  return requestJson<BrevoQuotaSnapshot>("/api/prospeccion/contacto/brevo-quota")
}

export async function getProspeccionMetricas(params: {
  date_from?: string
  date_to?: string
  campana_id?: string
  canal?: "todos" | "correo" | "whatsapp" | "llamada"
  campana_publicitaria?: string
  regla_id?: string
  limit?: number
  include_campaign_timeseries?: boolean
  include_whatsapp_timeseries?: boolean
  include_whatsapp_channels?: boolean
  lite?: boolean
} = {}) {
  const url = buildClientUrl("/api/prospeccion/metricas")
  if (params.date_from) url.searchParams.set("date_from", params.date_from)
  if (params.date_to) url.searchParams.set("date_to", params.date_to)
  if (params.campana_id) url.searchParams.set("campana_id", params.campana_id)
  if (params.canal) url.searchParams.set("canal", params.canal)
  if (params.campana_publicitaria) url.searchParams.set("campana_publicitaria", params.campana_publicitaria)
  if (params.regla_id) url.searchParams.set("regla_id", params.regla_id)
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
   // flags de carga ligera
  if (params.include_campaign_timeseries === false) url.searchParams.set("include_campaign_timeseries", "false")
  if (params.include_whatsapp_timeseries === false) url.searchParams.set("include_whatsapp_timeseries", "false")
  if (params.include_whatsapp_channels === false) url.searchParams.set("include_whatsapp_channels", "false")
  if (params.lite) url.searchParams.set("lite", "true")
  return requestJson<ProspeccionMetricasResponse>(url.toString())
}

export async function downloadProspeccionMetricasXlsx(params: {
  date_from?: string
  date_to?: string
  campana_id?: string
  canal?: "todos" | "correo" | "whatsapp" | "llamada"
  campana_publicitaria?: string
  regla_id?: string
  limit?: number
} = {}) {
  const url = buildClientUrl("/api/prospeccion/metricas/export/xlsx")
  if (params.date_from) url.searchParams.set("date_from", params.date_from)
  if (params.date_to) url.searchParams.set("date_to", params.date_to)
  if (params.campana_id) url.searchParams.set("campana_id", params.campana_id)
  if (params.canal) url.searchParams.set("canal", params.canal)
  if (params.campana_publicitaria) url.searchParams.set("campana_publicitaria", params.campana_publicitaria)
  if (params.regla_id) url.searchParams.set("regla_id", params.regla_id)
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore invalid json payload
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || `prospeccion_metricas_${Date.now()}.xlsx`
  return { blob, filename }
}

export async function getLandingCtaEvents(params: {
  date_from?: string
  date_to?: string
  event_type?: string
  limit?: number
} = {}) {
  const url = buildClientUrl("/api/crm/web/cta-events")
  if (params.date_from) url.searchParams.set("date_from", params.date_from)
  if (params.date_to) url.searchParams.set("date_to", params.date_to)
  if (params.event_type) url.searchParams.set("event_type", params.event_type)
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  return requestJson<LandingCtaEventsResponse>(url.toString())
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractStringField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined
  }
  const container = payload as Record<string, unknown>
  const value = container[key]
  return typeof value === "string" ? value : undefined
}

/**
 * Create a manual prospect tagged with fuente Usuario.
 */
export async function crearProspectoManual(payload: ProspectoManualInput) {
  return requestJson<{ ok: boolean; prospecto: ProspectoItem }>("/api/prospeccion/prospectos/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * Patch editable fields for a saved prospect.
 */
export async function actualizarProspecto(prospectoId: string, payload: ProspectoUpdateInput) {
  return requestJson<{ ok: boolean; prospecto: ProspectoItem }>(`/api/prospeccion/prospectos/${prospectoId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

/**
 * Delete a prospect and associated history.
 */
export async function eliminarProspecto(prospectoId: string) {
  return requestJson<{ ok: boolean; prospecto_id: string }>(`/api/prospeccion/prospectos/${prospectoId}`, {
    method: "DELETE",
  })
}

/**
 * Delete multiple prospects.
 */
export async function eliminarProspectos(prospectoIds: string[]) {
  return requestJson<{ ok: boolean; prospecto_ids: string[] }>("/api/prospeccion/prospectos/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids: prospectoIds }),
  })
}

/**
 * Delete complete prospect groups by query/busqueda values.
 */
export async function eliminarGruposProspectos(queryValues: string[]) {
  return requestJson<{ ok: boolean; total: number; prospecto_ids: string[]; query_values: string[] }>(
    "/api/prospeccion/prospectos/grupos-delete",
    {
      method: "POST",
      body: JSON.stringify({ query_values: queryValues }),
    }
  )
}
