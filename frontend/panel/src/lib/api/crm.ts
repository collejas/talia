"use server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

export type CrmRelacionTipo =
  | "cuentas"
  | "contactos"
  | "oportunidades"
  | "tickets"
  | "actividades"
  | "leads";

export type CrmCuentaPayload = {
  nombre: string;
  tipo?: string | null;
  industria?: string | null;
  tamano?: string | null;
  sitio_web?: string | null;
  direccion?: Record<string, unknown> | null;
  propietario_usuario_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type CrmContactoPayload = {
  nombre?: string;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  canal_preferido?: string | null;
  cuenta_id?: string | null;
  propietario_usuario_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type CrmOportunidadPayload = {
  titulo?: string;
  cuenta_id?: string | null;
  contacto_id?: string | null;
  etapa_id?: string | null;
  monto_estimado?: number | null;
  moneda?: string | null;
  probabilidad?: number | null;
  fecha_cierre_probable?: string | null;
  estado?: string | null;
  motivo_perdida?: string | null;
  propietario_usuario_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type CrmActividadPayload = {
  tipo?: string;
  asunto?: string;
  descripcion?: string | null;
  canal?: string | null;
  estado?: string | null;
  inicio_en?: string | null;
  fin_en?: string | null;
  prioridad?: string | null;
  fecha_vencimiento?: string | null;
  sla_horas?: number | null;
  recordatorio_en?: string | null;
  cuenta_id?: string | null;
  contacto_id?: string | null;
  oportunidad_id?: string | null;
  creado_por_usuario_id?: string | null;
  asignado_a_usuario_id?: string | null;
  metadata?: Record<string, unknown>;
};

type QueryParams = Record<string, string | null | undefined>;

type CrmRequestInit = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  query?: QueryParams;
};

async function crmRequest<T>(path: string, init: CrmRequestInit = {}): Promise<T> {
  const baseUrl = getPanelApiBaseUrl();
  const token = await resolvePanelApiToken();
  const url = new URL(`${baseUrl}${path}`);
  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error ${response.status}`);
  }

  return (await response.json()) as T;
}

export function listCuentas(params: {
  search?: string;
  propietario_usuario_id?: string;
} = {}) {
  return crmRequest<any[]>("/crm/cuentas", { query: params });
}

export function createCuenta(payload: CrmCuentaPayload) {
  return crmRequest<any>("/crm/cuentas", { method: "POST", body: payload });
}

export function updateCuenta(id: string, payload: CrmCuentaPayload) {
  return crmRequest<any>(`/crm/cuentas/${id}`, { method: "PATCH", body: payload });
}

export function listContactos(params: {
  cuenta_id?: string;
  propietario_usuario_id?: string;
  search?: string;
} = {}) {
  return crmRequest<any[]>("/crm/contactos", { query: params });
}

export function createContacto(payload: CrmContactoPayload) {
  return crmRequest<any>("/crm/contactos", { method: "POST", body: payload });
}

export function updateContacto(id: string, payload: CrmContactoPayload) {
  return crmRequest<any>(`/crm/contactos/${id}`, { method: "PATCH", body: payload });
}

export function listOportunidades(params: {
  cuenta_id?: string;
  contacto_id?: string;
  etapa_id?: string;
  estado?: string;
  propietario_usuario_id?: string;
} = {}) {
  return crmRequest<any[]>("/crm/oportunidades", { query: params });
}

export function createOportunidad(payload: CrmOportunidadPayload) {
  return crmRequest<any>("/crm/oportunidades", { method: "POST", body: payload });
}

export function updateOportunidad(id: string, payload: CrmOportunidadPayload) {
  return crmRequest<any>(`/crm/oportunidades/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export function addOportunidadHistorial(
  oportunidadId: string,
  payload: { etapa_id: string; comentario?: string | null; cambiado_por_usuario_id?: string | null },
) {
  return crmRequest<any>(`/crm/oportunidades/${oportunidadId}/historial`, {
    method: "POST",
    body: payload,
  });
}

export function listActividades(params: {
  cuenta_id?: string;
  contacto_id?: string;
  oportunidad_id?: string;
  asignado_a_usuario_id?: string;
  estado?: string;
  prioridad?: string;
  tipo?: string;
} = {}) {
  return crmRequest<any[]>("/crm/actividades", { query: params });
}

export function createActividad(payload: CrmActividadPayload) {
  return crmRequest<any>("/crm/actividades", { method: "POST", body: payload });
}

export function updateActividad(id: string, payload: CrmActividadPayload) {
  return crmRequest<any>(`/crm/actividades/${id}`, { method: "PATCH", body: payload });
}
