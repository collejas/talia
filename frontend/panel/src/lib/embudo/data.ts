"use server";

import { performance } from "node:perf_hooks";

import { callCrmApi } from "@/lib/api/crm";
import { adaptCard, adaptStage, parseMetadatos } from "@/lib/embudo/helpers";

export type LoadEmbudoOptions = {
  limit?: number;
  asignadoId?: string | null;
  days?: number | null;
  canal?: string | null;
  estado?: string | null;
  q?: string | null;
  correo?: string | null;
  etapaIds?: string[] | null;
  tieneCita?: string | null;
};

const DEFAULT_LIMIT = 200;

export type EmbudoStage = {
  id: string;
  filterEtapaIds: string[];
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
  codigoOportunidad: string | null;
  personaId: string;
  contactoId: string;
  conversacionId: string | null;
  createdVia: string | null;
  contactOrigin: string | null;
  titulo: string;
  nombre: string | null;
  nombreNombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  personaFisicaMoral: string | null;
  razonSocial: string | null;
  rfc: string | null;
  regimenCapital: string | null;
  contactoProfileName: string | null;
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
  leadScoring: {
    scoreTotal: number | null;
    grade: string | null;
    confidence: string | null;
    missingFields: number;
    evasiveAnswersCount: number | null;
  } | null;
  autoStage: AutoStageInfo | null;
  restartSequence: number;
};

export type EmbudoData = {
  stages: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
  scoringKpis: EmbudoScoringKpis | null;
  errors: string[];
};

export type EmbudoScoringKpis = {
  window_days: number;
  total_eventos: number;
  oportunidades_unicas: number;
  score_promedio: number | null;
  distribucion_grade: Record<string, number>;
  distribucion_confidence: Record<string, number>;
  acepta_preguntas_pct: number | null;
  agenda_cita_pct: number | null;
  confirma_cita_pct: number | null;
  asiste_cita_pct: number | null;
  evasivas_promedio: number | null;
  respuesta_bucket: Record<string, number>;
  event_based?: EmbudoScoringKpisSlice | null;
  opportunity_latest_based?: EmbudoScoringKpisSlice | null;
};

export type EmbudoScoringKpisSlice = {
  total_eventos: number;
  oportunidades_unicas: number;
  score_promedio: number | null;
  distribucion_grade: Record<string, number>;
  distribucion_confidence: Record<string, number>;
  acepta_preguntas_pct: number | null;
  agenda_cita_pct: number | null;
  confirma_cita_pct: number | null;
  asiste_cita_pct: number | null;
  evasivas_promedio: number | null;
  respuesta_bucket: Record<string, number>;
};

export type PipelineBoardCard = {
  tarjeta_id?: string | null;
  oportunidad_id?: string | null;
  codigo_oportunidad?: string | null;
  persona_id?: string | null;
  contacto_id: string | null;
  conversacion_id: string | null;
  origen?: string | null;
  titulo?: string | null;
  nombre?: string | null;
  nombre_nombres?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  persona_fisica_moral?: string | null;
  razon_social?: string | null;
  rfc?: string | null;
  regimen_capital?: string | null;
  contacto_profile_name?: string | null;
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
  filter_etapa_ids?: string[] | null;
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

export async function loadEmbudoData(options: LoadEmbudoOptions = {}): Promise<EmbudoData> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const days =
    typeof options.days === "number" && Number.isFinite(options.days)
      ? Math.max(1, Math.floor(options.days))
      : null;
  const etapaIds = Array.isArray(options.etapaIds)
    ? options.etapaIds.map((value) => value.trim()).filter(Boolean)
    : [];
  const startedAt = performance.now();
  console.info("[embudo:load] start", {
    limit,
    days,
    asignadoId: options.asignadoId ?? null,
    canal: options.canal ?? null,
    estado: options.estado ?? null,
    q: options.q ?? null,
    correo: options.correo ?? null,
    etapaIds,
    tieneCita: options.tieneCita ?? null,
  });

  const boardStartedAt = performance.now();
  const boardPromise = callCrmApi<PipelineBoardResponse>("/crm/pipeline/board", {
    searchParams: {
      limit: String(limit),
      ...(options.asignadoId ? { asignado_id: options.asignadoId } : {}),
      ...(options.canal ? { canal: options.canal } : {}),
      ...(options.estado ? { estado: options.estado } : {}),
      ...(options.q ? { q: options.q } : {}),
      ...(options.correo ? { correo: options.correo } : {}),
      ...(etapaIds.length ? { etapa_ids: etapaIds.join(",") } : {}),
      ...(options.tieneCita ? { tiene_cita: options.tieneCita } : {}),
      ...(days !== null ? { days: String(days) } : {}),
    },
    withUserToken: true,
  }).then((result) => {
    console.info("[embudo:load] board-finished", {
      ok: result.ok,
      status: result.ok ? 200 : result.status ?? null,
      elapsed_ms: Math.round(performance.now() - boardStartedAt),
    });
    return result;
  });

  const scoringStartedAt = performance.now();
  const scoringPromise = callCrmApi<EmbudoScoringKpis>("/crm/pipeline/scoring/kpis", {
    searchParams: {
      ...(days !== null ? { days: String(days) } : {}),
      ...(options.asignadoId ? { asignado_id: options.asignadoId } : {}),
      ...(options.canal ? { canal: options.canal } : {}),
      ...(options.estado ? { estado: options.estado } : {}),
      ...(options.q ? { q: options.q } : {}),
      ...(options.correo ? { correo: options.correo } : {}),
      ...(etapaIds.length ? { etapa_ids: etapaIds.join(",") } : {}),
      ...(options.tieneCita ? { tiene_cita: options.tieneCita } : {}),
    },
    withUserToken: true,
  }).then((result) => {
    console.info("[embudo:load] scoring-finished", {
      ok: result.ok,
      status: result.ok ? 200 : result.status ?? null,
      elapsed_ms: Math.round(performance.now() - scoringStartedAt),
    });
    return result;
  });

  const [boardResponse, scoringResponse] = await Promise.all([boardPromise, scoringPromise]);

  const errors: string[] = [];
  if (!boardResponse.ok) errors.push(boardResponse.error);
  if (!scoringResponse.ok) errors.push(scoringResponse.error);

  const { stages, sinConversacion } = boardResponse.ok
    ? adaptPipelineBoard(boardResponse.data)
    : { stages: [], sinConversacion: [] };

  const visitantesSinChat =
    boardResponse.ok && typeof boardResponse.data?.visitantes_sin_chat === "number"
      ? boardResponse.data.visitantes_sin_chat
      : 0;

  const result = {
    stages,
    sinConversacion,
    visitantesSinChat,
    scoringKpis: scoringResponse.ok ? scoringResponse.data : null,
    errors: Array.from(new Set(errors)),
  };

  console.info("[embudo:load] done", {
    elapsed_ms: Math.round(performance.now() - startedAt),
    stages: stages.length,
    sinConversacion: sinConversacion.length,
    visitors: visitantesSinChat,
    errors: errors.length,
  });

  return result;
}

function adaptPipelineBoard(
  payload?: PipelineBoardResponse,
): { stages: EmbudoStage[]; sinConversacion: EmbudoCard[] } {
  if (!payload) {
    return { stages: [], sinConversacion: [] };
  }

  const stages = Array.isArray(payload.stages)
    ? (() => {
        const stageMap = new Map<string, EmbudoStage>();
        for (const stage of payload.stages) {
          const metadatos = parseMetadatos(stage.metadatos);
          if (isCounterOnlyStage(metadatos)) {
            continue;
          }
          const adapted = adaptStage(stage, metadatos);
          const dedupeKey = resolveTerminalStageKey(adapted.codigo, adapted.categoria);
          if (!dedupeKey) {
            stageMap.set(`${adapted.id}`, adapted);
            continue;
          }
          const existing = stageMap.get(dedupeKey);
          if (existing) {
            existing.tarjetas.push(...adapted.tarjetas);
            existing.filterEtapaIds = Array.from(
              new Set([...existing.filterEtapaIds, ...adapted.filterEtapaIds]),
            );
            existing.orden = Math.min(existing.orden, adapted.orden);
            if (!existing.tableroId && adapted.tableroId) {
              existing.tableroId = adapted.tableroId;
            }
            continue;
          }
          // `id` se usa como etapa_id en los filtros y movimientos. El código
          // terminal solo sirve como clave de consolidación; no puede sustituir
          // al UUID que exige oportunidades.etapa_id.
          stageMap.set(dedupeKey, adapted);
        }

        return [...stageMap.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
      })()
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

function resolveTerminalStageKey(code: string, categoria: string): string | null {
  const normalizedCode = code.trim().toLowerCase();
  const normalizedCategory = categoria.trim().toLowerCase();
  if (
    normalizedCode === "cerrado_ganado" ||
    normalizedCode === "ganado" ||
    normalizedCode.endsWith("_ganado") ||
    normalizedCategory === "ganada"
  ) {
    return "cerrado_ganado";
  }
  if (
    normalizedCode === "cerrado_perdido" ||
    normalizedCode === "perdido" ||
    normalizedCode.endsWith("_perdido") ||
    normalizedCategory === "perdida"
  ) {
    return "cerrado_perdido";
  }
  return null;
}
