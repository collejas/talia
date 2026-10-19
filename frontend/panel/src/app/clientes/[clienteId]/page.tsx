import { ClienteHistorialView } from "@/components/clientes/cliente-historial-view";
import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { callCrmApi } from "@/lib/api/crm";
import type { ClienteRecord } from "@/types/clientes";
import { fetchTenantModuleFlags } from "@/lib/settings/module-flags";

export const dynamic = "force-dynamic";

type ClienteHistory = {
  cliente: ClienteRecord;
  oportunidades: Array<Record<string, unknown>>;
  cotizaciones: Array<Record<string, unknown>>;
  ventas: Array<Record<string, unknown>>;
  venta_items: Array<Record<string, unknown>>;
  propiedades: Array<Record<string, unknown>>;
  pagos: Array<Record<string, unknown>>;
};

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const response = await callCrmApi<ClienteHistory>(
    `/crm/clientes/${encodeURIComponent(clienteId)}/historial`,
    { withUserToken: true },
  );
  const moduleFlags = await fetchTenantModuleFlags();

  return (
    <AppViewLayout title="Detalle de cliente">
      {response.ok ? (
        <ClienteHistorialView history={response.data} showPropertyHistory={moduleFlags.propiedadesEnabled} />
      ) : (
        <div className="px-6 py-8 text-sm text-muted-foreground">
          No se pudo cargar el historial del cliente.
        </div>
      )}
    </AppViewLayout>
  );
}
