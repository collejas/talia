import { CuentaDetailView } from "@/components/cuentas/cuenta-detail-view";
import { AppViewLayout } from "@/components/layouts/app-view-layout";

export const dynamic = "force-dynamic";

export default async function EmpresaDetailPage({ params }: { params: Promise<{ cuentaId: string }> }) {
  const { cuentaId } = await params;
  return (
    <AppViewLayout title="Detalle de empresa">
      <CuentaDetailView cuentaId={cuentaId} />
    </AppViewLayout>
  );
}
