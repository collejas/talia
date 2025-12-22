import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import { SessionRecovery } from "@/components/session-recovery"
import { loadLeadsData } from "@/lib/leads/data"

export const dynamic = "force-dynamic"

export default async function Page() {
  const leadsData = await loadLeadsData()

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
      <div className="px-4 lg:px-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Contactos con reinicios</h2>
          <p className="text-sm text-slate-500">
            Muestra a los contactos que ya van en el ciclo #2 o mayor, el monto acumulado y el vendedor que los atiende.
          </p>
        </div>
        {leadsData.restartTable.length > 0 ? (
          <DataTable
            data={leadsData.restartTable}
            storageKey="leads-restarts-table-column-order"
            columnLabels={{
              header: "Contacto",
              type: "Etapa actual",
              status: "Reinicio",
              target: "Monto total",
              reviewer: "Vendedor",
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Aún no hay contactos con reinicios registrados en este periodo.
          </p>
        )}
      </div>
    </AppViewLayout>
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
