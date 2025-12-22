"use server";

import { callCrmApi } from "@/lib/api/crm";
import { adaptCard, adaptStage, parseMetadatos } from "@/lib/embudo/helpers";

const DEFAULT_LIMIT = 200;

export type EmbudoStage = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  orden: number;
  tableroId: string;
  metadatos: Record<string, unknown>;
  tarjetas: EmbudoCard[];
};

export type EmbudoCard = {
  oportunidadId: string;
  contactoId: string;
  conversacionId: string | null;
  titulo: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  notas: string | null;
  necesidadProposito: string | null;
  canal: string | null;
  estado: string | null;
  etapaId: string;
  etapaNombre: string;
  etapaCodigo: string | null;
  monto: number | null;
  moneda: string | null;
  probabilidad: number | null;
  proyectoNombre: string | null;
  proyectoNecesidades: string | null;
  asignadoId: string | null;
  asignadoNombre: string | null;
  prioridad: number;
  actualizadoEn: string | null;
  etiquetas: string[];
  metadata: Record<string, unknown>;
  autoStage: AutoStageInfo | null;
  restartSequence: number;
};

export type EmbudoData = {
  stages: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
  errors: string[];
};

export type PipelineBoardCard = {
  tarjeta_id?: string | null;
  oportunidad_id?: string | null;
  contacto_id: string | null;
  conversacion_id: string | null;
  titulo?: string | null;
  nombre?: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  notas: string | null;
  necesidad_proposito: string | null;
  canal: string | null;
  estado: string | null;
  etapa_id: string;
  etapa_codigo: string | null;
  etapa_nombre: string;
  monto: number | null;
  monto_estimado?: number | null;
  moneda: string | null;
  probabilidad: number | null;
  proyecto_nombre: string | null;
  proyecto_necesidades: string | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  prioridad: number | null;
  actualizado_en: string | null;
  etiquetas: string[] | null;
  metadata: Record<string, unknown> | null;
};

export type PipelineBoardStage = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  orden: number;
  tablero_id: string | null;
  metadatos: Record<string, unknown> | null;
  tarjetas: PipelineBoardCard[];
};

export type AutoStageInfo = {
  stageCode: string;
  source?: string;
  channel?: string;
  at?: string;
};

export type PipelineBoardResponse = {
  stages: PipelineBoardStage[];
  sin_conversacion: PipelineBoardCard[];
  visitantes_sin_chat: number;
};

function isCounterOnlyStage(metadatos: Record<string, unknown>): boolean {
  const value = metadatos["is_counter_only"];
  return value === true || value === "true";
}

export async function loadEmbudoData(): Promise<EmbudoData> {
  const boardResponse = await callCrmApi<PipelineBoardResponse>("/crm/pipeline/board", {
    searchParams: {
      limit: String(DEFAULT_LIMIT),
    },
    withUserToken: true,
  });

  const errors: string[] = [];
  if (!boardResponse.ok) errors.push(boardResponse.error);

  const { stages, sinConversacion } = boardResponse.ok
    ? adaptPipelineBoard(boardResponse.data)
    : { stages: [], sinConversacion: [] };

  const visitantesSinChat =
    boardResponse.ok && typeof boardResponse.data?.visitantes_sin_chat === "number"
      ? boardResponse.data.visitantes_sin_chat
      : 0;

  return {
    stages,
    sinConversacion,
    visitantesSinChat,
    errors: Array.from(new Set(errors)),
  };
}

function adaptPipelineBoard(
  payload?: PipelineBoardResponse,
): { stages: EmbudoStage[]; sinConversacion: EmbudoCard[] } {
  if (!payload) {
    return { stages: [], sinConversacion: [] };
  }

  const stages = Array.isArray(payload.stages)
    ? payload.stages
        .map((stage) => {
          const metadatos = parseMetadatos(stage.metadatos);
          return { stage, metadatos };
        })
        .filter(({ metadatos }) => !isCounterOnlyStage(metadatos))
        .map(({ stage, metadatos }) => adaptStage(stage, metadatos))
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    : [];

  const sinConversacion = Array.isArray(payload.sin_conversacion)
    ? payload.sin_conversacion
        .map(adaptCard)
        .sort(
          (a, b) =>
            (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) -
            (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0),
        )
    : [];

  return { stages, sinConversacion };
}
