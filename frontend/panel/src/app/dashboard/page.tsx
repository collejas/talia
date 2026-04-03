import * as React from 'react'
import { Suspense } from 'react'

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
import { ConversationsChannelChart } from '@/components/dashboard/conversations-channel-chart'
import { PipelineHealthChart } from '@/components/dashboard/pipeline-health-chart'
import { SalesWonChart } from '@/components/dashboard/sales-won-chart'
import { SalesByOwnerChart } from '@/components/dashboard/sales-by-owner-chart'
import { SalesConversionChart } from '@/components/dashboard/sales-conversion-chart'
import { Skeleton } from '@/components/ui/skeleton'

import { loadLeadsData } from "@/lib/leads/data"
import { fetchDashboardKpis } from "@/lib/dashboard/kpis"
import { fetchProspeccionMetricas } from "@/lib/dashboard/prospeccion-kpis"
import { loadAgendaData } from "@/lib/agenda/data"
import { fetchOpportunityKpis } from "@/lib/dashboard/opportunities-kpis"
import { resolveDashboardRange, type DashboardRange } from "@/lib/dashboard/range"
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

function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-40 rounded-xl" />
      ))}
    </div>
  )
}

function SingleChartSkeleton() {
  return <Skeleton className="mx-4 h-[280px] rounded-xl lg:mx-6" />
}

function DualChartSkeleton() {
  return (
    <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
      <Skeleton className="h-[320px] rounded-xl" />
      <Skeleton className="h-[320px] rounded-xl" />
    </div>
  )
}

function SplitSectionSkeleton({ reverse = false }: { reverse?: boolean }) {
  const cards = <Skeleton className="h-[340px] rounded-xl" />
  const chart = <Skeleton className="h-[340px] rounded-xl" />
  return (
    <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-stretch">
      {reverse ? chart : cards}
      {reverse ? cards : chart}
    </div>
  )
}

async function LeadsSection({ range }: { range: DashboardRange }) {
  const leadsPayload = await loadLeadsData({
    days: range.days,
    rango: range.rango ?? undefined,
    desde: range.desde ?? undefined,
    hasta: range.hasta ?? undefined,
    includeRestarts: false,
  }).catch(() => ({
    cards: {
      total: 0,
      abiertas: 0,
      ganadas: 0,
      perdidas: 0,
      nuevas: 0,
      montoTotal: 0,
      ticketPromedioGanado: 0,
      diasPromedioCierre: 0,
    },
    chart: [],
    salesBySeller: [],
    table: [],
    totalRows: 0,
    restartTable: [],
    restartKpis: { reconversionRate: 0, avgDaysBetweenCycles: 0, avgAmountPerCycle: 0 },
    errors: ["No se pudieron cargar KPIs de leads."],
  }))

  return (
    <>
      <SectionTitle label="Ventas · Leads" />
      <SectionCards data={leadsPayload.cards} />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2 xl:items-stretch">
        <SalesWonChart data={leadsPayload.chart} />
        <SalesByOwnerChart data={leadsPayload.salesBySeller} />
      </div>
      <div className="px-4 lg:px-6">
        <SalesConversionChart data={leadsPayload.cards} />
      </div>
      <SectionTitle label="Evolución de Leads" />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={leadsPayload.chart} />
      </div>
      <DataTable data={leadsPayload.table} />
    </>
  )
}

async function AttentionSection({ range }: { range: DashboardRange }) {
  const dashboardKpis = await fetchDashboardKpis({
    rango: range.rango ?? undefined,
    desde: range.desde ?? undefined,
    hasta: range.hasta ?? undefined,
  }).catch(() => null)

  return (
    <>
      <SectionTitle label="Atención · Conversaciones" />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-stretch">
        <AttentionCards data={dashboardKpis} />
        <ConversationsChannelChart data={dashboardKpis} />
      </div>
    </>
  )
}

async function OpportunitySection() {
  const opportunityKpis = await fetchOpportunityKpis().catch(() => null)

  return (
    <>
      <SectionTitle label="Oportunidades · Pipeline" />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] xl:items-stretch">
        <PipelineHealthChart data={opportunityKpis} />
        <OpportunityCards data={opportunityKpis} />
      </div>
    </>
  )
}

async function MarketingSection({ range }: { range: DashboardRange }) {
  const prospeccionPayload = await fetchProspeccionMetricas({
    date_from: range.dateFrom ?? undefined,
    date_to: range.dateTo ?? undefined,
  }).catch(() => null)

  return (
    <>
      <SectionTitle label="Marketing · Prospección" />
      <MarketingCards
        summary={prospeccionPayload?.summary ?? null}
        items={prospeccionPayload?.items ?? null}
        byRule={prospeccionPayload?.byRule ?? null}
      />
      <SectionTitle label="Rendimiento de Campañas" />
      <div className="px-4 lg:px-6">
        <MarketingTimeseries
          data={prospeccionPayload?.timeseries ?? null}
          dateFrom={range.dateFrom}
          dateTo={range.dateTo}
        />
      </div>
    </>
  )
}

async function AgendaSection({ range }: { range: DashboardRange }) {
  const agendaPayload = await loadAgendaData({
    rango: range.rango ?? undefined,
    desde: range.desde ?? undefined,
    hasta: range.hasta ?? undefined,
  }).catch(() => ({
    items: [],
    metrics: {
      total: 0,
      activas: 0,
      proximas24h: 0,
      canceladas: 0,
      realizadas: 0,
      linkedToConversation: 0,
      linkedToContact: 0,
      virtuales: 0,
      unassigned: 0,
    },
    errors: ["No se pudo cargar agenda."],
  }))

  return (
    <>
      <SectionTitle label="Agenda · Citas" />
      <AgendaCards data={agendaPayload.metrics} />
    </>
  )
}

async function CatalogSection() {
  const [salesRows, pipelineRows] = await Promise.all([
    fetchCatalogSalesKpi().catch(() => []),
    fetchCatalogPipelineKpi().catch(() => []),
  ])

  return (
    <div className="grid gap-4 px-4 lg:px-6 @[1000px]/main:grid-cols-2">
      <CatalogSalesCard data={salesRows} />
      <CatalogPipelineCard data={pipelineRows} />
    </div>
  )
}

export default async function Page({ searchParams }: DashboardPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const range = resolveDashboardRange(resolvedParams);

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

              <Suspense fallback={<><SectionTitle label="Ventas · Leads" /><CardsSkeleton /><DualChartSkeleton /><SingleChartSkeleton /><SectionTitle label="Evolución de Leads" /><SingleChartSkeleton /><SingleChartSkeleton /></>}>
                <LeadsSection range={range} />
              </Suspense>

              <Suspense fallback={<><SectionTitle label="Atención · Conversaciones" /><SplitSectionSkeleton /></>}>
                <AttentionSection range={range} />
              </Suspense>

              <Suspense fallback={<><SectionTitle label="Oportunidades · Pipeline" /><SplitSectionSkeleton reverse /></>}>
                <OpportunitySection />
              </Suspense>

              <Suspense fallback={<><SectionTitle label="Marketing · Prospección" /><CardsSkeleton /><SectionTitle label="Rendimiento de Campañas" /><SingleChartSkeleton /></>}>
                <MarketingSection range={range} />
              </Suspense>

              <Suspense fallback={<><SectionTitle label="Agenda · Citas" /><CardsSkeleton /></>}>
                <AgendaSection range={range} />
              </Suspense>

              <Suspense fallback={<DualChartSkeleton />}>
                <CatalogSection />
              </Suspense>
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
