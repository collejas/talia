import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { SessionRecovery } from "@/components/session-recovery"
import { LeadsRestartTableClient } from "@/components/leads/restart-table.client"
import { loadLeadsData, type RestartKpis } from "@/lib/leads/data"
import { loadSalesRepOptions } from "@/lib/leads/sales-reps"

export const dynamic = "force-dynamic"

export default async function Page() {
  const [leadsData, salesReps] = await Promise.all([
    loadLeadsData(),
    loadSalesRepOptions(),
  ])

  return (
    <AppViewLayout title="Leads">
      <SectionCards data={leadsData.cards} />
      <SessionRecovery errors={leadsData.errors} />
      {leadsData.errors.length ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">No se pudieron cargar todos los datos:</p>
            <ul className="list-disc pl-5">
              {leadsData.errors.map((message, index) => (
                <li key={index}>{sanitizeMessage(message)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={leadsData.chart} />
      </div>
      <div className="px-4 lg:px-6">
        <RestartKpiCards kpis={leadsData.restartKpis} />
      </div>
      <div className="px-4 lg:px-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Contactos con reinicios</h2>
          <p className="text-sm text-slate-500">
            Muestra a los contactos que ya van en el ciclo #2 o mayor, el monto acumulado y el vendedor que los atiende.
          </p>
        </div>
        {leadsData.restartTable.length > 0 ? (
          <LeadsRestartTableClient data={leadsData.restartTable} salesReps={salesReps} />
        ) : (
          <p className="text-sm text-slate-500">
            Aún no hay contactos con reinicios registrados en este periodo.
          </p>
        )}
      </div>
    </AppViewLayout>
  )
}

function RestartKpiCards({ kpis }: { kpis: RestartKpis }) {
  const cards = [
    {
      label: "Tasa de reconversión",
      value: `${kpis.reconversionRate.toFixed(1)}%`,
      helper: "Ciclos que llegaron a demo o ganados.",
    },
    {
      label: "Días promedio entre ciclos",
      value: `${kpis.avgDaysBetweenCycles.toFixed(1)} días`,
      helper: "Tiempo que tarda un contacto en regresar.",
    },
    {
      label: "Monto promedio por ciclo",
      value: new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      }).format(kpis.avgAmountPerCycle || 0),
      helper: "Valor generado cada vez que el contacto vuelve.",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border bg-white p-4 shadow-sm"
        >
          <p className="text-xs uppercase text-muted-foreground">{card.label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.helper}</p>
        </div>
      ))}
    </div>
  )
}

function sanitizeMessage(message: string) {
  const trimmed = message.trim()
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy)."
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "Tu sesión en Supabase caducó. Estamos intentando renovarla automáticamente; si persiste, vuelve a iniciar sesión."
  }
  return trimmed
}
