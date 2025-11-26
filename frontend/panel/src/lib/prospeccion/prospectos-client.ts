export type ProspectoItem = {
  id: string
  display_name: string | null
  actividad: string | null
  phone: string | null
  phone_e164?: string | null
  email: string | null
  website: string | null
  address: string | null
  fuente: "google_places" | "denue" | "usuario"
  segmento?: string | null
  lookup_status?: string | null
  whatsapp_permitido?: boolean | null
  llamada_permitida?: boolean | null
  carrier_type?: string | null
  rating?: number | null
  distancia_m?: number | null
  creado_en?: string | null
  metadata?: Record<string, unknown> | null
}

export type ProspectosResponse = {
  ok: boolean
  items: ProspectoItem[]
  total: number
  limit: number
  offset: number
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

export type ProspectoContactarResponse = {
  ok: boolean
  contactos: Array<Record<string, string>>
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
async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

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
    const detail =
      extractStringField(data, "detail") ||
      extractStringField(data, "error") ||
      extractStringField(data, "message") ||
      (typeof rawText === "string" && rawText.trim().length ? rawText : null) ||
      `Error ${response.status}`
    throw new Error(detail)
  }

  return (data as T) ?? ({} as T)
}

/**
 * List saved prospects with optional filters for fuente, lookup status or search term.
 */
export async function listProspectos(params: {
  limit?: number
  offset?: number
  search?: string
  fuente?: "google_places" | "denue" | "usuario"
  lookupStatus?: string
  segmento?: string
  carrierType?: "mobile" | "landline" | "voip"
  order?: "creado" | "nombre"
} = {}): Promise<ProspectosResponse> {
  const url = buildClientUrl("/api/prospeccion/prospectos")
  if (typeof params.limit === "number") url.searchParams.set("limit", String(params.limit))
  if (typeof params.offset === "number") url.searchParams.set("offset", String(params.offset))
  if (params.search?.trim().length) url.searchParams.set("search", params.search.trim())
  if (params.fuente) url.searchParams.set("fuente", params.fuente)
  if (params.lookupStatus?.trim().length) url.searchParams.set("lookup_status", params.lookupStatus.trim())
  if (params.segmento?.trim().length) url.searchParams.set("segmento", params.segmento.trim())
  if (params.carrierType) url.searchParams.set("carrier_type", params.carrierType)
  if (params.order) url.searchParams.set("order", params.order)
  return requestJson<ProspectosResponse>(url.toString())
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
 * Run Twilio Lookup verification for the provided prospect IDs.
 */
export async function verificarProspectos(payload: {
  prospecto_ids: string[]
  country_code?: string
  reintentar?: boolean
}): Promise<ProspectoLookupResponse> {
  return requestJson<ProspectoLookupResponse>("/api/prospeccion/prospectos/verificar-telefonos", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * Schedule outbound contact (correo, WhatsApp o llamada) for the selected prospects.
 */
export async function contactarProspectos(payload: {
  prospecto_ids: string[]
  correo_asunto?: string
  correo_cuerpo?: string
  whatsapp_mensaje?: string
  llamada_notas?: string
}): Promise<ProspectoContactarResponse> {
  return requestJson<ProspectoContactarResponse>("/api/prospeccion/prospectos/contactar", {
    method: "POST",
    body: JSON.stringify(payload),
  })
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
