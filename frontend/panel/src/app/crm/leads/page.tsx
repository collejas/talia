import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ClientDataTable } from "@/components/client-data-table";
import { loadCrmLeads, loadLeadRestartStats } from "@/lib/crm/leads";

export const dynamic = "force-dynamic";

export default async function CrmLeadsPage() {
  const [leadsPayload, restartPayload] = await Promise.all([
    loadCrmLeads(),
    loadLeadRestartStats(),
  ]);

  return (
    <AppViewLayout title="CRM · Leads">
      <div className="space-y-10">
        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-semibold text-slate-900">Leads recientes</h2>
            <p className="text-sm text-slate-500">
              Listado directo desde Supabase; incluye estado, origen y vínculos básicos.
            </p>
          </header>
          {leadsPayload.errors.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {leadsPayload.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : (
            <ClientDataTable rows={leadsPayload.rows} />
          )}
        </section>

        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-semibold text-slate-900">Contactos con reinicios</h2>
            <p className="text-sm text-slate-500">
              Resumen de contactos que van por el ciclo #2 o mayor, con su etapa actual,
              vendedor asignado y monto acumulado.
            </p>
          </header>
          {restartPayload.errors.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {restartPayload.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : (
            <ClientDataTable rows={restartPayload.rows} />
          )}
        </section>
      </div>
    </AppViewLayout>
  );
}
