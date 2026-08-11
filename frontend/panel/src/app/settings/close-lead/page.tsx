import type { Metadata } from "next";

import { fetchCloseLeadPolicy, type CloseLeadPolicy } from "@/app/settings/close-lead/actions";
import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { SettingsErrorCallout } from "@/components/settings/settings-helpers";
import { CloseLeadPolicyPanel } from "@/components/settings/close-lead-policy-panel";

export const metadata: Metadata = { title: "Cierre de oportunidades · Settings" };

export default async function CloseLeadSettingsPage() {
  let error: string | null = null;
  let whatsapp: CloseLeadPolicy | null = null;
  let webchat: CloseLeadPolicy | null = null;
  try {
    [whatsapp, webchat] = await Promise.all([
      fetchCloseLeadPolicy("whatsapp"),
      fetchCloseLeadPolicy("webchat"),
    ]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "No se pudo cargar la configuración.";
  }

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cierre de oportunidades</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Define los datos mínimos que el asistente debe tener antes de ejecutar close_lead por canal.
          </p>
        </div>
        {error ? (
          <SettingsErrorCallout title="No se pudo cargar la configuración" messages={[error]} />
        ) : whatsapp && webchat ? (
          <CloseLeadPolicyPanel initialWhatsapp={whatsapp} initialWebchat={webchat} />
        ) : (
          <SettingsErrorCallout title="Configuración incompleta" messages={["No se recibieron las políticas de cierre."]} />
        )}
      </div>
    </AppViewLayout>
  );
}
