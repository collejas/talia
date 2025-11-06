"use server";

import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";

type AgendaRestRow = {
  id: string;
  tarjeta_id: string;
  contacto_id: string;
  conversacion_id: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  estado: string;
  provider: string;
  provider_calendar_id: string | null;
  provider_event_id: string | null;
  meeting_url: string | null;
  location: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  cancel_reason: string | null;
  reminder_sent_at: string | null;
  reminder_status: string | null;
  external_join_url: string | null;
  scheduled_via: string | null;
  creado_en: string;
  actualizado_en: string;
  tarjeta_tablero_id: string | null;
  tarjeta_etapa_id: string | null;
  etapa_codigo: string | null;
  etapa_nombre: string | null;
  tarjeta_canal: string | null;
  tarjeta_lead_score: number | null;
  tarjeta_tags: string[] | null;
  tarjeta_metadata: Record<string, unknown> | null;
  asignado_a_usuario_id: string | null;
  asignado_nombre: string | null;
  propietario_usuario_id: string | null;
  propietario_nombre: string | null;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_empresa: string | null;
  contacto_origen: string | null;
  conversacion_estado: string | null;
  conversacion_ultimo_mensaje_en: string | null;
  conversacion_canal: string | null;
};

export type AgendaItem = {
  id: string;
  tarjetaId: string;
  contactoId: string;
  conversacionId: string | null;
  startAt: string;
  endAt: string | null;
  timezone: string | null;
  estado: string;
  provider: string;
  meetingUrl: string | null;
  externalJoinUrl: string | null;
  location: string | null;
  notes: string | null;
  reminderSentAt: string | null;
  reminderStatus: string | null;
  scheduledVia: string | null;
  metadata: Record<string, unknown>;
  contactoNombre: string | null;
  contactoCorreo: string | null;
  contactoTelefono: string | null;
  contactoEmpresa: string | null;
  asignadoNombre: string | null;
  propietarioNombre: string | null;
  etapaNombre: string | null;
  canal: string | null;
  leadScore: number | null;
  cancelReason: string | null;
};

export type AgendaMetrics = {
  total: number;
  activas: number;
  proximas24h: number;
  canceladas: number;
  realizadas: number;
};

export type AgendaPayload = {
  items: AgendaItem[];
  metrics: AgendaMetrics;
  errors: string[];
};

const ACTIVE_STATES = new Set(["pendiente", "confirmada", "reprogramada"]);
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function loadAgendaData(): Promise<AgendaPayload> {
  const errors: string[] = [];

  let baseUrl: string;
  let auth: { apikey: string; token: string };

  try {
    baseUrl = resolveSupabaseUrl();
    auth = await resolveAuthHeaders();
  } catch (error) {
    return {
      items: [],
      metrics: emptyMetrics(),
      errors: [error instanceof Error ? error.message : "Supabase no está configurado."],
    };
  }

  const url = new URL(`${baseUrl}/rest/v1/panel_agenda_demos`);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "start_at.asc.nullslast");
  url.searchParams.set("limit", "200");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: auth.apikey,
      Authorization: `Bearer ${auth.token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    errors.push(await readErrorMessage(response));
    return {
      items: [],
      metrics: emptyMetrics(),
      errors: Array.from(new Set(errors)),
    };
  }

  let raw: AgendaRestRow[] = [];
  try {
    const data = (await response.json()) as unknown;
    if (Array.isArray(data)) {
      raw = data as AgendaRestRow[];
    } else {
      errors.push("Formato inesperado al consultar la agenda.");
    }
  } catch (error) {
    errors.push(`Respuesta inválida al cargar agenda (${(error as Error).message})`);
  }

  const { items, metrics } = mapAgenda(raw);

  return {
    items,
    metrics,
    errors: Array.from(new Set(errors)),
  };
}

function mapAgenda(rows: AgendaRestRow[]): { items: AgendaItem[]; metrics: AgendaMetrics } {
  const items: AgendaItem[] = [];
  const metrics = emptyMetrics();
  const nowMs = Date.now();

  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    const item: AgendaItem = {
      id: row.id,
      tarjetaId: row.tarjeta_id,
      contactoId: row.contacto_id,
      conversacionId: row.conversacion_id,
      startAt: row.start_at,
      endAt: row.end_at,
      timezone: row.timezone,
      estado: (row.estado || "pendiente").toLowerCase(),
      provider: (row.provider || "hosting").toLowerCase(),
      meetingUrl: row.meeting_url,
      externalJoinUrl: row.external_join_url,
      location: row.location,
      notes: row.notes,
      reminderSentAt: row.reminder_sent_at,
      reminderStatus: row.reminder_status,
      scheduledVia: row.scheduled_via,
      metadata,
      contactoNombre: row.contacto_nombre,
      contactoCorreo: row.contacto_correo,
      contactoTelefono: row.contacto_telefono,
      contactoEmpresa: row.contacto_empresa,
      asignadoNombre: row.asignado_nombre,
      propietarioNombre: row.propietario_nombre,
      etapaNombre: row.etapa_nombre,
      canal: row.tarjeta_canal ?? row.conversacion_canal,
      leadScore: row.tarjeta_lead_score,
      cancelReason: row.cancel_reason,
    };

    items.push(item);
    metrics.total += 1;

    const estado = item.estado;
    if (estado === "cancelada") metrics.canceladas += 1;
    if (estado === "realizada") metrics.realizadas += 1;

    if (ACTIVE_STATES.has(estado)) {
      metrics.activas += 1;
      const startMs = Date.parse(item.startAt);
      if (!Number.isNaN(startMs) && startMs >= nowMs && startMs <= nowMs + UPCOMING_WINDOW_MS) {
        metrics.proximas24h += 1;
      }
    }
  }

  return { items, metrics };
}

function emptyMetrics(): AgendaMetrics {
  return {
    total: 0,
    activas: 0,
    proximas24h: 0,
    canceladas: 0,
    realizadas: 0,
  };
}

function resolveSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL_PUBLIC;
  if (!url) {
    throw new Error("SUPABASE_URL no está configurado para la agenda.");
  }
  return url.replace(/\/+$/, "");
}

async function resolveAuthHeaders(): Promise<{ apikey: string; token: string }> {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ||
    cookieStore.get("sb-access-token")?.value ||
    cookieStore.get("access_token")?.value;

  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_KEY;

  if (accessToken && anonKey) {
    return { apikey: anonKey, token: accessToken };
  }

  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;

  if (!serviceRole) {
    throw new Error(
      "Configura SUPABASE_SERVICE_ROLE (o SUPABASE_SERVICE_KEY) para consultar la agenda.",
    );
  }

  return { apikey: serviceRole, token: serviceRole };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `Error ${response.status}`;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (typeof json === "string") return json;
      if (json && typeof json === "object") {
        return (
          (json.error_description as string) ||
          (json.message as string) ||
          (json.error as string) ||
          `Error ${response.status}`
        );
      }
      return text;
    } catch {
      return text;
    }
  } catch {
    return `Error ${response.status}`;
  }
}
