import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { SectionCards } from "@/components/section-cards";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { loadClientesData } from "@/lib/clientes/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const data = await loadClientesData();

  return (
    <AppViewLayout title="Clientes">
      <SectionCards data={data.cards} />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={data.chart} />
      </div>
      <DataTable data={data.table} />
    </AppViewLayout>
  );
}
