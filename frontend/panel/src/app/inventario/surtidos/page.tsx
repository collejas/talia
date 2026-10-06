import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InventoryFulfillmentQueue } from "@/components/inventario/inventory-fulfillment-queue";
import { hasPermission } from "@/lib/auth/permissions";
import { callCrmApi } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

export default async function InventoryFulfillmentPage() {
  const canManageFulfillment = await hasPermission("inventory.fulfillment.manage");
  const brandResponse = await callCrmApi<{
    organization_name: string;
    logo_url: string;
    primary_color: string;
    accent_color: string;
  }>("/crm/catalogo-precios/branding");
  return (
    <AppViewLayout title="Surtidos de inventario" contentClassName="px-4 sm:px-6 lg:px-8">
      <InventoryFulfillmentQueue canManageFulfillment={canManageFulfillment} printBrand={brandResponse.ok ? brandResponse.data : null} />
    </AppViewLayout>
  );
}
