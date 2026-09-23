import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { SalesReport } from "@/components/ventas/sales-report";

export const dynamic = "force-dynamic";

export default function VentasPage() {
  return (
    <AppViewLayout title="Ventas" contentClassName="px-4 sm:px-6 lg:px-8">
      <SalesReport />
    </AppViewLayout>
  );
}
