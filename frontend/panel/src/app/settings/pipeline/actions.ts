"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

export type PipelineStage = {
  id: string;
  organizacion_id: string;
  codigo: string;
  nombre: string;
  orden: number;
  probabilidad: number | null;
  categoria: string;
  metadata?: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

export async function fetchPipelineStages(): Promise<PipelineStage[]> {
  const response = await callCrmApi<PipelineStage[]>("/crm/etapas", {
    withUserToken: true,
  });
  if (!response.ok) throw new Error(response.error);
  return response.data ?? [];
}

export async function renamePipelineStage(input: {
  stageId: string;
  nombre: string;
}): Promise<PipelineStage> {
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) throw new Error("El nombre de la etapa no puede estar vacío.");

  const response = await callCrmApi<PipelineStage>(
    `/crm/pipeline/stages/${encodeURIComponent(input.stageId)}`,
    {
      method: "PATCH",
      body: { nombre },
      withUserToken: true,
    },
  );
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar el nombre de la etapa." : response.error);
  }
  revalidatePath("/settings/pipeline");
  revalidatePath("/embudo");
  revalidatePath("/oportunidades");
  revalidatePath("/crm/informes");
  return response.data;
}
