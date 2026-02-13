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
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      <Card>
        <CardHeader>
          <CardTitle>Score promedio (7 días)</CardTitle>
          <CardDescription>Promedio de oportunidades con scoring calculado.</CardDescription>
        </CardHeader>
        <CardContent className='text-3xl font-semibold'>
          {kpis.score_promedio == null ? "—" : kpis.score_promedio.toFixed(1)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades calificadas</CardTitle>
          <CardDescription>Eventos: {kpis.total_eventos}</CardDescription>
        </CardHeader>
        <CardContent className='text-3xl font-semibold'>{kpis.oportunidades_unicas}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Avance a cita</CardTitle>
          <CardDescription>Agenda / confirma / asiste</CardDescription>
        </CardHeader>
        <CardContent className='text-sm'>
          <div>Agenda: {formatPct(kpis.agenda_cita_pct)}</div>
          <div>Confirma: {formatPct(kpis.confirma_cita_pct)}</div>
          <div>Asiste: {formatPct(kpis.asiste_cita_pct)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calidad de captura</CardTitle>
          <CardDescription>Acepta preguntas y evasivas</CardDescription>
        </CardHeader>
        <CardContent className='text-sm'>
          <div>Acepta: {formatPct(kpis.acepta_preguntas_pct)}</div>
          <div>Evasivas prom.: {kpis.evasivas_promedio == null ? "—" : kpis.evasivas_promedio.toFixed(2)}</div>
          <div>
            Grade top: {topBreakdownLabel(kpis.distribucion_grade)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(1)}%`
}

function topBreakdownLabel(values: Record<string, number>) {
  const entries = Object.entries(values)
  if (!entries.length) return "—"
  entries.sort((a, b) => b[1] - a[1])
  const [label, count] = entries[0]
  return `${label}: ${count}`
}
