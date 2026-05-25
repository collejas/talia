import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CuentaDetailPage({ params }: { params: Promise<{ cuentaId: string }> }) {
  const { cuentaId } = await params;
  redirect(`/empresas/${encodeURIComponent(cuentaId)}`);
}
