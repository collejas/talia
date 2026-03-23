import { AppSidebar } from '@/components/AppSidebar'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CatalogSalesCard } from '@/components/dashboard/catalog-sales-card'
import { CatalogPipelineCard } from '@/components/dashboard/catalog-pipeline-card'

import data from "./data.json"
import { fetchCatalogPipelineKpi, fetchCatalogSalesKpi } from "./catalog-analytics"

export default async function Page() {
  const [salesRows, pipelineRows] = await Promise.all([
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
              <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <div className="grid gap-4 px-4 lg:px-6 @[1000px]/main:grid-cols-2">
                <CatalogSalesCard data={salesRows} />
                <CatalogPipelineCard data={pipelineRows} />
              </div>
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
