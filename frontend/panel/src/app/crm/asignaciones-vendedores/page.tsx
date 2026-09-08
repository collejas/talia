import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { SalesAssignmentResponseTimeView } from "@/components/crm/sales-assignment-response-time-view";
import { loadSalesAssignmentResponseTimeMetrics } from "@/lib/crm/asignaciones-vendedores";

export const dynamic = "force-dynamic";

export default async function SalesAssignmentsPage() {
  const payload = await loadSalesAssignmentResponseTimeMetrics({ periodo: "mes" });

  return (
    <AppViewLayout title="CRM · Tiempo de aceptación">
      <SalesAssignmentResponseTimeView data={payload.data} error={payload.error} />
    </AppViewLayout>
  );
}
