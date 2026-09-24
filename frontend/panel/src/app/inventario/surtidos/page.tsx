import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InventoryFulfillmentQueue } from "@/components/inventario/inventory-fulfillment-queue";

export const dynamic = "force-dynamic";

export default function InventoryFulfillmentPage() {
  return (
    <AppViewLayout title="Surtidos de inventario" contentClassName="px-4 sm:px-6 lg:px-8">
      <InventoryFulfillmentQueue />
    </AppViewLayout>
  );
}
