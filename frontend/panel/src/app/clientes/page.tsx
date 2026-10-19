import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ClientesTable } from "@/components/clientes/clientes-table";
import { loadClientesData } from "@/lib/clientes/data";
import { fetchTenantModuleFlags } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [data, moduleFlags] = await Promise.all([loadClientesData(), fetchTenantModuleFlags()]);

  return (
    <AppViewLayout title="Clientes">
      <ClientesTable rows={data.table} showPropertyColumns={moduleFlags.propiedadesEnabled} />
    </AppViewLayout>
  );
}
