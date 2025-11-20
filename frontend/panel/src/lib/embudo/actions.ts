"use server";

import { Buffer } from "node:buffer";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { callSupabaseRest, callSupabaseRpc } from "@/lib/leads/supabase";
import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { getPanelApiBaseUrl } from "@/lib/api/panel";

type LeadRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_empresa: string | null;
  contacto_notas: string | null;
  contacto_necesidad: string | null;
  contacto_estado: string | null;
  canal: string | null;
  etapa_id: string;
  etapa_nombre: string;
  etapa_codigo: string;
  etapa_metadatos: Record<string, unknown> | null;
  etapa_orden: number;
  categoria: "abierta" | "ganada" | "perdida";
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad: number | null;
  proyecto_nombre: string | null;
  proyecto_necesidades: string | null;
  lead_score: number | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  propietario_id: string | null;
  propietario_nombre: string | null;
  conversacion_id: string | null;
  ultimo_mensaje_en: string | null;
  motivo_cierre: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  total_rows: number;
};

type DeleteLeadRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  tablero_id: string;
  etapa_id: string;
  etapa_codigo: string | null;
  eliminado_en: string;
};

export type UpdateLeadInput = {
  tarjetaId: string;
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
  motivo?: string | null;
};

export type LeadActionResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string };

export type LeadDeleteResult = { ok: true; tarjetaId: string; contactoId: string } | { ok: false; error: string };

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

type LeadInsertRow = {
  id: string;
  tablero_id: string;
  etapa_id: string;
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

function mapRowToStage(row: LeadRow): { stage: EmbudoStage; card: EmbudoCard } {
  const stageMetadata =
    row.etapa_metadatos && typeof row.etapa_metadatos === "object" && !Array.isArray(row.etapa_metadatos)
      ? (row.etapa_metadatos as Record<string, unknown>)
      : {};

  const stage: EmbudoStage = {
    id: row.etapa_id,
    nombre: row.etapa_nombre,
    codigo: row.etapa_codigo || "",
    categoria: row.categoria,
    orden: row.etapa_orden ?? Number.MAX_SAFE_INTEGER,
    tableroId: "",
    metadatos: stageMetadata,
    tarjetas: [],
  };

  const card: EmbudoCard = {
    tarjetaId: row.tarjeta_id,
    contactoId: row.contacto_id,
    conversacionId: row.conversacion_id,
    nombre: row.contacto_nombre?.trim() || "Lead sin nombre",
    correo: row.contacto_correo,
    telefono: row.contacto_telefono,
    empresa: row.contacto_empresa ?? null,
  notas: row.contacto_notas ?? null,
  necesidadProposito: row.contacto_necesidad ?? null,
    canal: row.canal,
    estado: row.contacto_estado,
    etapaId: row.etapa_id,
    etapaNombre: row.etapa_nombre,
    monto: row.monto_estimado,
    moneda: row.moneda,
    probabilidad: row.probabilidad,
    proyectoNombre: row.proyecto_nombre ?? null,
    proyectoNecesidades: row.proyecto_necesidades ?? null,
    asignadoId: row.asignado_id,
    asignadoNombre: row.asignado_nombre,
    prioridad: row.lead_score ?? 0,
    actualizadoEn: row.actualizado_en,
    etiquetas: row.tags ?? [],
    metadata: row.metadata ?? {},
  };

  return { stage, card };
}

function extractRow(data: unknown): LeadRow | null {
  if (!Array.isArray(data) || !data.length) return null;
  const row = data[0] as LeadRow;
  if (!row || typeof row !== "object") return null;
  return row;
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

  const cardPayload = input.tarjeta ?? {};

  const metadata: Record<string, unknown> = isRecord(cardPayload.metadata) ? { ...cardPayload.metadata } : {};
  if (!("created_via" in metadata)) {
    metadata.created_via = "embudo_manual";
  }
  if (!("created_stage_id" in metadata)) {
    metadata.created_stage_id = input.stageId;
  }

  const leadPayload: Record<string, unknown> = {
    contacto_id: contactId,
    tablero_id: input.tableroId,
    etapa_id: input.stageId,
    propietario_usuario_id: userId,
    asignado_a_usuario_id: userId,
    metadata,
  };

  const allowedFuentes = new Set(["humano", "asistente", "api"]);
  const requestedFuente =
    typeof cardPayload.fuente === "string" ? cardPayload.fuente.trim().toLowerCase() : null;
  leadPayload.fuente = requestedFuente && allowedFuentes.has(requestedFuente)
    ? requestedFuente
    : "api";

  if ("monto_estimado" in cardPayload) {
    leadPayload.monto_estimado = cardPayload.monto_estimado;
  }

  if ("moneda" in cardPayload) {
    const monedaValue = sanitizeNullableString(cardPayload.moneda);
    if (monedaValue) {
      leadPayload.moneda = monedaValue.toUpperCase();
    }
  }

  if ("probabilidad_override" in cardPayload) {
    leadPayload.probabilidad_override = cardPayload.probabilidad_override;
  }

  if ("proyecto_nombre" in cardPayload) {
    const proyectoNombreValue = sanitizeNullableString(cardPayload.proyecto_nombre);
    if (proyectoNombreValue !== null) {
      leadPayload.proyecto_nombre = proyectoNombreValue;
    }
  }

  if ("proyecto_necesidades" in cardPayload) {
    const proyectoNeedsValue = sanitizeNullableString(cardPayload.proyecto_necesidades);
    if (proyectoNeedsValue !== null) {
      leadPayload.proyecto_necesidades = proyectoNeedsValue;
    }
  }

  removeUndefined(leadPayload);
  logDebug("build-lead-payload", { leadPayload });

  const leadResult = await callSupabaseRest<LeadInsertRow[]>("lead_tarjetas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: leadPayload,
  });

  if (!leadResult.ok) {
    console.error(`${LOG_PREFIX} lead-insert-failed`, {
      error: leadResult.error,
      leadPayload,
    });
    if (createdContactId) {
      await callSupabaseRest("contactos", {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
        query: { id: `eq.${createdContactId}` },
      }).catch(() => undefined);
    }
    return { ok: false, error: leadResult.error };
  }

  const leadRow = Array.isArray(leadResult.data) ? (leadResult.data[0] as LeadInsertRow | undefined) : undefined;
  if (!leadRow?.id) {
    console.error(`${LOG_PREFIX} lead-insert-missing-id`, { leadPayload, leadResult: leadResult.data });
    return { ok: false, error: "No se pudo crear el lead." };
  }
  logDebug("lead-created", { leadId: leadRow.id, etapaId: leadRow.etapa_id });

  const detailResult = await callSupabaseRpc<LeadRow[]>("panel_lead_update", {
    body: { p_tarjeta_id: leadRow.id },
  });

  if (!detailResult.ok) {
    console.error(`${LOG_PREFIX} lead-detail-failed`, {
      error: detailResult.error,
      tarjetaId: leadRow.id,
    });
    return { ok: false, error: detailResult.error };
  }

  const row = extractRow(detailResult.data);
  if (!row) {
    console.error(`${LOG_PREFIX} lead-detail-empty`, { tarjetaId: leadRow.id });
    return { ok: false, error: "No se recibió información del lead creado." };
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

  updateTag("embudo");

  const mapped = mapRowToStage(row);
  if (!mapped.stage.tableroId) {
    mapped.stage.tableroId = input.tableroId;
  }

  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function updateLeadCard(input: UpdateLeadInput): Promise<LeadActionResult> {
  const payload = {
    p_tarjeta_id: input.tarjetaId,
    p_contacto: input.contacto ?? {},
    p_tarjeta: input.tarjeta ?? {},
    p_merge_metadata: input.mergeMetadata ?? true,
  };

  const response = await callSupabaseRpc<LeadRow[]>("panel_lead_update", {
    body: payload,
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  const row = extractRow(response.data);
  if (!row) {
    return { ok: false, error: "No se recibió información del lead actualizado." };
  }

  updateTag("embudo");
  const mapped = mapRowToStage(row);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function moveLeadCard(input: MoveLeadInput): Promise<LeadActionResult> {
  const payload = {
    p_tarjeta_id: input.tarjetaId,
    p_etapa_destino: input.etapaDestino,
    p_fuente: input.fuente ?? "humano",
    p_motivo: input.motivo ?? null,
    p_metadata: input.metadata ?? {},
    p_expected_etapa: input.expectedEtapa ?? null,
  };

  const response = await callSupabaseRpc<LeadRow[]>("panel_lead_move", {
    body: payload,
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  const row = extractRow(response.data);
  if (!row) {
    return { ok: false, error: "No se recibió información del movimiento del lead." };
  }

  updateTag("embudo");
  const mapped = mapRowToStage(row);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function deleteLeadCard(input: DeleteLeadInput): Promise<LeadDeleteResult> {
  const response = await callSupabaseRpc<DeleteLeadRow[]>("panel_lead_delete", {
    body: {
      p_tarjeta_id: input.tarjetaId,
      p_motivo: input.motivo ?? null,
    },
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  const row = Array.isArray(response.data) && response.data.length ? (response.data[0] as DeleteLeadRow) : null;
  if (!row?.tarjeta_id) {
    return { ok: false, error: "No se recibió confirmación de eliminación." };
  }

  updateTag("embudo");
  return { ok: true, tarjetaId: row.tarjeta_id, contactoId: row.contacto_id };
}
