export type BuscadorRunPayload = {
  sitio: "demo" | "simple" | "domain"
  url?: string
  mode?: "generic" | "government" | "intelligent" | "auto"
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

export type BuscadorJobStatus = "pending" | "running" | "completed" | "failed"

export type BuscadorJobParams = {
  sitio: "demo" | "simple" | "domain"
  url?: string | null
  mode: "generic" | "government" | "intelligent" | "auto"
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

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

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
    const message =
      extractErrorMessage(data) ||
      (typeof rawText === "string" && rawText.trim().length ? rawText : "No se pudo ejecutar el buscador.")
    throw new Error(message)
  }

  return data as T
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

export async function obtenerBuscadorResultados(jobId: string): Promise<BuscadorJobResults> {
  return requestJson<BuscadorJobResults>(`/api/prospeccion/buscador/jobs/${jobId}/results`)
}

export async function guardarBuscadorProspectos(
  jobId: string,
  params: { result_ids: string[]; segmento?: string | null },
): Promise<{ ok: boolean; total: number }> {
  return requestJson<{ ok: boolean; total: number }>(`/api/prospeccion/buscador/jobs/${jobId}/prospectos`, {
    method: "POST",
    body: JSON.stringify(params),
  })
}
