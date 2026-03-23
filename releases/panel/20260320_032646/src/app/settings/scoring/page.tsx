import type { Metadata } from "next";

import {
  fetchScoringConfig,
  fetchScoringFeatureStatus,
  type ScoringConfigBundle,
} from "@/app/settings/scoring/actions";
import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ScoringConfigPanel } from "@/components/settings/scoring-config-panel";
import { SettingsErrorCallout } from "@/components/settings/settings-helpers";

export const metadata: Metadata = {
  title: "Scoring IA · Settings",
};

export default async function ScoringSettingsPage() {
  let loadError: string | null = null;
  let profilingEnabled = true;
  let webchat: ScoringConfigBundle | null = null;
  let whatsapp: ScoringConfigBundle | null = null;

  try {
    const feature = await fetchScoringFeatureStatus();
    profilingEnabled = Boolean(feature.profiling_enabled);
    [whatsapp, webchat] = await Promise.all([
      fetchScoringConfig("whatsapp"),
      fetchScoringConfig("webchat"),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "No se pudo cargar configuración de scoring.";
  }

  if (!loadError && !profilingEnabled) {
    return (
      <AppViewLayout title="Settings">
        <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
          <SettingsErrorCallout
            title="Perfilamiento desactivado"
            messages={[
              "La configuración de Calificación IA está deshabilitada para este tenant por el administrador maestro.",
            ]}
          />
        </div>
      </AppViewLayout>
    );
  }

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Scoring IA por canal</h1>
          <p className="max-w-3xl text-muted-foreground">
            Administra perfiles, preguntas, repreguntas y reglas de scoring para WhatsApp y Webchat.
          </p>
        </div>
        {loadError ? (
          <SettingsErrorCallout title="No se pudo cargar la configuración" messages={[loadError]} />
        ) : whatsapp && webchat ? (
          <ScoringConfigPanel initialWhatsapp={whatsapp} initialWebchat={webchat} />
        ) : (
          <SettingsErrorCallout
            title="No se pudo cargar la configuración"
            messages={["No se recibió respuesta válida del backend."]}
          />
        )}
      </div>
    </AppViewLayout>
  );
}
