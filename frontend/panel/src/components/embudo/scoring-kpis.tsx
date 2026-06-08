import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { EmbudoScoringKpis } from "@/lib/embudo/data"

type OperationalView = {
  source: "opportunity_latest_based" | "event_based"
  kpis: NonNullable<EmbudoScoringKpis>
}

export type ScoringKpisOverviewProps = {
  kpis: EmbudoScoringKpis
}

export function ScoringKpisOverview({ kpis }: ScoringKpisOverviewProps) {
  const view = selectOperationalView(kpis)
  const sourceLabel = view.source === "opportunity_latest_based" ? "Último evento por oportunidad" : "Eventos"
  const windowLabel = formatWindowLabel(kpis.window_days)
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Puntaje promedio ({windowLabel})</CardTitle>
          <CardDescription>{sourceLabel}</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">
          {view.kpis.score_promedio == null ? "—" : view.kpis.score_promedio.toFixed(1)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades calificadas</CardTitle>
          <CardDescription>Eventos: {kpis.total_eventos}</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{view.kpis.oportunidades_unicas}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Avance a cita</CardTitle>
          <CardDescription>Agenda / confirma / asiste</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <div>Agenda: {formatPct(view.kpis.agenda_cita_pct)}</div>
          <div>Confirma: {formatPct(view.kpis.confirma_cita_pct)}</div>
          <div>Asiste: {formatPct(view.kpis.asiste_cita_pct)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calidad de captura</CardTitle>
          <CardDescription>Acepta preguntas y evasivas</CardDescription>
        </CardHeader>
        <CardContent className="text-[11px] leading-tight tracking-tight">
          <div className="grid grid-cols-2 gap-x-3">
            <div className="space-y-1 text-foreground">
              <div title="Porcentaje de eventos donde el prospecto aceptó responder preguntas.">
                Acepta: {formatPct(view.kpis.acepta_preguntas_pct)}
              </div>
              <div title="Promedio de respuestas evasivas durante la calificación.">
                Evasivas prom.: {view.kpis.evasivas_promedio == null ? "—" : view.kpis.evasivas_promedio.toFixed(2)}
              </div>
            </div>
            <div className="space-y-1 text-muted-foreground">
              {formatGradeDistribution(view.kpis.distribucion_grade).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span title={item.fullLabel}>{item.label}</span>
                  <span>{item.count} ({item.pct})</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function selectOperationalView(kpis: EmbudoScoringKpis): OperationalView {
  if (kpis.opportunity_latest_based) {
    return {
      source: "opportunity_latest_based",
      kpis: {
        ...kpis.opportunity_latest_based,
        window_days: kpis.window_days,
      },
    }
  }
  if (kpis.event_based) {
    return {
      source: "event_based",
      kpis: {
        ...kpis.event_based,
        window_days: kpis.window_days,
      },
    }
  }
  return { source: "event_based", kpis }
}

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(1)}%`
}

function formatWindowLabel(windowDays: number) {
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    return "sin rango"
  }
  return `${windowDays} días`
}

function formatGradeDistribution(values: Record<string, number>) {
  const totals: Record<string, number> = {
    explorando: 0,
    interesado: 0,
    listo: 0,
  }

  for (const [rawLabel, rawCount] of Object.entries(values)) {
    const key = normalizeGradeKey(rawLabel)
    if (!(key in totals)) continue
    const count = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0
    totals[key] += count
  }

  const totalEvents = totals.explorando + totals.interesado + totals.listo
  const rows: Array<{ key: string; label: string }> = [
    { key: "explorando", label: "Explorando" },
    { key: "interesado", label: "Interesado" },
    { key: "listo", label: "Listo" },
  ]

  return rows.map((row) => {
    const count = totals[row.key] ?? 0
    const pct = totalEvents > 0 ? `${Math.round((count / totalEvents) * 100)}%` : "0%"
    return { label: row.label.slice(0, 3), fullLabel: row.label, count, pct }
  })
}

function normalizeGradeKey(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === "exploring" || normalized === "explorando") return "explorando"
  if (normalized === "interested" || normalized === "interesado") return "interesado"
  if (normalized === "ready" || normalized === "listo") return "listo"
  return normalized
}
