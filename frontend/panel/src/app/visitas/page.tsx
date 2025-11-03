import { AppSidebar } from "@/components/AppSidebar"
import { VisitsChartArea } from "@/components/visitas/chart-area"
import { VisitsSectionCards } from "@/components/visitas/section-cards"
import { VisitsDataTable } from "@/components/visitas/visits-data-table"
import { SiteHeader } from "@/components/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { loadVisitsData } from "@/lib/visitas/data"

export const dynamic = "force-dynamic"

export default async function Page() {
  const visitsData = await loadVisitsData()

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
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <VisitsSectionCards cards={visitsData.cards} />
            {visitsData.errors.length ? (
              <div className="px-4 lg:px-6">
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <p className="font-medium">No se pudieron cargar todos los datos:</p>
                  <ul className="list-disc pl-5">
                    {visitsData.errors.map((message, index) => (
                      <li key={index}>{sanitizeMessage(message)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            <div className="px-4 lg:px-6">
              <VisitsChartArea data={visitsData.chart} />
            </div>
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="px-4 lg:px-6">
                <VisitsDataTable data={visitsData.table} />
              </div>
            </div>
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
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy)."
  }
  return trimmed
}
