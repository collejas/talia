"use server";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { callCrmApi } from "@/lib/api/crm";
import { callPanelAgendaEndpoint, type AgendaActionResponse } from "@/lib/agenda/data";
import type {
  EmbudoCard,
  EmbudoStage,
  PipelineBoardCard,
  PipelineBoardStage,
} from "@/lib/embudo/data";
import { adaptCard, adaptStage, parseMetadatos } from "@/lib/embudo/helpers";

export type UpdateLeadInput = {
  oportunidadId: string;
  personaId?: string | null;
  contactoId?: string | null;
  currentCard?: EmbudoCard | null;
  currentStage?: EmbudoStage | null;
  contacto?: Record<string, unknown>;
  oportunidad?: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type CreateLeadInput = {
  stageId: string;
  tableroId: string;
  contacto: Record<string, unknown>;
  oportunidad: Record<string, unknown>;
  personaId?: string | null;
  contactId?: string | null;
  originStageId?: string | null;
  requestId?: string | null;
};

export type MoveLeadInput = {
  oportunidadId: string;
  etapaDestino: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
  fuente?: "humano" | "asistente" | "api";
  expectedEtapa?: string | null;
  estado?: "abierta" | "ganada" | "perdida";
  motivoPerdida?: string | null;
};

export type RevertLeadStageInput = {
  oportunidadId: string;
};

export type DeleteLeadInput = {
  oportunidadId: string;
  personaId?: string | null;
  contactoId?: string | null;
  motivo?: string | null;
};

export type LeadActionResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string; latestStage?: EmbudoStage; latestCard?: EmbudoCard };

export type LeadDeleteResult = { ok: true; oportunidadId: string; contactoId: string } | { ok: false; error: string };

export type LeadWorkspaceResult =
  | { ok: true; stages: EmbudoStage[]; card: EmbudoCard }
  | { ok: false; error: string };

type PipelineCardResponse = {
  stage: PipelineBoardStage;
  card: PipelineBoardCard;
};

type PipelineStageResponse = {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  categoria: string;
  metadata?: Record<string, unknown> | null;
};

export async function loadLeadWorkspace(opportunityId: string): Promise<LeadWorkspaceResult> {
  const normalizedId = opportunityId.trim();
  if (!normalizedId) return { ok: false, error: "La oportunidad no es válida." };
  const [cardResult, stagesResult] = await Promise.all([
    callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${normalizedId}`),
    callCrmApi<PipelineStageResponse[]>("/crm/etapas", { withUserToken: true }),
  ]);
  if (!cardResult.ok) {
    return { ok: false, error: cardResult.error || "No se pudo cargar la oportunidad." };
  }
  if (!cardResult.data?.card || !cardResult.data.stage) {
    return { ok: false, error: "La respuesta de la oportunidad está incompleta." };
  }
  const stages = (stagesResult.ok && Array.isArray(stagesResult.data) ? stagesResult.data : []).map((stage) =>
    adaptStage(
      {
        ...stage,
        tablero_id: null,
        metadatos: stage.metadata ?? null,
        tarjetas: [],
      },
      parseMetadatos(stage.metadata),
    ),
  );
  const currentStage = adaptStage(cardResult.data.stage, parseMetadatos(cardResult.data.stage.metadatos));
  if (!stages.some((stage) => stage.id === currentStage.id)) stages.push(currentStage);
  const card = adaptCard(cardResult.data.card);
  const personaId = card.personaId || card.contactoId;
  if (personaId) {
    const personaResult = await callCrmApi<CrmContact>(`/crm/personas/${personaId}`);
    if (personaResult.ok) {
      card.nombreNombres = sanitizeNullableString(personaResult.data.nombre_nombres ?? personaResult.data.nombre);
      card.apellidoPaterno = sanitizeNullableString(personaResult.data.apellido_paterno);
      card.apellidoMaterno = sanitizeNullableString(personaResult.data.apellido_materno);
      card.nombre = sanitizeNullableString(personaResult.data.nombre_completo) ?? card.nombre;
    }
  }
  return { ok: true, stages, card };
}

type CalendarBookingResponseRow = {
  status: string;
  booking_id: string;
  resource_id: string;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  hold_id?: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  tarjeta_id?: string | null;
};

export type ScheduleLeadDemoInput = {
  conversationId?: string | null;
  personaId?: string | null;
  contactoId?: string | null;
  oportunidadId?: string | null;
  canal?: string | null;
  startAt: string;
  notes?: string | null;
  sessionId?: string | null;
};

export type ScheduleLeadDemoResult =
  | { ok: true; booking: CalendarBookingResponseRow }
  | { ok: false; error: string };

export type ContactSearchResult = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
};

type CrmContactSearchItem = {
  id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
};

type CrmContactSearchResponse = {
  items: CrmContactSearchItem[];
  limit: number;
  offset: number;
};

type CrmContact = {
  id: string;
  nombre?: string | null;
  nombre_nombres?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombre_completo?: string | null;
  correo?: string | null;
  telefono_e164?: string | null;
  company_name?: string | null;
  notes?: string | null;
  necesidad_proposito?: string | null;
  estado?: string | null;
};

function decodeJwtUserId(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as { sub?: string; user_id?: string };
    if (payload && typeof payload.sub === "string" && payload.sub.length) {
      return payload.sub;
    }
    if (payload && typeof payload.user_id === "string" && payload.user_id.length) {
      return payload.user_id;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveCurrentUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const token =
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value;
    return decodeJwtUserId(token);
  } catch {
    return null;
  }
}

function sanitizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function removeUndefined<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key];
    }
  }
  return record;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function mapPipelineCardResponse(payload: PipelineCardResponse): { stage: EmbudoStage; card: EmbudoCard } {
  const stageMeta = parseMetadatos(payload.stage.metadatos);
  const stage = adaptStage(payload.stage, stageMeta);
  const card = adaptCard(payload.card);
  return {
    stage: {
      ...stage,
      tarjetas: [],
    },
    card,
  };
}

function patchCardFromLeadPayload(
  card: EmbudoCard,
  contactoPayload: Record<string, unknown>,
  opportunityPayload: Record<string, unknown>,
): EmbudoCard {
  const patched: EmbudoCard = {
    ...card,
    metadata: normalizeMetadata(card.metadata),
  };

  if ("nombre_completo" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.nombre_completo);
    patched.nombre = value;
  }
  if ("correo" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.correo);
    patched.correo = value;
  }
  if ("telefono_e164" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.telefono_e164);
    patched.telefono = value;
  }
  if ("company_name" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.company_name);
    patched.empresa = value;
  }
  if ("notes" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.notes);
    patched.notas = value;
  }
  if ("necesidad_proposito" in contactoPayload) {
    const value = sanitizeNullableString(contactoPayload.necesidad_proposito);
    patched.necesidadProposito = value;
  }

  if ("titulo" in opportunityPayload) {
    const value = sanitizeNullableString(opportunityPayload.titulo);
    if (value !== null) {
      patched.titulo = value;
      patched.proyectoNombre = value;
      patched.metadata = {
        ...patched.metadata,
        project_name: value,
      };
    }
  }
  if ("descripcion" in opportunityPayload) {
    const value = sanitizeNullableString(opportunityPayload.descripcion);
    patched.proyectoNecesidades = value;
  }
  if ("monto_estimado" in opportunityPayload || "monto" in opportunityPayload) {
    const montoValue =
      opportunityPayload.monto_estimado ?? opportunityPayload.monto;
    patched.monto =
      typeof montoValue === "number" && Number.isFinite(montoValue) ? montoValue : null;
  }
  if ("moneda" in opportunityPayload) {
    const value = sanitizeNullableString(opportunityPayload.moneda);
    patched.moneda = value ? value.toUpperCase() : null;
  }
  if ("probabilidad" in opportunityPayload || "probabilidad_override" in opportunityPayload) {
    const value = opportunityPayload.probabilidad ?? opportunityPayload.probabilidad_override;
    patched.probabilidad =
      typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if ("metadata" in opportunityPayload) {
    const metadata = normalizeMetadata(opportunityPayload.metadata);
    if (Object.keys(metadata).length) {
      patched.metadata = {
        ...patched.metadata,
        ...metadata,
      };
    }
  }

  return patched;
}

const LOG_PREFIX = "[embudo:createLeadCard]";

function logDebug(step: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.info(`${LOG_PREFIX} ${step}`, payload);
  } else {
    console.info(`${LOG_PREFIX} ${step}`);
  }
}

export async function scheduleLeadDemo(input: ScheduleLeadDemoInput): Promise<ScheduleLeadDemoResult> {
  const payload = removeUndefined({
    conversation_id: input.conversationId ?? undefined,
    persona_id: input.personaId ?? input.contactoId ?? undefined,
    contacto_id: input.personaId ?? input.contactoId ?? undefined,
    oportunidad_id: input.oportunidadId ?? undefined,
    canal: input.canal ?? undefined,
    start_at: input.startAt,
    notes: input.notes ?? undefined,
    session_id: input.sessionId ?? undefined,
  });

  try {
    const response = await callPanelAgendaEndpoint<AgendaActionResponse>(
      "/agenda/bookings",
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return { ok: true, booking: response.booking };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo agendar la cita.";
    return { ok: false, error: message };
  }
}

export async function searchEmbudoContacts(query: string, limit = 8): Promise<ContactSearchResult[]> {
  const trimmed = query?.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  const response = await callCrmApi<CrmContactSearchResponse>("/crm/contacts/search", {
    searchParams: {
      q: trimmed,
      limit: String(Math.max(1, Math.min(limit, 25))),
      offset: "0",
    },
  });

  if (!response.ok) {
    console.error("[embudo:searchContacts] crm-error", { error: response.error, query: trimmed });
    return [];
  }

  const rows = Array.isArray(response.data?.items) ? response.data.items : [];
  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre?.trim().length ? row.nombre.trim() : "Sin nombre",
    correo: row.correo ?? null,
    telefono: row.telefono ?? null,
    empresa: row.empresa ?? null,
  }));
}

export async function createLeadCard(input: CreateLeadInput): Promise<LeadActionResult> {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    console.error(`${LOG_PREFIX} resolve-user`, { message: "auth user missing" });
    return { ok: false, error: "No se pudo identificar al usuario actual." };
  }
  logDebug("resolve-user", { userId });

  const rawContact = input.contacto ?? {};
  const contactUpdatePayload: Record<string, unknown> = {};
  const contactRequestId = randomUUID();

  const nombreValue = sanitizeNullableString(rawContact.nombre_completo);
  const correoValue = sanitizeNullableString(
    typeof rawContact.correo === "string" ? rawContact.correo.toLowerCase() : rawContact.correo,
  );
  const telefonoValue = sanitizeNullableString(rawContact.telefono_e164);
  const companyValue = sanitizeNullableString(rawContact.company_name);
  const notesValue = sanitizeNullableString(rawContact.notes);
  const needValue = sanitizeNullableString(rawContact.necesidad_proposito);
  const explicitContactFields = [
    "nombre_nombres",
    "apellido_paterno",
    "apellido_materno",
    "correo_principal",
    "telefono_principal_e164",
    "telefono_movil_1_e164",
    "puesto",
    "area",
    "rol_decision",
    "origen",
    "persona_fisica_moral",
    "tipo",
    "razon_social",
    "rfc",
    "regimen_capital",
  ] as const;
  for (const field of explicitContactFields) {
    const value = sanitizeNullableString(rawContact[field]);
    if (value !== null) contactUpdatePayload[field] = value;
  }
  if (correoValue !== null) {
    contactUpdatePayload.correo = correoValue;
  }
  if (telefonoValue !== null) {
    contactUpdatePayload.telefono_e164 = telefonoValue;
  }

  const usingExistingContactId =
    typeof input.personaId === "string" && input.personaId.trim().length
      ? input.personaId.trim()
      : typeof input.contactId === "string"
        ? input.contactId.trim()
        : "";
  let contactId = usingExistingContactId.length ? usingExistingContactId : null;
  let createdContactId: string | null = null;

  if (contactId) {
    if (nombreValue !== null) contactUpdatePayload.nombre_completo = nombreValue;
    if (companyValue !== null) contactUpdatePayload.company_name = companyValue;
    if (notesValue !== null) contactUpdatePayload.notes = notesValue;
    if (needValue !== null) contactUpdatePayload.necesidad_proposito = needValue;
    logDebug("use-existing-contact", { contactId });
  } else {
    const contactInsertPayload: Record<string, unknown> = {
      propietario_usuario_id: userId,
      origen: "embudo_manual",
      request_id: contactRequestId,
    };
    if (nombreValue !== null) contactInsertPayload.nombre_completo = nombreValue;
    if (companyValue !== null) contactInsertPayload.company_name = companyValue;
    if (notesValue !== null) contactInsertPayload.notes = notesValue;
    if (needValue !== null) contactInsertPayload.necesidad_proposito = needValue;
    Object.assign(contactInsertPayload, contactUpdatePayload);
    removeUndefined(contactInsertPayload);

    logDebug("build-contact-payload", { insertKeys: Object.keys(contactInsertPayload) });

    const contactResult = await callCrmApi<CrmContact>("/crm/contacts", {
      method: "POST",
      body: contactInsertPayload,
    });

    if (!contactResult.ok) {
      console.error(`${LOG_PREFIX} contactos-insert-failed`, {
        error: contactResult.error,
        payload: contactInsertPayload,
      });
      return { ok: false, error: contactResult.error || "No se pudo crear el contacto del lead." };
    }
    if (!contactResult.data?.id) {
      console.error(`${LOG_PREFIX} contactos-insert-missing-id`, { payload: contactInsertPayload });
      return { ok: false, error: "No se pudo crear el contacto del lead." };
    }

    contactId = contactResult.data.id;
    createdContactId = contactResult.data.id;
    logDebug("contact-created", { contactId });
  }

  if (Object.keys(contactUpdatePayload).length) {
    logDebug("contact-update", { contactId, fields: Object.keys(contactUpdatePayload) });
    const updateResult = await callCrmApi<CrmContact>(`/crm/contacts/${contactId}`, {
      method: "PATCH",
      searchParams: { skip_conversation_sync: "true" },
      body: contactUpdatePayload,
    });
    if (!updateResult.ok) {
      console.error(`${LOG_PREFIX} contactos-update-failed`, {
        error: updateResult.error,
        contactId,
        payload: contactUpdatePayload,
      });
      return { ok: false, error: updateResult.error };
    }
  }

  removeUndefined(contactUpdatePayload);

  const opportunityInput = input.oportunidad ?? {};
  const baseMetadata = normalizeMetadata(opportunityInput.metadata);
  if (!("created_via" in baseMetadata)) {
    baseMetadata.created_via = "embudo_manual";
  }
  if (!("created_stage_id" in baseMetadata)) {
    baseMetadata.created_stage_id = input.originStageId ?? input.stageId;
  }

  const baseCanal =
    typeof baseMetadata.canal === "string" && baseMetadata.canal.trim().length
      ? baseMetadata.canal.trim()
      : null;
  const resolvedCanal =
    sanitizeNullableString(opportunityInput.canal) ??
    baseCanal ??
    "manual";

  const opportunityPayload: Record<string, unknown> = {
    etapa_id: input.stageId,
    request_id: input.requestId?.trim() || randomUUID(),
    contacto_principal_id: contactId,
    titulo:
      sanitizeNullableString(opportunityInput.titulo) ??
      sanitizeNullableString(opportunityInput.proyecto_nombre) ??
      nombreValue ??
      companyValue ??
      "Lead sin nombre",
    descripcion:
      sanitizeNullableString(opportunityInput.descripcion) ??
      sanitizeNullableString(opportunityInput.proyecto_necesidades),
    monto_estimado:
      typeof opportunityInput.monto_estimado === "number"
        ? opportunityInput.monto_estimado
        : opportunityInput.monto ?? null,
    moneda: sanitizeNullableString(opportunityInput.moneda)?.toUpperCase() ?? "MXN",
    probabilidad: opportunityInput.probabilidad_override ?? opportunityInput.probabilidad ?? null,
    propietario_usuario_id: userId,
    asignado_a_usuario_id: userId,
    metadata: {
      ...baseMetadata,
      canal: resolvedCanal,
      lead_score: opportunityInput.lead_score ?? baseMetadata.lead_score,
    },
  };
  removeUndefined(opportunityPayload);

  const response = await callCrmApi<PipelineCardResponse>("/crm/pipeline/opportunities", {
    method: "POST",
    body: opportunityPayload,
  });

  if (!response.ok) {
    console.error(`${LOG_PREFIX} opportunity-create-failed`, { error: response.error, opportunityPayload });
    if (createdContactId) {
      await callCrmApi(`/crm/contacts/${createdContactId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    return { ok: false, error: response.error };
  }

  updateTag("embudo");

  const mapped = mapPipelineCardResponse(response.data);
  if (!mapped.stage.tableroId) {
    mapped.stage.tableroId = input.tableroId;
  }

  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function updateLeadCard(input: UpdateLeadInput): Promise<LeadActionResult> {
  const contactoPayload = isRecord(input.contacto) ? removeUndefined({ ...input.contacto }) : {};
  const opportunityInput = isRecord(input.oportunidad) ? { ...input.oportunidad } : {};
  const shouldMergeMetadata = input.mergeMetadata !== false;

  let cachedCardResponse: PipelineCardResponse | null = null;
  async function loadCurrentCard(): Promise<{ ok: true; data: PipelineCardResponse } | { ok: false; error: string }> {
    if (cachedCardResponse) {
      return { ok: true, data: cachedCardResponse };
    }
    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
    if (!response.ok) {
      return { ok: false, error: response.error || "No se encontró la oportunidad solicitada." };
    }
    cachedCardResponse = response.data;
    return { ok: true, data: cachedCardResponse };
  }

  const opportunityPayload: Record<string, unknown> = {};

  if ("monto_estimado" in opportunityInput || "monto" in opportunityInput) {
    opportunityPayload.monto_estimado =
      opportunityInput.monto_estimado ?? opportunityInput.monto ?? null;
  }
  if ("moneda" in opportunityInput) {
    const monedaValue = sanitizeNullableString(opportunityInput.moneda);
    opportunityPayload.moneda = monedaValue ? monedaValue.toUpperCase() : null;
  }
  if ("probabilidad_override" in opportunityInput || "probabilidad" in opportunityInput) {
    opportunityPayload.probabilidad =
      opportunityInput.probabilidad_override ?? opportunityInput.probabilidad ?? null;
  }
  if ("titulo" in opportunityInput || "proyecto_nombre" in opportunityInput) {
    opportunityPayload.titulo =
      sanitizeNullableString(opportunityInput.titulo) ??
      sanitizeNullableString(opportunityInput.proyecto_nombre);
  }
  if ("descripcion" in opportunityInput || "proyecto_necesidades" in opportunityInput) {
    opportunityPayload.descripcion =
      sanitizeNullableString(opportunityInput.descripcion) ??
      sanitizeNullableString(opportunityInput.proyecto_necesidades);
  }
  if ("metadata" in opportunityInput) {
    const metadata = normalizeMetadata(opportunityInput.metadata);
    if (Object.keys(metadata).length) {
      opportunityPayload.metadata = metadata;
    }
  }

  if (shouldMergeMetadata && "metadata" in opportunityPayload) {
    const metadata = normalizeMetadata(opportunityPayload.metadata as Record<string, unknown>);
    if (Object.keys(metadata).length) {
      const cardResult = await loadCurrentCard();
      if (!cardResult.ok) {
        return { ok: false, error: cardResult.error };
      }
      const currentMetadata = normalizeMetadata(cardResult.data.card.metadata);
      opportunityPayload.metadata = {
        ...currentMetadata,
        ...metadata,
      };
    } else {
      delete opportunityPayload.metadata;
    }
  }

  const needsContactUpdate = Object.keys(contactoPayload).length > 0;
  const hasOpportunityUpdates = Object.keys(opportunityPayload).length > 0;
  let contactError: string | null = null;

  let contactId =
    typeof input.personaId === "string" && input.personaId.trim().length
      ? input.personaId.trim()
      : typeof input.contactoId === "string" && input.contactoId.trim().length
        ? input.contactoId.trim()
        : null;

  let contactUpdated = false;

  if (needsContactUpdate) {
    if (!contactId) {
      const currentCard = await loadCurrentCard();
      if (!currentCard.ok) {
        return { ok: false, error: currentCard.error };
      }
      contactId = currentCard.data.card.persona_id ?? currentCard.data.card.contacto_id ?? null;
    }

    if (!contactId) {
      return { ok: false, error: "No se encontró el contacto del lead." };
    }

    const contactResult = await callCrmApi<CrmContact>(`/crm/contacts/${contactId}`, {
      method: "PATCH",
      searchParams: { skip_conversation_sync: true },
      body: contactoPayload,
    });

    if (!contactResult.ok) {
      contactError = contactResult.error;
      console.error("[embudo:updateLeadCard] contact-update-failed", {
        oportunidadId: input.oportunidadId,
        contactoId: contactId,
        error: contactResult.error,
        status: contactResult.status,
      });
      cachedCardResponse = null;
    } else {
      contactUpdated = true;
      cachedCardResponse = null;
    }
  }

  let cardResponse: PipelineCardResponse | null = null;
  let opportunityError: string | null = null;
  if (hasOpportunityUpdates) {
    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${input.oportunidadId}`, {
      method: "PATCH",
      body: opportunityPayload,
    });
    if (!response.ok) {
      opportunityError = response.error;
      if (response.status === 409) {
        const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
        if (latest.ok) {
          const mapped = mapPipelineCardResponse(latest.data);
          return {
            ok: false,
            error: response.error || "El lead cambió de etapa en otra sesión. Actualizamos la información.",
            latestStage: mapped.stage,
            latestCard: mapped.card,
          };
        }
      }
      console.error("[embudo:updateLeadCard] opportunity-update-failed", {
        oportunidadId: input.oportunidadId,
        error: response.error,
        status: response.status,
        opportunityPayload,
      });
    } else {
      cardResponse = response.data;
    }
  } else {
    if (input.currentCard && input.currentStage && contactUpdated) {
      updateTag("embudo");
      return {
        ok: true,
        stage: input.currentStage,
        card: patchCardFromLeadPayload(input.currentCard, contactoPayload, opportunityPayload),
      };
    }
    if (cachedCardResponse) {
      cardResponse = cachedCardResponse;
    } else {
      const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
      if (!response.ok) {
        return { ok: false, error: response.error };
      }
      cardResponse = response.data;
    }
  }

  if (contactError || opportunityError) {
    const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
    if (latest.ok) {
      try {
        const mapped = mapPipelineCardResponse(latest.data);
        updateTag("embudo");
        return {
          ok: false,
          error: [contactError, opportunityError].filter(Boolean).join(" / "),
          latestStage: mapped.stage,
          latestCard: mapped.card,
        };
      } catch (mapError) {
        console.warn("[embudo:updateLeadCard] latest-card-parse-failed", {
          oportunidadId: input.oportunidadId,
          error: mapError instanceof Error ? mapError.message : String(mapError),
        });
      }
    }
    return {
      ok: false,
      error: [contactError, opportunityError].filter(Boolean).join(" / "),
    };
  }

  if (!cardResponse) {
    return {
      ok: false,
      error: "No se pudo actualizar la oportunidad.",
    };
  }

  updateTag("embudo");
  try {
    const mapped = mapPipelineCardResponse(cardResponse);
    return { ok: true, stage: mapped.stage, card: mapped.card };
  } catch (mapError) {
    console.warn("[embudo:updateLeadCard] response-parse-failed", {
      oportunidadId: input.oportunidadId,
      error: mapError instanceof Error ? mapError.message : String(mapError),
    });
    const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
    if (latest.ok) {
      const mapped = mapPipelineCardResponse(latest.data);
      return { ok: true, stage: mapped.stage, card: mapped.card };
    }
    return {
      ok: false,
      error: "No se pudo interpretar la respuesta del CRM después de guardar la oportunidad.",
    };
  }
}

export async function moveLeadCard(input: MoveLeadInput): Promise<LeadActionResult> {
  try {
    const payload: Record<string, unknown> = {
      etapa_id: input.etapaDestino,
      fuente: input.fuente ?? "humano",
    };

    if (input.motivo !== undefined) {
      payload.motivo = input.motivo;
    }
    if (input.expectedEtapa) {
      payload.expected_etapa_id = input.expectedEtapa;
    }
    if (input.estado) {
      payload.estado = input.estado;
    }
    if (input.estado === "perdida") {
      payload.motivo_perdida = input.motivoPerdida ?? "No especificado";
    } else if (input.motivoPerdida !== undefined) {
      payload.motivo_perdida = input.motivoPerdida;
    }
    if (input.metadata) {
      const metadata = normalizeMetadata(input.metadata);
      if (Object.keys(metadata).length) {
        payload.metadata = metadata;
      }
    }

    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${input.oportunidadId}`, {
      method: "PATCH",
      body: payload,
    });

    if (!response.ok) {
      if (response.status === 409) {
        const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
        if (latest.ok) {
          const mapped = mapPipelineCardResponse(latest.data);
          return {
            ok: false,
            error: response.error || "El lead cambió de etapa en otra sesión. Actualizamos la información.",
            latestStage: mapped.stage,
            latestCard: mapped.card,
          };
        }
      }
      return { ok: false, error: response.error };
    }

    updateTag("embudo");

    try {
      const mapped = mapPipelineCardResponse(response.data);
      return { ok: true, stage: mapped.stage, card: mapped.card };
    } catch (mapError) {
      console.warn("[embudo:moveLeadCard] parse-response-failed", {
        oportunidadId: input.oportunidadId,
        error: mapError instanceof Error ? mapError.message : String(mapError),
      });
      const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
      if (!latest.ok) {
        return {
          ok: false,
          error:
            latest.error ||
            "No se pudo actualizar la oportunidad y tampoco recuperar su estado actual.",
        };
      }
      const mapped = mapPipelineCardResponse(latest.data);
      return { ok: true, stage: mapped.stage, card: mapped.card };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo mover el lead.";
    console.error("[embudo:moveLeadCard] unexpected-error", {
      oportunidadId: input.oportunidadId,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function revertLeadCardStage(input: RevertLeadStageInput): Promise<LeadActionResult> {
  try {
    const response = await callCrmApi<PipelineCardResponse>(
      `/crm/pipeline/opportunities/${input.oportunidadId}/revert-stage`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      if (response.status === 409) {
        const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
        if (latest.ok) {
          const mapped = mapPipelineCardResponse(latest.data);
          return {
            ok: false,
            error: response.error || "La oportunidad cambió de etapa en otra sesión. Actualizamos la información.",
            latestStage: mapped.stage,
            latestCard: mapped.card,
          };
        }
      }
      return { ok: false, error: response.error };
    }

    updateTag("embudo");

    const mapped = mapPipelineCardResponse(response.data);
    return { ok: true, stage: mapped.stage, card: mapped.card };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo restaurar la etapa previa.";
    console.error("[embudo:revertLeadCardStage] unexpected-error", {
      oportunidadId: input.oportunidadId,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function deleteLeadCard(input: DeleteLeadInput): Promise<LeadDeleteResult> {
  let contactoId =
    typeof input.contactoId === "string" && input.contactoId.trim().length ? input.contactoId.trim() : null;

  if (!contactoId) {
    const cardResponse = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
    if (!cardResponse.ok) {
      return { ok: false, error: cardResponse.error };
    }
      contactoId = cardResponse.data.card.persona_id ?? cardResponse.data.card.contacto_id ?? null;
  }

  const response = await callCrmApi<unknown>(`/crm/pipeline/opportunities/${input.oportunidadId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  updateTag("embudo");
  return { ok: true, oportunidadId: input.oportunidadId, contactoId: contactoId ?? "" };
}
