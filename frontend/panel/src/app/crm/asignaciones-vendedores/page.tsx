import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ClientDataTable } from "@/components/client-data-table";
import { loadSalesAssignments } from "@/lib/crm/asignaciones-vendedores";

export const dynamic = "force-dynamic";

export default async function SalesAssignmentsPage() {
  const payload = await loadSalesAssignments();

  return (
    <AppViewLayout title="CRM · Auditoría de reasignaciones">
      {payload.errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {payload.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : (
        <ClientDataTable
          rows={payload.rows}
          columnLabels={{
            header: "Vendedor",
            type: "Evento",
            status: "Acuse",
            target: "Oportunidad",
            limit: "Canal",
            reviewer: "Aceptación",
          }}
        />
      )}
    </AppViewLayout>
  );
}
