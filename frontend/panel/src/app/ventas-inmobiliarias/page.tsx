import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InmobiliariaSalesView } from "@/components/ventas-inmobiliarias/inmobiliaria-sales-view";
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function VentasInmobiliariasPage() {
  await requireTenantModuleEnabled("propiedades");

  return (
    <AppViewLayout title="Ventas inmobiliarias">
      <InmobiliariaSalesView />
    </AppViewLayout>
  );
}
