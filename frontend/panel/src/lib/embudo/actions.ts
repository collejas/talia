"use server";

import { Buffer } from "node:buffer";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { callCrmApi } from "@/lib/api/crm";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { callSupabaseRest, callSupabaseRpc } from "@/lib/leads/supabase";
import type {
  EmbudoCard,
  EmbudoStage,
  PipelineBoardCard,
  PipelineBoardStage,
} from "@/lib/embudo/data";
import { adaptCard, adaptStage, parseMetadatos } from "@/lib/embudo/helpers";

export type UpdateLeadInput = {
  tarjetaId: string;
  contactoId?: string | null;
  contacto?: Record<string, unknown>;
  tarjeta?: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type CreateLeadInput = {
  stageId: string;
  tableroId: string;
  contacto: Record<string, unknown>;
  tarjeta: Record<string, unknown>;
  contactId?: string | null;
};

export type MoveLeadInput = {
  tarjetaId: string;
  etapaDestino: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
  fuente?: "humano" | "asistente" | "api";
  expectedEtapa?: string | null;
};

export type DeleteLeadInput = {
  tarjetaId: string;
  contactoId?: string | null;
  motivo?: string | null;
};

export type LeadActionResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string };

export type LeadDeleteResult = { ok: true; tarjetaId: string; contactoId: string } | { ok: false; error: string };

type PipelineCardResponse = {
  stage: PipelineBoardStage;
  card: PipelineBoardCard;
};

type CalendarBookingResponseRow = {
  status: "ok";
  booking_id: string;
  resource_id: string;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  hold_id?: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  tarjeta_id: string | null;
};

export type ScheduleLeadDemoInput = {
  conversationId: string;
  startAt: string;
  notes?: string | null;
  sessionId?: string | null;
};

export type ScheduleLeadDemoResult =
  | { ok: true; booking: CalendarBookingResponseRow }
  | { ok: false; error: string };

type ContactInsertRow = {
  id: string;
};

type ContactSearchRow = {
  contacto_id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  company_name: string | null;
  total_rows: number;
};

export type ContactSearchResult = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
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
  try {
    const token = await resolvePanelApiToken();
    const baseUrl = getPanelApiBaseUrl();
    const response = await fetch(`${baseUrl}/webchat/calendar/bookings`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversation_id: input.conversationId,
        slot_id: null,
        start_at: input.startAt,
        notes: input.notes ?? null,
        session_id: input.sessionId ?? null,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text || "No se pudo agendar la demo." };
    }

    const booking = (await response.json()) as CalendarBookingResponseRow;
    return { ok: true, booking };
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

  const response = await callSupabaseRpc<ContactSearchRow[]>("panel_contactos_list", {
    body: {
      p_search: trimmed,
      p_limit: Math.max(1, Math.min(limit, 25)),
      p_offset: 0,
    },
  });

  if (!response.ok) {
    console.error("[embudo:searchContacts] rpc-error", { error: response.error, query: trimmed });
    return [];
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.map((row) => ({
    id: row.contacto_id,
    nombre: row.nombre?.trim().length ? row.nombre.trim() : "Sin nombre",
    correo: row.correo ?? null,
    telefono: row.telefono ?? null,
    empresa: row.company_name ?? null,
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

    let contactResult;
    try {
      contactResult = await callSupabaseRest<ContactInsertRow[]>("contactos", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: contactInsertPayload,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} contactos-insert-error`, {
        error: error instanceof Error ? error.message : String(error),
        payload: contactInsertPayload,
      });
      throw error;
    }

    if (!contactResult.ok) {
      console.error(`${LOG_PREFIX} contactos-insert-failed`, {
        error: contactResult.error,
        payload: contactInsertPayload,
      });
      return { ok: false, error: contactResult.error };
    }

    const contactRow = Array.isArray(contactResult.data)
      ? (contactResult.data[0] as ContactInsertRow | undefined)
      : undefined;
    if (!contactRow?.id) {
      console.error(`${LOG_PREFIX} contactos-insert-missing-id`, { payload: contactInsertPayload });
      return { ok: false, error: "No se pudo crear el contacto del lead." };
    }
    contactId = contactRow.id;
    createdContactId = contactRow.id;
    logDebug("contact-created", { contactId });
  }

  if (Object.keys(contactUpdatePayload).length) {
    logDebug("contact-update", { contactId, fields: Object.keys(contactUpdatePayload) });
    const updateResult = await callSupabaseRest("contactos", {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      query: { id: `eq.${contactId}` },
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

  const cardPayload = input.tarjeta ?? {};
  const baseMetadata = normalizeMetadata(cardPayload.metadata);
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
      sanitizeNullableString(cardPayload.proyecto_nombre) ??
      nombreValue ??
      companyValue ??
      "Lead sin nombre",
    descripcion: sanitizeNullableString(cardPayload.proyecto_necesidades),
    monto_estimado: cardPayload.monto_estimado ?? null,
    moneda: sanitizeNullableString(cardPayload.moneda)?.toUpperCase() ?? "MXN",
    probabilidad: cardPayload.probabilidad_override ?? null,
    propietario_usuario_id: userId,
    asignado_a_usuario_id: userId,
    metadata: {
      ...baseMetadata,
      canal: cardPayload.canal ?? baseMetadata.canal,
      lead_score: cardPayload.lead_score ?? baseMetadata.lead_score,
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
      await callSupabaseRest("contactos", {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
        query: { id: `eq.${createdContactId}` },
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
  const tarjetaPayload = isRecord(input.tarjeta) ? { ...input.tarjeta } : {};

  const opportunityPayload: Record<string, unknown> = {};

  if ("monto_estimado" in tarjetaPayload) {
    opportunityPayload.monto_estimado = tarjetaPayload.monto_estimado ?? null;
  }
  if ("moneda" in tarjetaPayload) {
    const monedaValue = sanitizeNullableString(tarjetaPayload.moneda);
    opportunityPayload.moneda = monedaValue ? monedaValue.toUpperCase() : null;
  }
  if ("probabilidad_override" in tarjetaPayload) {
    opportunityPayload.probabilidad = tarjetaPayload.probabilidad_override ?? null;
  }
  if ("proyecto_nombre" in tarjetaPayload) {
    opportunityPayload.titulo = sanitizeNullableString(tarjetaPayload.proyecto_nombre);
  }
  if ("proyecto_necesidades" in tarjetaPayload) {
    opportunityPayload.descripcion = sanitizeNullableString(tarjetaPayload.proyecto_necesidades);
  }
  if ("metadata" in tarjetaPayload) {
    const metadata = normalizeMetadata(tarjetaPayload.metadata);
    if (Object.keys(metadata).length) {
      opportunityPayload.metadata = metadata;
    }
  }

  const needsContactUpdate = Object.keys(contactoPayload).length > 0;
  const hasOpportunityUpdates = Object.keys(opportunityPayload).length > 0;

  let contactId =
    typeof input.contactoId === "string" && input.contactoId.trim().length ? input.contactoId.trim() : null;

  if (needsContactUpdate) {
    if (!contactId) {
      const currentCard = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.tarjetaId}`);
      if (!currentCard.ok) {
        return { ok: false, error: currentCard.error };
      }
      contactId = currentCard.data.card.contacto_id ?? null;
    }

    if (!contactId) {
      return { ok: false, error: "No se encontró el contacto del lead." };
    }

    const contactResult = await callSupabaseRest("contactos", {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      query: { id: `eq.${contactId}` },
      body: contactoPayload,
    });

    if (!contactResult.ok) {
      return { ok: false, error: contactResult.error };
    }
  }

  let cardResponse: PipelineCardResponse | null = null;
  if (hasOpportunityUpdates) {
    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${input.tarjetaId}`, {
      method: "PATCH",
      body: opportunityPayload,
    });
    if (!response.ok) {
      return { ok: false, error: response.error };
    }
    cardResponse = response.data;
  } else {
    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.tarjetaId}`);
    if (!response.ok) {
      return { ok: false, error: response.error };
    }
    cardResponse = response.data;
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

  const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${input.tarjetaId}`, {
    method: "PATCH",
    body: payload,
  });

  if (!response.ok) {
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
    const cardResponse = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${input.tarjetaId}`);
    if (!cardResponse.ok) {
      return { ok: false, error: cardResponse.error };
    }
    contactoId = cardResponse.data.card.contacto_id ?? null;
  }

  const response = await callCrmApi<unknown>(`/crm/pipeline/opportunities/${input.tarjetaId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  updateTag("embudo");
  return { ok: true, tarjetaId: input.tarjetaId, contactoId: contactoId ?? "" };
}
