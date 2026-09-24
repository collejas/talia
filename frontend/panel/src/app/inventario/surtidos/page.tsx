import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InventoryFulfillmentQueue } from "@/components/inventario/inventory-fulfillment-queue";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function InventoryFulfillmentPage() {
  const canManageFulfillment = await hasPermission("inventory.fulfillment.manage");
  return (
    <AppViewLayout title="Surtidos de inventario" contentClassName="px-4 sm:px-6 lg:px-8">
      <InventoryFulfillmentQueue canManageFulfillment={canManageFulfillment} />
    </AppViewLayout>
  );
}
