import type { Metadata } from "next";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { InmobiliariaContractTemplates } from "@/components/settings/inmobiliaria-contract-templates";
import { callCrmApi } from "@/lib/api/crm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contratos inmobiliarios · Settings" };

type ContractTemplate = {
  id: string;
  nombre: string;
  tipo_operacion: "reserva" | "compraventa" | "otro";
  version: number;
  contenido_plantilla: string;
  activo: boolean;
  actualizado_en: string;
};

export default async function InmobiliariaContractsSettingsPage() {
  const response = await callCrmApi<ContractTemplate[]>("/crm/inmobiliaria/contratos/plantillas?solo_activas=false", {
    withUserToken: true,
  });

  return (
    <AppViewLayout title="Settings · Contratos inmobiliarios">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Propiedades inmobiliarias</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Contratos inmobiliarios</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">Administra las plantillas que aparecerán dentro del panel Reservar. Tal-IA conserva una copia del contrato generado por operación.</p>
        </div>
        {response.ok ? <InmobiliariaContractTemplates initialTemplates={response.data ?? []} /> : <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">No se pudieron cargar las plantillas.</p>}
      </div>
    </AppViewLayout>
  );
}
