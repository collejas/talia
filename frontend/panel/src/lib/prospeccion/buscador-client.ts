import { refreshSession, shouldAttemptSessionRefresh } from "@/lib/auth/session-refresh"

const RETRYABLE_STATUS = new Set([502, 503, 504, 522, 524])

export type BuscadorRunPayload = {
  sitio: "demo" | "simple" | "domain"
  url?: string
  mode?: "generic" | "government" | "intelligent" | "auto" | "stealth"
  max_pages?: number
  max_depth?: number
  max_runtime?: number | null
  max_queue_size?: number | null
  max_no_new_emails?: number | null
  max_memory_mb?: number | null
}

export type BuscadorResult = {
  id?: string | null
  source_url: string
  email: string
  name?: string | null
  position?: string | null
  phone?: string | null
  extension?: string | null
  address?: string | null
}

export type BuscadorTopDomain = {
  domain: string
  count: number
}

export type BuscadorTopSource = {
  host: string
  count: number
}

export type BuscadorStats = {
  emails_total: number
  unique_email_domains: number
  unique_source_hosts: number
  top_email_domains: BuscadorTopDomain[]
  top_source_hosts: BuscadorTopSource[]
}

export type BuscadorJobStatus =
  | "pending"
  | "running"
  | "pausing"
  | "canceling"
  | "completed"
  | "failed"
  | "paused"
  | "canceled"

export type BuscadorJobParams = {
  sitio: "demo" | "simple" | "domain"
  url?: string | null
  mode: "generic" | "government" | "intelligent" | "auto" | "stealth"
  max_pages: number
  max_depth: number
  max_runtime?: number | null
  max_queue_size?: number | null
  max_no_new_emails?: number | null
  max_memory_mb?: number | null
}

export type BuscadorJob = {
  id: string
  status: BuscadorJobStatus
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  duration_ms?: number | null
  total?: number | null
  stats?: BuscadorStats | null
  error?: string | null
  params: BuscadorJobParams
}

export type BuscadorJobResults = {
  items: BuscadorResult[]
  total: number
  stats?: BuscadorStats | null
}

export type BuscadorJobsListResponse = {
  items: BuscadorJob[]
}

function extractErrorMessage(data: unknown): string | null {
  if (typeof data === "string") return data
  if (typeof data === "object" && data !== null) {
    const detail = (data as Record<string, unknown>).detail
    if (typeof detail === "string" && detail.trim().length) return detail.trim()
    const error = (data as Record<string, unknown>).error
    if (typeof error === "string" && error.trim().length) return error.trim()
    const message = (data as Record<string, unknown>).message
    if (typeof message === "string" && message.trim().length) return message.trim()
  }
  return null
}

async function requestJson<T>(input: string, init?: RequestInit, retryAuth = true, retryNetwork = true): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    })
  } catch (error) {
    if (retryNetwork) {
      await delay(400)
      return requestJson<T>(input, init, retryAuth, false)
    }
    const message = error instanceof Error ? error.message : null
    throw new Error(message || "Error de red al contactar el backend del buscador.")
  }

  const rawText = await response.text()
  let data: unknown = {}
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
    if (response.status === 409) {
      const conflictMessage =
        extractErrorMessage(data) ||
        "El job aún no ha finalizado. Estamos mostrando los resultados parciales disponibles."
      throw new Error(conflictMessage)
    }
    if (retryNetwork && RETRYABLE_STATUS.has(response.status)) {
      await delay(400)
      return requestJson<T>(input, init, retryAuth, false)
    }
    const message =
      extractErrorMessage(data) ||
      (typeof rawText === "string" && rawText.trim().length ? rawText : "No se pudo ejecutar el buscador.")
    throw new Error(message)
  }

  return data as T
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function crearBuscadorJob(payload: BuscadorRunPayload): Promise<BuscadorJob> {
  return requestJson<BuscadorJob>("/api/prospeccion/buscador/run", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function obtenerBuscadorJob(jobId: string): Promise<BuscadorJob> {
  return requestJson<BuscadorJob>(`/api/prospeccion/buscador/jobs/${jobId}`)
}

export async function obtenerBuscadorResultados(
  jobId: string,
  params?: { limit?: number; offset?: number },
): Promise<BuscadorJobResults> {
  const url = buildClientUrl(`/api/prospeccion/buscador/jobs/${jobId}/results`)
  if (typeof params?.limit === "number") {
    url.searchParams.set("limit", String(params.limit))
  }
  if (typeof params?.offset === "number") {
    url.searchParams.set("offset", String(params.offset))
  }
  return requestJson<BuscadorJobResults>(url.toString())
}

export async function listarBuscadorJobs(limit = 20): Promise<BuscadorJob[]> {
  const url = buildClientUrl("/api/prospeccion/buscador/jobs")
  url.searchParams.set("limit", String(limit))
  const data = await requestJson<BuscadorJobsListResponse>(url.toString())
  return data.items
}

export async function pausarBuscadorJob(jobId: string): Promise<BuscadorJob> {
  return requestJson<BuscadorJob>(`/api/prospeccion/buscador/jobs/${jobId}/pause`, {
    method: "POST",
  })
}

export async function cancelarBuscadorJob(jobId: string): Promise<BuscadorJob> {
  return requestJson<BuscadorJob>(`/api/prospeccion/buscador/jobs/${jobId}/cancel`, {
    method: "POST",
  })
}

function buildClientUrl(path: string): URL {
  const origin =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_PANEL_ORIGIN || "http://localhost"
      : window.location.origin
  return new URL(path, origin)
}

export async function guardarBuscadorProspectos(
  jobId: string,
  params: { result_ids?: string[]; segmento?: string | null; save_all?: boolean },
): Promise<{ ok: boolean; total: number }> {
  const body: Record<string, unknown> = {}
  if (params.result_ids?.length) {
    body.result_ids = params.result_ids
  }
  if (params.segmento) {
    body.segmento = params.segmento
  }
  if (params.save_all) {
    body.save_all = true
  }
  return requestJson<{ ok: boolean; total: number }>(`/api/prospeccion/buscador/jobs/${jobId}/prospectos`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}
