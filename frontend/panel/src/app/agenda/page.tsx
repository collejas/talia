import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { AgendaView } from "@/components/agenda/agenda-view"
import { SessionRecovery } from "@/components/session-recovery"
import { SiteHeader } from "@/components/site-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { loadAgendaData, AgendaMetrics } from "@/lib/agenda/data"

export const dynamic = "force-dynamic"

export default async function Page() {
  const agendaData = await loadAgendaData()
  const formattedMetrics = formatMetrics(agendaData.metrics)

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Agenda" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SessionRecovery errors={agendaData.errors} />
              {agendaData.errors.length > 0 ? (
                <div className="px-4 lg:px-6">
                  <ErrorNotice errors={agendaData.errors} />
                </div>
              ) : null}
              <div className="px-4 lg:px-6">
                <MetricsOverview metrics={formattedMetrics} />
              </div>
              <div className="px-4 lg:px-6">
                <AgendaView items={agendaData.items} referenceDateIso={new Date().toISOString()} />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}

type ErrorNoticeProps = {
  errors: string[]
}

function ErrorNotice({ errors }: ErrorNoticeProps) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">No se pudieron cargar todos los datos:</p>
      <ul className="list-disc pl-5">
        {errors.map((message, index) => (
          <li key={index}>{sanitizeError(message)}</li>
        ))}
      </ul>
    </div>
  )
}

type MetricsOverviewProps = {
  metrics: ReturnType<typeof formatMetrics>
}

function MetricsOverview({ metrics }: MetricsOverviewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Total de citas</CardTitle>
          <CardDescription>Incluye todas las citas registradas en agenda.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.total}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activas</CardTitle>
          <CardDescription>Estado pendiente, confirmada o reprogramada.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.activas}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Próximas 24 h</CardTitle>
          <CardDescription>Eventos programados en las siguientes 24 horas.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.proximas24h}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Canceladas / Realizadas</CardTitle>
          <CardDescription>Citas cerradas recientemente.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">
          <span>{metrics.canceladas}</span>
          <span className="text-muted-foreground text-base font-normal"> canceladas</span>
          <div className="text-muted-foreground text-base font-normal">
            {metrics.realizadas} realizadas
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function sanitizeError(message: string): string {
  const trimmed = message.trim()
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy)."
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "La sesión caducó; estamos intentando renovarla automáticamente."
  }
  return trimmed
}

function formatMetrics(metrics: AgendaMetrics) {
  const nf = new Intl.NumberFormat("es-MX")
  return {
    total: nf.format(metrics.total),
    activas: nf.format(metrics.activas),
    proximas24h: nf.format(metrics.proximas24h),
    canceladas: nf.format(metrics.canceladas),
    realizadas: nf.format(metrics.realizadas),
  }
}
