import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { EmpresasPageClient } from "@/components/cuentas/empresas-page.client";
import { loadCrmAccounts } from "@/lib/crm/accounts";

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  const payload = await loadCrmAccounts();

  return (
    <AppViewLayout title="Empresas">
      {payload.errors.length > 0 ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">No se pudieron cargar todos los datos:</p>
            <ul className="list-disc pl-5">
              {payload.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        null
      )}
      <EmpresasPageClient rows={payload.rows} />
    </AppViewLayout>
  );
}
