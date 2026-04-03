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

import { loadLeadsData } from "@/lib/leads/data"
import { fetchDashboardKpis } from "@/lib/dashboard/kpis"
import { fetchProspeccionMetricas } from "@/lib/dashboard/prospeccion-kpis"
import { loadAgendaData } from "@/lib/agenda/data"
import { fetchCatalogPipelineKpi, fetchCatalogSalesKpi } from "./catalog-analytics"

export default async function Page() {
  const [leadsPayload, dashboardKpis, prospeccionKpis, agendaPayload, salesRows, pipelineRows] = await Promise.all([
    loadLeadsData().catch(() => ({
      cards: { total: 0, abiertas: 0, ganadas: 0, perdidas: 0, nuevas: 0, montoTotal: 0 },
      chart: [],
      table: [],
      totalRows: 0,
      restartTable: [],
      restartKpis: { reconversionRate: 0, avgDaysBetweenCycles: 0, avgAmountPerCycle: 0 },
      errors: ["No se pudieron cargar KPIs de leads."],
    })),
    fetchDashboardKpis().catch(() => null),
    fetchProspeccionMetricas().catch(() => null),
    loadAgendaData().catch(() => ({ items: [], metrics: { total: 0, activas: 0, proximas24h: 0, canceladas: 0, realizadas: 0 }, errors: ["No se pudo cargar agenda."] })),
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
              <SectionCards data={leadsPayload.cards} />
              <AttentionCards data={dashboardKpis} />
              <MarketingCards data={prospeccionKpis} />
              <AgendaCards data={agendaPayload.metrics} />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive data={leadsPayload.chart} />
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
