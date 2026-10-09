import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { TransformationWorkspace } from "@/components/inventario/transformation-workspace";

export const dynamic = "force-dynamic";

export default function OperationalTransformationsPage() {
  return (
    <AppViewLayout title="Transformaciones" contentClassName="px-4 sm:px-6 lg:px-8">
      <TransformationWorkspace />
    </AppViewLayout>
  );
}
