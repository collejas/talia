import * as React from 'react'

import { AppSidebar } from '@/components/AppSidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DashboardRangeControls } from '@/components/dashboard/range-controls'
import { MarketingLazySection } from '@/components/dashboard/marketing-lazy-section'
import { CatalogLazySection } from '@/components/dashboard/catalog-lazy-section'
import { DashboardOverviewClient } from '@/components/dashboard/dashboard-overview.client'

import { resolveDashboardRange } from "@/lib/dashboard/range"
import { callCrmApi } from "@/lib/api/crm"
import { redirect } from "next/navigation"
type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: DashboardPageProps) {
  const onboarding = await callCrmApi<{ completado?: boolean; requiere_onboarding?: boolean }>("/tenant/me/onboarding", {
    organizacionId: null,
    withUserToken: true,
  })
  const resolvedParams = searchParams ? await searchParams : {};
  const enteredFromOnboarding = resolvedParams.from_onboarding === "1";
  if (!enteredFromOnboarding && onboarding.ok && onboarding.data.requiere_onboarding && onboarding.data.completado === false) {
    redirect("/onboarding")
  }
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
              <DashboardOverviewClient range={range} />

              <MarketingLazySection
                dateFrom={range.dateFrom}
                dateTo={range.dateTo}
              />

              <CatalogLazySection />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
