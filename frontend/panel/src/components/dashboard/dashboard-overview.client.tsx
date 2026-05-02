"use client"

import * as React from "react"

import { AttentionCards } from "@/components/dashboard/attention-cards"
import { AgendaCards } from "@/components/dashboard/agenda-cards"
import { ConversationsChannelChart } from "@/components/dashboard/conversations-channel-chart"
import { DataTable } from "@/components/data-table"
import { OpportunityCards } from "@/components/dashboard/opportunity-cards"
import { PipelineHealthChart } from "@/components/dashboard/pipeline-health-chart"
import { SalesByOwnerChart } from "@/components/dashboard/sales-by-owner-chart"
import { SalesConversionChart } from "@/components/dashboard/sales-conversion-chart"
import { SalesWonChart } from "@/components/dashboard/sales-won-chart"
import { SectionCards } from "@/components/section-cards"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import type { DashboardRange } from "@/lib/dashboard/range"
import type { AgendaMetrics } from "@/lib/agenda/data"
import type { DashboardKpis } from "@/lib/dashboard/kpis"
import type { OpportunityKpis } from "@/lib/dashboard/opportunities-kpis"
import type { LeadCards, LeadChartPoint, LeadSellerPoint, LeadTableRow } from "@/lib/leads/data"

type DashboardOverview = {
  leads: {
    cards: LeadCards
    chart: LeadChartPoint[]
    salesBySeller: LeadSellerPoint[]
    table: LeadTableRow[]
    totalRows: number
  }
  attention: DashboardKpis
  opportunity: OpportunityKpis
  agenda: AgendaMetrics
}

type DashboardOverviewResponse = {
  ok?: boolean
  overview?: DashboardOverview | null
  errors?: Record<string, string>
}

const EMPTY_OVERVIEW: DashboardOverview = {
  leads: {
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
  },
  attention: {} as DashboardKpis,
  opportunity: {
    total: 0,
    activeTotal: 0,
    montoTotal: 0,
    weightedAmount: 0,
    monedas: [],
    stale: 0,
    unassigned: 0,
    unassignedPct: 0,
    avgAgeDays: 0,
    topStage: null,
    topStaleStage: null,
    upcomingCloseCount: 0,
  },
  agenda: {
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
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="px-4 lg:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
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

function toOverview(value: DashboardOverview | null | undefined): DashboardOverview {
  return value ?? EMPTY_OVERVIEW
}

export function DashboardOverviewClient({ range }: { range: DashboardRange }) {
  const [overview, setOverview] = React.useState<DashboardOverview | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (range.rango) params.set("rango", range.rango)
    if (range.desde) params.set("desde", range.desde)
    if (range.hasta) params.set("hasta", range.hasta)

    fetch(`/api/crm/dashboard/overview?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`dashboard_overview_${response.status}`)
        }
        return response.json()
      })
      .then((json: DashboardOverviewResponse) => {
        setOverview(toOverview(json?.overview))
      })
      .catch(() => {
        setOverview(EMPTY_OVERVIEW)
      })

    return () => controller.abort()
  }, [range.desde, range.hasta, range.rango])

  if (!overview) {
    return (
      <>
        <SectionTitle label="Ventas · Leads" />
        <CardsSkeleton />
        <DualChartSkeleton />
        <SingleChartSkeleton />
        <SectionTitle label="Atención · Conversaciones" />
        <SplitSectionSkeleton />
        <SectionTitle label="Oportunidades · Pipeline" />
        <SplitSectionSkeleton reverse />
        <SectionTitle label="Agenda · Citas" />
        <CardsSkeleton />
        <SectionTitle label="Evolución de Leads" />
        <SingleChartSkeleton />
        <SectionTitle label="Tabla de Leads" />
        <Skeleton className="mx-4 h-[360px] rounded-xl lg:mx-6" />
      </>
    )
  }

  return (
    <>
      <SectionTitle label="Ventas · Leads" />
      <SectionCards data={overview.leads.cards} />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2 xl:items-stretch">
        <SalesWonChart data={overview.leads.chart} />
        <SalesByOwnerChart data={overview.leads.salesBySeller} />
      </div>
      <div className="px-4 lg:px-6">
        <SalesConversionChart data={overview.leads.cards} />
      </div>

      <SectionTitle label="Atención · Conversaciones" />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-stretch">
        <AttentionCards data={overview.attention} />
        <ConversationsChannelChart data={overview.attention} />
      </div>

      <SectionTitle label="Oportunidades · Pipeline" />
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] xl:items-stretch">
        <PipelineHealthChart data={overview.opportunity} />
        <OpportunityCards data={overview.opportunity} />
      </div>

      <SectionTitle label="Agenda · Citas" />
      <AgendaCards data={overview.agenda} />

      <SectionTitle label="Evolución de Leads" />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={overview.leads.chart} />
      </div>

      <SectionTitle label="Tabla de Leads" />
      <div className="px-4 lg:px-6">
        <DataTable data={overview.leads.table} />
      </div>
    </>
  )
}
