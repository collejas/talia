import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { TransformationWorkspace } from "@/components/inventario/transformation-workspace";
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

export default async function OperationalTransformationsPage() {
  await requireTenantModuleEnabled("productos");
  return (
    <AppViewLayout title="Transformaciones" contentClassName="px-4 sm:px-6 lg:px-8">
      <TransformationWorkspace />
    </AppViewLayout>
  );
}
