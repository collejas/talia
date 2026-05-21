import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { PropertyMapClient } from "@/components/mapa-de-propiedades/property-map-client";
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function Propiedades3DPage() {
  await requireTenantModuleEnabled("propiedades");
  return (
    <AppViewLayout title="Propiedades 3D">
      <PropertyMapClient />
    </AppViewLayout>
  );
}
