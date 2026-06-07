import { AppSidebar } from '@/components/app-sidebar'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { QuoteCreationModal } from '@/components/quote-creation-modal'
import { SectionCards } from '@/components/section-cards'
import { SiteHeader } from '@/components/site-header'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'

import data from "./data.json"

export default function Page() {
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
              <div className="mx-4 rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(30,41,59,0.94)_40%,_rgba(255,255,255,0.94)_41%,_rgba(255,255,255,1))] p-6 text-white shadow-lg lg:mx-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-end">
                  <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white/80">
                        Oportunidades
                      </span>
                      <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200">
                        Flujo comercial
                      </span>
                    </div>
                    <div className="grid gap-2">
                      <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
                        Cotizador inteligente con resumen fijo y partidas editables
                      </h1>
                      <p className="max-w-3xl text-sm leading-6 text-slate-300 lg:text-base">
                        La propuesta prioriza cliente, proyecto, productos y condiciones comerciales
                        en una sola vista, con preview PDF y alertas de margen para acelerar el cierre.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                        Cliente
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                        Proyecto
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                        Partidas
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                        PDF en vivo
                      </span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                    <div className="grid gap-4">
                      <div>
                        <div className="text-sm text-white/70">Acción principal</div>
                        <div className="mt-1 text-lg font-semibold">Nueva cotización</div>
                      </div>
                      <QuoteCreationModal />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-white/10 p-3">
                          <div className="text-white/60">Estado</div>
                          <div className="mt-1 font-medium">Borrador</div>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-3">
                          <div className="text-white/60">Vigencia</div>
                          <div className="mt-1 font-medium">15 días</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
