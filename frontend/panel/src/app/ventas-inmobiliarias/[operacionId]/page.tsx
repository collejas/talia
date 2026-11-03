import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InmobiliariaOperationDetailView } from "@/components/ventas-inmobiliarias/inmobiliaria-operation-detail-view";
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function VentaInmobiliariaDetailPage({ params }: { params: Promise<{ operacionId: string }> }) {
  await requireTenantModuleEnabled("propiedades");
  const { operacionId } = await params;

  return (
    <AppViewLayout title="Expediente inmobiliario" contentClassName="px-4 sm:px-6 lg:px-8">
      <InmobiliariaOperationDetailView operationId={operacionId} />
    </AppViewLayout>
  );
}
