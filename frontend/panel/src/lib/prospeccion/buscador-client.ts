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

export type BuscadorRunResponse = {
  ok: boolean
  total: number
  duration_ms: number
  stats: BuscadorStats
  results: BuscadorResult[]
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

export async function ejecutarBuscador(payload: BuscadorRunPayload): Promise<BuscadorRunResponse> {
  const response = await fetch("/api/prospeccion/buscador/run", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
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

  return data as BuscadorRunResponse
}
