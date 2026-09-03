import type {
  EmbudoCard,
  EmbudoStage,
  PipelineBoardCard,
  PipelineBoardStage,
} from "@/lib/embudo/data";
import { PROSPECCION_SOURCE_LABELS } from "@/lib/prospeccion/source-labels";

export type WhatsappCtaAttribution = {
  campaign: string | null;
  rule: string | null;
  channel: string | null;
};

export function resolveWhatsappCtaAttribution(
  metadata: Record<string, unknown> | null | undefined,
): WhatsappCtaAttribution | null {
  const raw = metadata?.publicidad_whatsapp_atribucion;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const detail = raw as Record<string, unknown>;
  const readText = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  };
  const attribution: WhatsappCtaAttribution = {
    campaign: readText(detail.campana_publicitaria),
    rule: readText(detail.regla_nombre),
    channel: readText(detail.canal_publicitario),
  };

  return attribution.campaign || attribution.rule || attribution.channel ? attribution : null;
}

export function buildWhatsappCtaTooltip(attribution: WhatsappCtaAttribution | null): string {
  if (!attribution) return "CTA de WhatsApp";
  const details = [
    attribution.campaign ? `Campaña: ${attribution.campaign}` : null,
    attribution.rule ? `Regla: ${attribution.rule}` : null,
    attribution.channel ? `Canal: ${attribution.channel}` : null,
  ].filter(Boolean);
  return details.length ? `CTA de WhatsApp · ${details.join(" · ")}` : "CTA de WhatsApp";
}

export function parseMetadatos(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input;
}

function normalizePersonaFisicaMoral(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["fisica", "pfae", "pfea", "persona_fisica_actividad_empresarial"].includes(normalized)) {
    return "fisica";
  }
  if (["moral", "empresa", "persona_moral"].includes(normalized)) {
    return "moral";
  }
  return normalized;
}

export function adaptCard(card: PipelineBoardCard): EmbudoCard {
  const metadata = parseMetadatos(card.metadata);
  const etapaCodigo = typeof card.etapa_codigo === "string" ? card.etapa_codigo : null;
  const oportunidadId = card.oportunidad_id ?? card.tarjeta_id ?? "";
  const codigoOportunidad =
    typeof card.codigo_oportunidad === "string" && card.codigo_oportunidad.trim().length
      ? card.codigo_oportunidad.trim()
      : typeof metadata.codigo_oportunidad === "string" && metadata.codigo_oportunidad.trim().length
        ? metadata.codigo_oportunidad.trim()
        : null;
  const metadataConversationId =
    typeof metadata.conversation_id === "string" && metadata.conversation_id.trim().length
      ? metadata.conversation_id.trim()
      : null;
  const resolvedConversationId = card.conversacion_id ?? metadataConversationId;
  const createdVia =
    typeof metadata.created_via === "string" && metadata.created_via.trim().length
      ? metadata.created_via.trim()
      : null;
  const contactOrigin = resolveContactOrigin(card, metadata);
  const resolvedProfileName =
    typeof card.contacto_profile_name === "string" && card.contacto_profile_name.trim().length
      ? card.contacto_profile_name.trim()
      : null;
  const resolvedNombre =
    typeof card.nombre === "string" && card.nombre.trim().length
      ? card.nombre.trim()
      : typeof metadata.contacto_nombre === "string" && metadata.contacto_nombre.trim().length
        ? metadata.contacto_nombre.trim()
        : resolvedProfileName;
  const resolvedCorreo =
    typeof card.correo === "string" && card.correo.trim().length
      ? card.correo.trim()
      : typeof metadata.contacto_correo === "string" && metadata.contacto_correo.trim().length
        ? metadata.contacto_correo.trim()
        : null;
  const resolvedTelefono =
    typeof card.telefono === "string" && card.telefono.trim().length
      ? card.telefono.trim()
      : typeof metadata.contacto_telefono === "string" && metadata.contacto_telefono.trim().length
        ? metadata.contacto_telefono.trim()
        : null;
  const resolvedEmpresa =
    typeof card.empresa === "string" && card.empresa.trim().length
      ? card.empresa.trim()
      : typeof metadata.contacto_empresa === "string" && metadata.contacto_empresa.trim().length
        ? metadata.contacto_empresa.trim()
        : null;
  const resolvedNotas =
    typeof card.notas === "string" && card.notas.trim().length
      ? card.notas.trim()
      : typeof metadata.contacto_notas === "string" && metadata.contacto_notas.trim().length
        ? metadata.contacto_notas.trim()
        : null;
  const resolvedNecesidadProposito =
    typeof card.necesidad_proposito === "string" && card.necesidad_proposito.trim().length
      ? card.necesidad_proposito.trim()
      : typeof metadata.contacto_necesidad === "string" && metadata.contacto_necesidad.trim().length
        ? metadata.contacto_necesidad.trim()
        : null;
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
  const resolvedTitulo = resolveTitulo(card, resolvedNombre, resolvedProfileName);
  const personaId = card.persona_id ?? card.contacto_id ?? "";
  return {
    oportunidadId,
    codigoOportunidad,
    personaId,
    contactoId: card.contacto_id ?? "",
    conversacionId: resolvedConversationId,
    createdVia,
    contactOrigin,
    titulo: resolvedTitulo,
    nombre: resolvedNombre,
    nombreNombres:
      typeof card.nombre_nombres === "string" && card.nombre_nombres.trim().length
        ? card.nombre_nombres.trim()
        : null,
    apellidoPaterno:
      typeof card.apellido_paterno === "string" && card.apellido_paterno.trim().length
        ? card.apellido_paterno.trim()
        : null,
    apellidoMaterno:
      typeof card.apellido_materno === "string" && card.apellido_materno.trim().length
        ? card.apellido_materno.trim()
        : null,
    personaFisicaMoral: normalizePersonaFisicaMoral(card.persona_fisica_moral),
    razonSocial:
      typeof card.razon_social === "string" && card.razon_social.trim().length
        ? card.razon_social.trim()
        : null,
    rfc: typeof card.rfc === "string" && card.rfc.trim().length ? card.rfc.trim() : null,
    regimenCapital:
      typeof card.regimen_capital === "string" && card.regimen_capital.trim().length
        ? card.regimen_capital.trim()
        : null,
    contactoProfileName: resolvedProfileName,
    correo: resolvedCorreo,
    telefono: resolvedTelefono,
    empresa: resolvedEmpresa,
    notas: resolvedNotas,
    necesidadProposito: resolvedNecesidadProposito,
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

function resolveContactOrigin(
  card: PipelineBoardCard,
  metadata: Record<string, unknown>,
): EmbudoCard["contactOrigin"] {
  const rawCandidates = [
    card.origen,
    metadata["contacto_origen"],
    metadata["contact_origin"],
    metadata["origen_contacto"],
    metadata["contact_source"],
  ];
  for (const candidate of rawCandidates) {
    const normalized = normalizeContactOrigin(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeContactOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    denue: PROSPECCION_SOURCE_LABELS.denue,
    "google_places": "Google",
    google: "Google",
    manual_panel_contactos: "Manual",
    agenda_manual: "Manual",
    manual: "Manual",
    usuario: "Manual",
    importado: "Importado",
    imported: "Importado",
    webchat: "Webchat",
    whatsapp: "WhatsApp",
    email: "Email",
    correo: "Email",
    voz: "Voz",
    phone: "Voz",
  };
  if (aliases[lower]) {
    return aliases[lower];
  }
  return trimmed
    .split(/[_\-\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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

function normalizeComparableLabel(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveTitulo(
  card: PipelineBoardCard,
  resolvedNombre: string | null,
  resolvedProfileName: string | null,
): string {
  const fallbackCandidates = [card.proyecto_nombre, card.empresa, "Oportunidad sin nombre"];
  const titleValue = typeof card.titulo === "string" ? card.titulo.trim() : "";
  const comparableTitle = normalizeComparableLabel(titleValue);
  const comparableName = normalizeComparableLabel(resolvedNombre);
  const comparableProfile = normalizeComparableLabel(resolvedProfileName);
  const titleLooksLikeContact = Boolean(comparableTitle) && (
    comparableTitle === comparableName ||
    comparableTitle === comparableProfile
  );
  if (titleValue && !titleLooksLikeContact) {
    return titleValue;
  }
  const candidates = [...fallbackCandidates];
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
    nombre: stage.codigo === "demo" ? "Cita agendada" : stage.nombre,
    codigo: stage.codigo,
    categoria: stage.categoria,
    orden: typeof stage.orden === "number" ? stage.orden : Number.MAX_SAFE_INTEGER,
    tableroId: stage.tablero_id ?? "",
    metadatos,
    tarjetas,
  };
}
