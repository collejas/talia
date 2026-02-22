import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type Thresholds = {
  min_query_events_30d?: number
  fallback_ratio_threshold?: number
  min_fallback_events_30d?: number
  weekly_growth_ratio_threshold?: number
  min_weekly_queries?: number
}

type HistoryRow = {
  id?: string
  scope?: string
  action?: string
  changed_by?: string | null
  changed_by_name?: string | null
  created_at?: string
  target_organizacion_id?: string | null
  before?: Thresholds | null
  after?: Thresholds | null
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? "40")
  if (!Number.isFinite(parsed)) return 40
  return Math.min(Math.max(Math.round(parsed), 1), 200)
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function thresholdDiff(before: Thresholds | null | undefined, after: Thresholds | null | undefined): string {
  if (!before && !after) return "Sin datos"
  if (!before && after) return "Nuevo valor"
  if (before && !after) return "Override limpiado"
  const prev = before ?? {}
  const next = after ?? {}
  const parts: string[] = []
  if (prev.min_query_events_30d !== next.min_query_events_30d) {
    parts.push(`q30d ${prev.min_query_events_30d ?? ""}->${next.min_query_events_30d ?? ""}`)
  }
  if (prev.fallback_ratio_threshold !== next.fallback_ratio_threshold) {
    parts.push(`fallbackRatio ${prev.fallback_ratio_threshold ?? ""}->${next.fallback_ratio_threshold ?? ""}`)
  }
  if (prev.min_fallback_events_30d !== next.min_fallback_events_30d) {
    parts.push(`fallbackMin ${prev.min_fallback_events_30d ?? ""}->${next.min_fallback_events_30d ?? ""}`)
  }
  if (prev.weekly_growth_ratio_threshold !== next.weekly_growth_ratio_threshold) {
    parts.push(`growth ${prev.weekly_growth_ratio_threshold ?? ""}->${next.weekly_growth_ratio_threshold ?? ""}`)
  }
  if (prev.min_weekly_queries !== next.min_weekly_queries) {
    parts.push(`weeklyMin ${prev.min_weekly_queries ?? ""}->${next.min_weekly_queries ?? ""}`)
  }
  return parts.length ? parts.join(" | ") : "Sin cambios detectados"
}

function buildCsv(rows: HistoryRow[]): string {
  const header = [
    "id",
    "fecha",
    "scope",
    "accion",
    "actor",
    "actor_id",
    "target_organizacion_id",
    "before_min_query_events_30d",
    "before_fallback_ratio_threshold",
    "before_min_fallback_events_30d",
    "before_weekly_growth_ratio_threshold",
    "before_min_weekly_queries",
    "after_min_query_events_30d",
    "after_fallback_ratio_threshold",
    "after_min_fallback_events_30d",
    "after_weekly_growth_ratio_threshold",
    "after_min_weekly_queries",
    "diff",
  ]
  const lines = [header.map(csvCell).join(",")]
  for (const row of rows) {
    lines.push(
      [
        row.id ?? "",
        row.created_at ?? "",
        row.scope ?? "",
        row.action ?? "",
        row.changed_by_name ?? "",
        row.changed_by ?? "",
        row.target_organizacion_id ?? "",
        row.before?.min_query_events_30d ?? "",
        row.before?.fallback_ratio_threshold ?? "",
        row.before?.min_fallback_events_30d ?? "",
        row.before?.weekly_growth_ratio_threshold ?? "",
        row.before?.min_weekly_queries ?? "",
        row.after?.min_query_events_30d ?? "",
        row.after?.fallback_ratio_threshold ?? "",
        row.after?.min_fallback_events_30d ?? "",
        row.after?.weekly_growth_ratio_threshold ?? "",
        row.after?.min_weekly_queries ?? "",
        thresholdDiff(row.before, row.after),
      ]
        .map(csvCell)
        .join(","),
    )
  }
  return lines.join("\n")
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const scopeRaw = (url.searchParams.get("history_scope") ?? "all").trim().toLowerCase()
  const scope = scopeRaw === "organization" || scopeRaw === "global" ? scopeRaw : "all"
  const actor = (url.searchParams.get("history_actor") ?? "").trim().toLowerCase()
  const dateFrom = (url.searchParams.get("history_date_from") ?? "").trim()
  const dateTo = (url.searchParams.get("history_date_to") ?? "").trim()
  const limit = parseLimit(url.searchParams.get("history_limit"))

  const historyResponse = await callCrmApi<HistoryRow[]>("/crm/catalog/vector-store/alert-thresholds/history", {
    searchParams: {
      scope: "all",
      limit: 200,
    },
  })

  if (!historyResponse.ok || !Array.isArray(historyResponse.data)) {
    return NextResponse.json(
      { error: historyResponse.ok ? "No se pudo leer el historial." : historyResponse.error },
      { status: historyResponse.ok ? 500 : (historyResponse.status ?? 400) },
    )
  }

  const filtered = historyResponse.data
    .filter((row) => {
      const rowScope = String(row.scope ?? "")
      if (scope !== "all" && rowScope !== scope) return false
      if (actor) {
        const actorText = `${row.changed_by_name ?? ""} ${row.changed_by ?? ""}`.toLowerCase()
        if (!actorText.includes(actor)) return false
      }
      const day = String(row.created_at ?? "").slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      return true
    })
    .slice(0, limit)

  const csv = buildCsv(filtered)
  const filename = `vector-thresholds-history-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  })
}
