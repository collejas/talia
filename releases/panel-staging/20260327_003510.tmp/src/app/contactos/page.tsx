import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ContactChartArea } from "@/components/contactos/chart-area"
import { ContactSectionCards } from "@/components/contactos/section-cards"
import { ContactsDataTable } from "@/components/contactos/contacts-data-table"
import { SessionRecovery } from "@/components/session-recovery"
import { loadContactosData } from "@/lib/contactos/data"

export const dynamic = "force-dynamic"

export default async function Page() {
  const contactosData = await loadContactosData()

  return (
    <AppViewLayout title="Contactos">
      <ContactSectionCards data={contactosData.cards} />
      <SessionRecovery errors={contactosData.errors} />
      {contactosData.errors.length ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">No se pudieron cargar todos los datos:</p>
            <ul className="list-disc pl-5">
              {contactosData.errors.map((message, index) => (
                <li key={index}>{sanitizeMessage(message)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="px-4 lg:px-6">
        <ContactChartArea data={contactosData.chart} />
      </div>
      <div className="px-4 lg:px-6">
        <ContactsDataTable data={contactosData.table} />
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
