import { AppSidebar } from '@/components/AppSidebar'
import { DataTable } from '@/components/data-table'
import { SiteHeader } from '@/components/site-header'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'

import { ConversionKpiCards } from '@/components/mapa-conversion/kpi-cards'
import { LocationComparisonChart } from '@/components/mapa-conversion/location-comparison-chart'
import { loadDemografiaData } from '@/lib/mapa-conversion/api'
import data from "./data.json"

export default async function Page() {
  const demografia = await loadDemografiaData("estado")

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
        <SiteHeader title="Mapa de Conversión" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <ConversionKpiCards data={demografia} />
              <LocationComparisonChart data={demografia.map.dataset.slice(0, 8)} nivel={demografia.map.nivel} />
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
