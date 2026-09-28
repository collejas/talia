import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { SalesReport } from "@/components/ventas/sales-report";
import { callCrmApi } from "@/lib/api/crm";
import type { SalesReportPrintBrand } from "@/components/ventas/sales-report-print";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const brandResponse = await callCrmApi<SalesReportPrintBrand>("/crm/catalogo-precios/branding");
  return (
    <AppViewLayout title="Ventas" contentClassName="px-4 sm:px-6 lg:px-8">
      <SalesReport printBrand={brandResponse.ok ? brandResponse.data : null} />
    </AppViewLayout>
  );
}
