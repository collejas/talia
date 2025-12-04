"use server";

import { Buffer } from "node:buffer";

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
  contactoId?: string | null;
  contacto?: Record<string, unknown>;
  oportunidad?: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type CreateLeadInput = {
  stageId: string;
  tableroId: string;
  contacto: Record<string, unknown>;
  oportunidad: Record<string, unknown>;
  contactId?: string | null;
};

export type MoveLeadInput = {
  oportunidadId: string;
  etapaDestino: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
  fuente?: "humano" | "asistente" | "api";
  expectedEtapa?: string | null;
};

export type DeleteLeadInput = {
  oportunidadId: string;
  contactoId?: string | null;
  motivo?: string | null;
};

export type LeadActionResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string; latestStage?: EmbudoStage; latestCard?: EmbudoCard };

export type LeadDeleteResult = { ok: true; oportunidadId: string; contactoId: string } | { ok: false; error: string };

type PipelineCardResponse = {
  stage: PipelineBoardStage;
  card: PipelineBoardCard;
};

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
    contacto_id: input.contactoId ?? undefined,
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
    const message = error instanceof Error ? error.message : "No se pudo agendar la demo.";
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

  const nombreValue = sanitizeNullableString(rawContact.nombre_completo);
  const correoValue = sanitizeNullableString(
    typeof rawContact.correo === "string" ? rawContact.correo.toLowerCase() : rawContact.correo,
  );
  const telefonoValue = sanitizeNullableString(rawContact.telefono_e164);
  const companyValue = sanitizeNullableString(rawContact.company_name);
  const notesValue = sanitizeNullableString(rawContact.notes);
  const needValue = sanitizeNullableString(rawContact.necesidad_proposito);
  if (correoValue !== null) {
    contactUpdatePayload.correo = correoValue;
  }
  if (telefonoValue !== null) {
    contactUpdatePayload.telefono_e164 = telefonoValue;
  }

  const usingExistingContactId = typeof input.contactId === "string" ? input.contactId.trim() : "";
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
    };
    if (nombreValue !== null) contactInsertPayload.nombre_completo = nombreValue;
    if (companyValue !== null) contactInsertPayload.company_name = companyValue;
    if (notesValue !== null) contactInsertPayload.notes = notesValue;
    if (needValue !== null) contactInsertPayload.necesidad_proposito = needValue;
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
    baseMetadata.created_stage_id = input.stageId;
  }

  const opportunityPayload: Record<string, unknown> = {
    etapa_id: input.stageId,
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
      canal: opportunityInput.canal ?? baseMetadata.canal,
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
  const oportunidadPayload = isRecord(input.oportunidad) ? { ...input.oportunidad } : {};
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

  if ("monto_estimado" in oportunidadPayload || "monto" in oportunidadPayload) {
    opportunityPayload.monto_estimado =
      oportunidadPayload.monto_estimado ?? oportunidadPayload.monto ?? null;
  }
  if ("moneda" in oportunidadPayload) {
    const monedaValue = sanitizeNullableString(oportunidadPayload.moneda);
    opportunityPayload.moneda = monedaValue ? monedaValue.toUpperCase() : null;
  }
  if ("probabilidad_override" in oportunidadPayload || "probabilidad" in oportunidadPayload) {
    opportunityPayload.probabilidad =
      oportunidadPayload.probabilidad_override ?? oportunidadPayload.probabilidad ?? null;
  }
  if ("titulo" in oportunidadPayload || "proyecto_nombre" in oportunidadPayload) {
    opportunityPayload.titulo =
      sanitizeNullableString(oportunidadPayload.titulo) ??
      sanitizeNullableString(oportunidadPayload.proyecto_nombre);
  }
  if ("descripcion" in oportunidadPayload || "proyecto_necesidades" in oportunidadPayload) {
    opportunityPayload.descripcion =
      sanitizeNullableString(oportunidadPayload.descripcion) ??
      sanitizeNullableString(oportunidadPayload.proyecto_necesidades);
  }
  if ("metadata" in oportunidadPayload) {
    const metadata = normalizeMetadata(oportunidadPayload.metadata);
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

  let contactId =
    typeof input.contactoId === "string" && input.contactoId.trim().length ? input.contactoId.trim() : null;

  if (needsContactUpdate) {
    if (!contactId) {
      const currentCard = await loadCurrentCard();
      if (!currentCard.ok) {
        return { ok: false, error: currentCard.error };
      }
      contactId = currentCard.data.card.contacto_id ?? null;
    }

    if (!contactId) {
      return { ok: false, error: "No se encontró el contacto del lead." };
    }

    const contactResult = await callCrmApi<CrmContact>(`/crm/contacts/${contactId}`, {
      method: "PATCH",
      body: contactoPayload,
    });

    if (!contactResult.ok) {
      return { ok: false, error: contactResult.error };
    }
  }

  let cardResponse: PipelineCardResponse | null = null;
  if (hasOpportunityUpdates) {
    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${input.oportunidadId}`, {
      method: "PATCH",
      body: opportunityPayload,
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
    cardResponse = response.data;
  } else {
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

  updateTag("embudo");
  const mapped = mapPipelineCardResponse(cardResponse);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function moveLeadCard(input: MoveLeadInput): Promise<LeadActionResult> {
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
  const mapped = mapPipelineCardResponse(response.data);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function deleteLeadCard(input: DeleteLeadInput): Promise<LeadDeleteResult> {
  let contactoId =
    typeof input.contactoId === "string" && input.contactoId.trim().length ? input.contactoId.trim() : null;

  if (!contactoId) {
    const cardResponse = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.oportunidadId}`);
    if (!cardResponse.ok) {
      return { ok: false, error: cardResponse.error };
    }
    contactoId = cardResponse.data.card.contacto_id ?? null;
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
