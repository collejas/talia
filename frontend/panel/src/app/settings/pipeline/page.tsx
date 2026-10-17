import type { Metadata } from "next";

import { fetchPipelineStages, type PipelineStage } from "@/app/settings/pipeline/actions";
import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { PipelineStageNamesPanel } from "@/components/settings/pipeline-stage-names-panel";
import { SettingsErrorCallout } from "@/components/settings/settings-helpers";

export const metadata: Metadata = { title: "Etapas del embudo · Settings" };

export default async function PipelineSettingsPage() {
  let stages: PipelineStage[] = [];
  let loadError: unknown = null;

  try {
    stages = await fetchPipelineStages();
  } catch (error) {
    loadError = error;
  }

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        {loadError ? (
          <SettingsErrorCallout
            title="No se pudieron cargar las etapas"
            messages={[loadError instanceof Error ? loadError.message : "No se recibió una respuesta válida."]}
          />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Etapas del embudo</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Personaliza los nombres que verá tu equipo en el embudo, oportunidades, dashboards e informes.
                La estructura y la lógica comercial de cada etapa permanecen sin cambios.
              </p>
            </div>
            <PipelineStageNamesPanel initialStages={stages} />
          </>
        )}
      </div>
    </AppViewLayout>
  );
}
