import { AppSidebar } from '@/components/AppSidebar'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CatalogSalesCard } from '@/components/dashboard/catalog-sales-card'
import { CatalogPipelineCard } from '@/components/dashboard/catalog-pipeline-card'
import { AttentionCards } from '@/components/dashboard/attention-cards'
import { MarketingCards } from '@/components/dashboard/marketing-cards'
import { AgendaCards } from '@/components/dashboard/agenda-cards'
import { OpportunityCards } from '@/components/dashboard/opportunity-cards'
import { MarketingTimeseries } from '@/components/dashboard/marketing-timeseries'
import { DashboardRangeControls } from '@/components/dashboard/range-controls'

import { loadLeadsData } from "@/lib/leads/data"
import { fetchDashboardKpis } from "@/lib/dashboard/kpis"
import { fetchProspeccionMetricas } from "@/lib/dashboard/prospeccion-kpis"
import { loadAgendaData } from "@/lib/agenda/data"
import { fetchOpportunityKpis } from "@/lib/dashboard/opportunities-kpis"
import { resolveDashboardRange } from "@/lib/dashboard/range"
import { fetchCatalogPipelineKpi, fetchCatalogSalesKpi } from "./catalog-analytics"

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="px-4 lg:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default async function Page({ searchParams }: DashboardPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const range = resolveDashboardRange(resolvedParams);

  const [leadsPayload, dashboardKpis, prospeccionPayload, agendaPayload, opportunityKpis, salesRows, pipelineRows] = await Promise.all([
    loadLeadsData({ days: range.days }).catch(() => ({
      cards: { total: 0, abiertas: 0, ganadas: 0, perdidas: 0, nuevas: 0, montoTotal: 0 },
      chart: [],
      table: [],
      totalRows: 0,
      restartTable: [],
      restartKpis: { reconversionRate: 0, avgDaysBetweenCycles: 0, avgAmountPerCycle: 0 },
      errors: ["No se pudieron cargar KPIs de leads."],
    })),
    fetchDashboardKpis({ rango: range.rango ?? undefined, desde: range.desde ?? undefined, hasta: range.hasta ?? undefined }).catch(() => null),
    fetchProspeccionMetricas({ date_from: range.dateFrom ?? undefined, date_to: range.dateTo ?? undefined }).catch(() => null),
    loadAgendaData({ rango: range.rango ?? undefined, desde: range.desde ?? undefined, hasta: range.hasta ?? undefined }).catch(() => ({ items: [], metrics: { total: 0, activas: 0, proximas24h: 0, canceladas: 0, realizadas: 0 }, errors: ["No se pudo cargar agenda."] })),
    fetchOpportunityKpis().catch(() => null),
    fetchCatalogSalesKpi().catch(() => []),
    fetchCatalogPipelineKpi().catch(() => []),
  ])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Dashboard" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <DashboardRangeControls rango={range.rango} desde={range.desde} hasta={range.hasta} />
              <SectionTitle label="Ventas · Leads" />
              <SectionCards data={leadsPayload.cards} />
              <SectionTitle label="Atención · Conversaciones" />
              <AttentionCards data={dashboardKpis} />
              <SectionTitle label="Oportunidades · Pipeline" />
              <OpportunityCards data={opportunityKpis} />
              <SectionTitle label="Marketing · Prospección" />
              <MarketingCards
                summary={prospeccionPayload?.summary ?? null}
                items={prospeccionPayload?.items ?? null}
              />
              <SectionTitle label="Agenda · Citas" />
              <AgendaCards data={agendaPayload.metrics} />
              <SectionTitle label="Evolución de Leads" />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive data={leadsPayload.chart} />
              </div>
              <SectionTitle label="Rendimiento de Campañas" />
              <div className="px-4 lg:px-6">
                <MarketingTimeseries
                  data={prospeccionPayload?.timeseries ?? null}
                  dateFrom={range.dateFrom}
                  dateTo={range.dateTo}
                />
              </div>
              <div className="grid gap-4 px-4 lg:px-6 @[1000px]/main:grid-cols-2">
                <CatalogSalesCard data={salesRows} />
                <CatalogPipelineCard data={pipelineRows} />
              </div>
              <DataTable data={leadsPayload.table} />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
