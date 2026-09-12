import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ClientesTable } from "@/components/clientes/clientes-table";
import { loadClientesData } from "@/lib/clientes/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const data = await loadClientesData();

  return (
    <AppViewLayout title="Clientes">
      <ClientesTable rows={data.table} />
    </AppViewLayout>
  );
}
