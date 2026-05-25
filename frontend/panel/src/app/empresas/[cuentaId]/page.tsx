import { CuentaDetailView } from "@/components/cuentas/cuenta-detail-view";

export const dynamic = "force-dynamic";

export default async function EmpresaDetailPage({ params }: { params: Promise<{ cuentaId: string }> }) {
  const { cuentaId } = await params;
  return <CuentaDetailView cuentaId={cuentaId} />;
}
