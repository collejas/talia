import { AppSidebar } from '@/components/AppSidebar'
import { EmbudoBoard } from '@/components/embudo/board'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { loadEmbudoData } from '@/lib/embudo/data'
import { SessionRecovery } from '@/components/session-recovery'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CSSProperties } from 'react'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const embudo = await loadEmbudoData()

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AppSidebar variant='inset' />
      <SidebarInset>
        <SiteHeader title='Embudo' />
        <div className='flex h-[calc(100vh-var(--header-height))] flex-1 flex-col overflow-hidden'>
          <div className='@container/main flex flex-1 flex-col gap-2'>
            <div className='flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6'>
              <SessionRecovery errors={embudo.errors} />
              {embudo.errors.length ? (
                <div className='rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
                  <p className='font-medium'>No se pudieron cargar todas las etapas:</p>
                  <ul className='list-disc pl-5'>
                    {embudo.errors.map((message, index) => (
                      <li key={index}>{sanitizeMessage(message)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {embudo.scoringKpis ? <ScoringKpisOverview kpis={embudo.scoringKpis} /> : null}
              <EmbudoBoard
                etapas={embudo.stages}
                sinConversacion={embudo.sinConversacion}
                visitantesSinChat={embudo.visitantesSinChat}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}

function sanitizeMessage(message: string) {
  const trimmed = message.trim()
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return 'El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy).'
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return 'Tu sesión en Supabase caducó. Estamos intentando renovarla automáticamente; si persiste, vuelve a iniciar sesión.'
  }
  return trimmed
}

type ScoringKpisOverviewProps = {
  kpis: NonNullable<Awaited<ReturnType<typeof loadEmbudoData>>["scoringKpis"]>
}

function ScoringKpisOverview({ kpis }: ScoringKpisOverviewProps) {
  const view = selectOperationalView(kpis)
  const sourceLabel = view.source === "opportunity_latest_based" ? "Último evento por oportunidad" : "Eventos"
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      <Card>
        <CardHeader>
          <CardTitle>Puntaje promedio (7 días)</CardTitle>
          <CardDescription>{sourceLabel}</CardDescription>
        </CardHeader>
        <CardContent className='text-3xl font-semibold'>
          {view.kpis.score_promedio == null ? "—" : view.kpis.score_promedio.toFixed(1)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades calificadas</CardTitle>
          <CardDescription>Eventos: {kpis.total_eventos}</CardDescription>
        </CardHeader>
        <CardContent className='text-3xl font-semibold'>{view.kpis.oportunidades_unicas}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Avance a cita</CardTitle>
          <CardDescription>Agenda / confirma / asiste</CardDescription>
        </CardHeader>
        <CardContent className='text-sm'>
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
        <CardContent className='text-[11px] leading-tight tracking-tight'>
          <div className='grid grid-cols-2 gap-x-3'>
            <div className='space-y-1 text-foreground'>
              <div title='Porcentaje de eventos donde el prospecto aceptó responder preguntas.'>
                Acepta: {formatPct(view.kpis.acepta_preguntas_pct)}
              </div>
              <div title='Promedio de respuestas evasivas durante la calificación.'>
                Evasivas prom.: {view.kpis.evasivas_promedio == null ? "—" : view.kpis.evasivas_promedio.toFixed(2)}
              </div>
            </div>
            <div className='space-y-1 text-muted-foreground'>
              {formatGradeDistribution(view.kpis.distribucion_grade).map((item) => (
                <div key={item.label} className='flex items-center justify-between gap-2 whitespace-nowrap'>
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

function selectOperationalView(kpis: NonNullable<Awaited<ReturnType<typeof loadEmbudoData>>["scoringKpis"]>) {
  if (kpis.opportunity_latest_based) {
    return { source: "opportunity_latest_based" as const, kpis: kpis.opportunity_latest_based }
  }
  if (kpis.event_based) {
    return { source: "event_based" as const, kpis: kpis.event_based }
  }
  return { source: "event_based" as const, kpis }
}

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(1)}%`
}

function normalizeGradeKey(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === "exploring" || normalized === "explorando") return "explorando"
  if (normalized === "interested" || normalized === "interesado") return "interesado"
  if (normalized === "ready" || normalized === "listo") return "listo"
  return normalized
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
