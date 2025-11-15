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
      <div className="px-4 lg:px-6">
        <DataTable
          data={leadsData.table}
          storageKey="leads-table-column-order"
        />
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
