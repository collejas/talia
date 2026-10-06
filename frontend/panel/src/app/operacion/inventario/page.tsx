import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { OperationalInventoryWorkspace } from "@/components/inventario/operational-inventory-workspace";

export const dynamic = "force-dynamic";

export default function OperationalInventoryPage() {
  return (
    <AppViewLayout title="Inventario y almacenes" contentClassName="px-4 sm:px-6 lg:px-8">
      <OperationalInventoryWorkspace />
    </AppViewLayout>
  );
}
