"use server";

import { callCrmApi } from "@/lib/api/crm";
import { callSupabaseRpc } from "@/lib/leads/supabase";

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
  tarjetaId: string;
  contactoId: string;
  conversacionId: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  notas: string | null;
  necesidadProposito: string | null;
  canal: string | null;
  estado: string | null;
  etapaId: string;
  etapaNombre: string;
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
};

export type EmbudoData = {
  stages: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
  errors: string[];
};

type PipelineBoardCard = {
  tarjeta_id: string;
  contacto_id: string | null;
  conversacion_id: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  notas: string | null;
  necesidad_proposito: string | null;
  canal: string | null;
  estado: string | null;
  etapa_id: string;
  etapa_nombre: string;
  monto: number | null;
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

type PipelineBoardStage = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  orden: number;
  tablero_id: string | null;
  metadatos: Record<string, unknown> | null;
  tarjetas: PipelineBoardCard[];
};

type PipelineBoardResponse = {
  stages: PipelineBoardStage[];
  sin_conversacion: PipelineBoardCard[];
};

type VisitantesCounterRow = {
  total: number | string | null | undefined;
};

function parseMetadatos(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input;
}

function isCounterOnlyStage(metadatos: Record<string, unknown>): boolean {
  const value = metadatos["is_counter_only"];
  return value === true || value === "true";
}

export async function loadEmbudoData(): Promise<EmbudoData> {
  const [boardResponse, visitantesResult] = await Promise.all([
    callCrmApi<PipelineBoardResponse>("/crm/pipeline/board", {
      searchParams: {
        limit: String(DEFAULT_LIMIT),
      },
    }),
    callSupabaseRpc<VisitantesCounterRow[] | VisitantesCounterRow>("embudo_visitantes_contador", {
      body: {
        p_closed_after: null,
        p_closed_before: null,
      },
    }),
  ]);

  const errors: string[] = [];
  if (!boardResponse.ok) errors.push(boardResponse.error);
  if (!visitantesResult.ok) errors.push(visitantesResult.error);

  const { stages, sinConversacion } = boardResponse.ok
    ? adaptPipelineBoard(boardResponse.data)
    : { stages: [], sinConversacion: [] };

  let visitantesSinChat = 0;
  if (visitantesResult.ok) {
    const payload = visitantesResult.data;
    const row = Array.isArray(payload) ? payload[0] : payload;
    const value = row?.total;
    if (typeof value === "number") {
      visitantesSinChat = value;
    } else if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        visitantesSinChat = parsed;
      }
    }
  }

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

function adaptStage(stage: PipelineBoardStage, metadatos: Record<string, unknown>): EmbudoStage {
  const tarjetas = Array.isArray(stage.tarjetas)
    ? stage.tarjetas
        .map(adaptCard)
        .sort(
          (a, b) =>
            (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) -
            (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0),
        )
    : [];

  return {
    id: stage.id,
    nombre: stage.nombre,
    codigo: stage.codigo,
    categoria: stage.categoria,
    orden: typeof stage.orden === "number" ? stage.orden : Number.MAX_SAFE_INTEGER,
    tableroId: stage.tablero_id ?? "",
    metadatos,
    tarjetas,
  };
}

function adaptCard(card: PipelineBoardCard): EmbudoCard {
  const metadata = parseMetadatos(card.metadata);
  return {
    tarjetaId: card.tarjeta_id,
    contactoId: card.contacto_id ?? "",
    conversacionId: card.conversacion_id ?? null,
    nombre: card.nombre || "Lead sin nombre",
    correo: card.correo,
    telefono: card.telefono,
    empresa: card.empresa,
    notas: card.notas,
    necesidadProposito: card.necesidad_proposito ?? null,
    canal: card.canal,
    estado: card.estado,
    etapaId: card.etapa_id,
    etapaNombre: card.etapa_nombre,
    monto: card.monto,
    moneda: card.moneda,
    probabilidad: card.probabilidad,
    proyectoNombre: card.proyecto_nombre ?? null,
    proyectoNecesidades: card.proyecto_necesidades ?? null,
    asignadoId: card.asignado_id,
    asignadoNombre: card.asignado_nombre,
    prioridad: card.prioridad ?? 0,
    actualizadoEn: typeof card.actualizado_en === "string" ? card.actualizado_en : null,
    etiquetas: Array.isArray(card.etiquetas) ? card.etiquetas : [],
    metadata,
  };
}
