import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { AgendaAvailabilityManager } from "@/components/agenda/agenda-availability-manager"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"

export const dynamic = "force-dynamic"

export default function AgendaDisponibilidadPage() {
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
        <SiteHeader title="Disponibilidad agenda" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                <AgendaAvailabilityManager />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
