import type {
  EmbudoCard,
  EmbudoStage,
  PipelineBoardCard,
  PipelineBoardStage,
} from "@/lib/embudo/data";

export function parseMetadatos(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input;
}

export function adaptCard(card: PipelineBoardCard): EmbudoCard {
  const metadata = parseMetadatos(card.metadata);
  const etapaCodigo = typeof card.etapa_codigo === "string" ? card.etapa_codigo : null;
  const oportunidadId = card.oportunidad_id ?? card.tarjeta_id ?? "";
  const metadataConversationId =
    typeof metadata.conversation_id === "string" && metadata.conversation_id.trim().length
      ? metadata.conversation_id.trim()
      : null;
  const resolvedConversationId = card.conversacion_id ?? metadataConversationId;
  const resolvedTitulo = resolveTitulo(card);
  const resolvedProfileName =
    typeof card.contacto_profile_name === "string" && card.contacto_profile_name.trim().length
      ? card.contacto_profile_name.trim()
      : null;
  const resolvedNombre =
    typeof card.nombre === "string" && card.nombre.trim().length
      ? card.nombre.trim()
      : resolvedProfileName;
  const resolvedMonto =
    typeof card.monto_estimado === "number" && Number.isFinite(card.monto_estimado)
      ? card.monto_estimado
      : card.monto ?? null;
  const resolvedEstado =
    typeof card.estado === "string" && card.estado.trim().length
      ? card.estado
      : typeof metadata.estado === "string"
        ? metadata.estado
        : null;
  const restartSequence = extractRestartSequence(metadata);
  const leadScoring = extractLeadScoring(metadata);
  return {
    oportunidadId,
    contactoId: card.contacto_id ?? "",
    conversacionId: resolvedConversationId,
    titulo: resolvedTitulo,
    nombre: resolvedNombre,
    contactoProfileName: resolvedProfileName,
    correo: card.correo,
    telefono: card.telefono,
    empresa: card.empresa,
    notas: card.notas,
    necesidadProposito: card.necesidad_proposito ?? null,
    canal: card.canal,
    estado: resolvedEstado,
    etapaId: card.etapa_id,
    etapaNombre: card.etapa_nombre,
    etapaCodigo,
    monto: resolvedMonto,
    moneda: card.moneda,
    probabilidad: card.probabilidad,
    proyectoNombre: card.proyecto_nombre ?? resolvedTitulo ?? null,
    proyectoNecesidades: card.proyecto_necesidades ?? null,
    asignadoId: card.asignado_id,
    asignadoNombre: card.asignado_nombre,
    prioridad: card.prioridad ?? 0,
    actualizadoEn: typeof card.actualizado_en === "string" ? card.actualizado_en : null,
    etiquetas: Array.isArray(card.etiquetas) ? card.etiquetas : [],
    metadata,
    leadScoring,
    autoStage: resolveAutoStage(metadata, etapaCodigo),
    restartSequence,
  };
}

function extractLeadScoring(metadata: Record<string, unknown>): EmbudoCard["leadScoring"] {
  const raw = metadata.lead_scoring;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  const scoreRaw = payload.score_total;
  const scoreTotal =
    typeof scoreRaw === "number"
      ? scoreRaw
      : typeof scoreRaw === "string"
        ? Number(scoreRaw)
        : null;
  const grade = typeof payload.grade === "string" && payload.grade.trim().length ? payload.grade.trim() : null;
  const confidence =
    typeof payload.confidence === "string" && payload.confidence.trim().length
      ? payload.confidence.trim()
      : null;
  const missing = Array.isArray(payload.missing_fields) ? payload.missing_fields.length : 0;
  const events =
    payload.events && typeof payload.events === "object" && !Array.isArray(payload.events)
      ? (payload.events as Record<string, unknown>)
      : {};
  const evasiveRaw = events.evasive_answers_count;
  const evasiveAnswersCount =
    typeof evasiveRaw === "number"
      ? evasiveRaw
      : typeof evasiveRaw === "string"
        ? Number(evasiveRaw)
        : null;
  return {
    scoreTotal: typeof scoreTotal === "number" && Number.isFinite(scoreTotal) ? scoreTotal : null,
    grade,
    confidence,
    missingFields: missing,
    evasiveAnswersCount:
      typeof evasiveAnswersCount === "number" && Number.isFinite(evasiveAnswersCount)
        ? Math.max(0, Math.round(evasiveAnswersCount))
        : null,
  };
}

function resolveTitulo(card: PipelineBoardCard): string {
  const candidates = [card.titulo, card.nombre, card.proyecto_nombre, "Oportunidad sin nombre"];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length) {
      return value.trim();
    }
  }
  return "Oportunidad sin nombre";
}

function resolveAutoStage(
  metadata: Record<string, unknown>,
  etapaCodigo: string | null,
): EmbudoCard["autoStage"] {
  if (!metadata) return null;
  const autoStageRaw = metadata["auto_stage"];
  if (!autoStageRaw || typeof autoStageRaw !== "object" || Array.isArray(autoStageRaw)) {
    return null;
  }
  const code = etapaCodigo?.toLowerCase();
  if (!code) return null;
  const entry = (autoStageRaw as Record<string, unknown>)[code];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const entryObj = entry as Record<string, unknown>;
  const source = typeof entryObj.source === "string" ? entryObj.source : undefined;
  const channel = typeof entryObj.channel === "string" ? entryObj.channel : undefined;
  const at = typeof entryObj.at === "string" ? entryObj.at : undefined;
  return {
    stageCode: code,
    source,
    channel,
    at,
  };
}

function extractRestartSequence(metadata: Record<string, unknown>): number {
  const rawValue = metadata?.restart_sequence;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue > 0 ? rawValue : 1;
  }
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1;
}

export function adaptStage(stage: PipelineBoardStage, metadatos: Record<string, unknown>): EmbudoStage {
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
