import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { DataTable } from "@/components/data-table";
import { loadClientesData } from "@/lib/clientes/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const data = await loadClientesData();

  return (
    <AppViewLayout title="Clientes">
      <DataTable data={data.table} columnLabels={{ reviewer: "Vendedor" }} />
    </AppViewLayout>
  );
}
