"use server";

import { callCrmApi } from "@/lib/api/crm";

type AgendaApiContact = {
  id: string | null;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  origen: string | null;
};

type AgendaApiAssignment = {
  id: string | null;
  nombre: string | null;
} | null;

export type AgendaApiItem = {
  id: string;
  resource_id: string | null;
  hold_id: string | null;
  oportunidad_id: string | null;
  tarjeta_id?: string | null;
  contacto_id: string | null;
  conversacion_id: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  estado: string;
  notes: string | null;
  meeting_url: string | null;
  external_join_url: string | null;
  canal: string | null;
  provider: string | null;
  lead_score: number | null;
  etapa_nombre: string | null;
  metadata: Record<string, unknown> | null;
  contacto: AgendaApiContact;
  asignado: AgendaApiAssignment;
  propietario: AgendaApiAssignment;
  created_at: string | null;
  updated_at: string | null;
};

type AgendaApiMetrics = {
  total: number;
  activas: number;
  proximas24h: number;
  canceladas: number;
  realizadas: number;
};

export type AgendaBookingsResponse = {
  ok: boolean;
  items: AgendaApiItem[];
  metrics: AgendaApiMetrics;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type AgendaAvailabilityResponse = {
  ok: boolean;
  availability: {
    resource_id: string;
    timezone: string;
    generated_at: string;
    window_start: string;
    window_end: string;
    slot_duration_minutes: number;
    slots: Array<{
      slot_id: string;
      start_at: string;
      end_at: string;
      timezone: string;
      local_date: string;
      local_time: string;
      capacity: number;
      booked: number;
      holds: number;
      is_available: boolean;
    }>;
  };
};

export type AgendaActionResponse = {
  ok: boolean;
  booking: {
    booking_id: string;
    resource_id: string;
    start_at: string;
    end_at: string | null;
    timezone: string | null;
    status: string;
    hold_id: string | null;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    tarjeta_id?: string | null;
  };
};

export type AgendaItem = {
  id: string;
  oportunidadId: string | null;
  contactoId: string | null;
  conversacionId: string | null;
  startAt: string;
  endAt: string | null;
  timezone: string | null;
  estado: string;
  provider: string;
  meetingUrl: string | null;
  externalJoinUrl: string | null;
  notes: string | null;
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

const ACTIVE_STATES = new Set(["confirmada"]);
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function loadAgendaData(filters: { rango?: string; desde?: string; hasta?: string } = {}): Promise<AgendaPayload> {
  try {
    const searchParams: Record<string, string> = {};
    if (filters.rango) searchParams.rango = filters.rango;
    if (filters.desde) searchParams.from = filters.desde;
    if (filters.hasta) searchParams.to = filters.hasta;
    const response = await callPanelAgendaEndpoint<AgendaBookingsResponse>(
      "/agenda/bookings",
      searchParams,
    );
    const mapped = mapAgenda(response.items ?? []);
    const metrics = response.metrics ?? computeMetrics(mapped);
    return { items: mapped, metrics, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cargar la agenda.";
    return { items: [], metrics: emptyMetrics(), errors: [message] };
  }
}

export async function loadAgendaAvailability(params: {
  from?: string;
  to?: string;
  timezone?: string;
  resourceId?: string;
  maxDays?: number;
} = {}): Promise<AgendaAvailabilityResponse["availability"]> {
  const search: Record<string, string> = {};
  if (params.from) search.from = params.from;
  if (params.to) search.to = params.to;
  if (params.timezone) search.timezone = params.timezone;
  if (params.resourceId) search.resource_id = params.resourceId;
  if (typeof params.maxDays === "number") search.max_days = String(params.maxDays);

  const response = await callPanelAgendaEndpoint<AgendaAvailabilityResponse>(
    "/agenda/availability",
    search,
  );
  return response.availability;
}

export async function rescheduleAgendaBooking(
  bookingId: string,
  payload: { startAt: string; notes?: string },
): Promise<AgendaActionResponse["booking"]> {
  const body = JSON.stringify({ start_at: payload.startAt, notes: payload.notes });
  const response = await callPanelAgendaEndpoint<AgendaActionResponse>(
    `/agenda/bookings/${bookingId}/reschedule`,
    {},
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    },
  );
  return response.booking;
}

export async function cancelAgendaBooking(
  bookingId: string,
  reason?: string,
): Promise<AgendaActionResponse["booking"]> {
  const response = await callPanelAgendaEndpoint<AgendaActionResponse>(
    `/agenda/bookings/${bookingId}/cancel`,
    {},
    {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: { "Content-Type": "application/json" },
    },
  );
  return response.booking;
}

function mapAgenda(rows: AgendaApiItem[]): AgendaItem[] {
  return rows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {};

    const provider = row.provider?.trim() || "calendar";
    return {
      id: row.id,
      oportunidadId: row.oportunidad_id ?? null,
      contactoId: row.contacto_id,
      conversacionId: row.conversacion_id,
      startAt: row.start_at,
      endAt: row.end_at,
      timezone: row.timezone,
      estado: row.estado,
      provider,
      meetingUrl: row.meeting_url,
      externalJoinUrl: row.external_join_url,
      notes: row.notes,
      metadata,
      contactoNombre: row.contacto?.nombre ?? null,
      contactoCorreo: row.contacto?.correo ?? null,
      contactoTelefono: row.contacto?.telefono ?? null,
      contactoEmpresa: row.contacto?.empresa ?? null,
      asignadoNombre: row.asignado?.nombre ?? null,
      propietarioNombre: row.propietario?.nombre ?? null,
      etapaNombre: row.etapa_nombre,
      canal: row.canal,
      leadScore: row.lead_score,
    };
  });
}

function computeMetrics(items: AgendaItem[]): AgendaMetrics {
  const metrics = emptyMetrics();
  const nowMs = Date.now();

  for (const item of items) {
    const estado = item.estado?.toLowerCase() ?? "pendiente";
    metrics.total += 1;
    if (estado === "cancelada") metrics.canceladas += 1;
    if (estado === "realizada") metrics.realizadas += 1;
    if (ACTIVE_STATES.has(estado)) {
      metrics.activas += 1;
      const start = Date.parse(item.startAt);
      if (!Number.isNaN(start) && start >= nowMs && start <= nowMs + UPCOMING_WINDOW_MS) {
        metrics.proximas24h += 1;
      }
    }
  }

  return metrics;
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

export async function callPanelAgendaEndpoint<T>(
  path: string,
  searchParams: Record<string, string> = {},
  init: RequestInit = {},
): Promise<T> {
  const crmPath = path.startsWith("/crm") ? path : `/crm${path}`;
  const normalizedHeaders =
    init.headers !== undefined
      ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
      : undefined;
  const result = await callCrmApi<T>(crmPath, {
    method: (init.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined) ?? "GET",
    searchParams,
    body: init.body,
    headers: normalizedHeaders,
    withUserToken: true,
  });
  if (!result.ok) {
    throw new Error(result.error || "Error consultando la agenda.");
  }
  return result.data;
}
