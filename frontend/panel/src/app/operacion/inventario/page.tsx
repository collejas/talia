import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { OperationalInventoryWorkspace } from "@/components/inventario/operational-inventory-workspace";
import { callCrmApi } from "@/lib/api/crm";
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function OperationalInventoryPage() {
  await requireTenantModuleEnabled("productos");
  const brandResponse = await callCrmApi<{
    organization_name: string;
    logo_url: string;
    primary_color: string;
    accent_color: string;
  }>("/crm/catalogo-precios/branding");
  return (
    <AppViewLayout title="Inventario y almacenes" contentClassName="px-4 sm:px-6 lg:px-8">
      <OperationalInventoryWorkspace printBrand={brandResponse.ok ? brandResponse.data : null} />
    </AppViewLayout>
  );
}
