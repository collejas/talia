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
  const resolvedNombre =
    typeof card.nombre === "string" && card.nombre.trim().length ? card.nombre.trim() : null;
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
  return {
    oportunidadId,
    contactoId: card.contacto_id ?? "",
    conversacionId: resolvedConversationId,
    titulo: resolvedTitulo,
    nombre: resolvedNombre,
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
    autoStage: resolveAutoStage(metadata, etapaCodigo),
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
