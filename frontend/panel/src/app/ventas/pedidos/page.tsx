import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { OrderFormalizationQueue } from "@/components/ventas/order-formalization-queue";
import { callCrmApi } from "@/lib/api/crm";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default function SalesOrdersPage() {
  return <SalesOrdersPageContent />;
}

async function SalesOrdersPageContent() {
  const canReview = await hasPermission("sales.orders.confirm");
  const brandResponse = await callCrmApi<{
    organization_name: string;
    logo_url: string;
    primary_color: string;
    accent_color: string;
  }>("/crm/catalogo-precios/branding");
  return (
    <AppViewLayout title="Órdenes de venta" contentClassName="px-4 sm:px-6 lg:px-8">
      <OrderFormalizationQueue printBrand={brandResponse.ok ? brandResponse.data : null} canReview={canReview} />
    </AppViewLayout>
  );
}
