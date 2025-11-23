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
    etapaCodigo,
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
    autoStage: resolveAutoStage(metadata, etapaCodigo),
  };
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
