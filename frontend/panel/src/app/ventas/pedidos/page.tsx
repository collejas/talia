import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { OrderFormalizationQueue } from "@/components/ventas/order-formalization-queue";

export const dynamic = "force-dynamic";

export default function SalesOrdersPage() {
  return (
    <AppViewLayout title="Pedidos por formalizar" contentClassName="px-4 sm:px-6 lg:px-8">
      <OrderFormalizationQueue />
    </AppViewLayout>
  );
}
