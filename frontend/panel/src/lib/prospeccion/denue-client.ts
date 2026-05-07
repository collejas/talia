import { refreshSession, shouldAttemptSessionRefresh } from "@/lib/auth/session-refresh";

const RETRYABLE_STATUS = new Set([502, 503, 504, 522, 524]);
const RESULT_DELETE_BATCH_SIZE = 500;

export type CreateDenueSearchPayload = {
  query: string;
  lat: number;
  lng: number;
  radio_m: number;
  meta?: Record<string, unknown> | null;
  modo?: "radio" | "entidad" | "area_act" | "area_act_estr";
  texto_busqueda?: string;
  actividad_codigos?: string[];
  actividad_nombres?: string[];
  estrato_ids?: string[];
  geo_estados?: string[];
  geo_municipios?: string[];
  registro_inicial?: number;
  registro_final?: number;
  async_mode?: boolean;
};

export type DenueBusquedaItem = {
  id: string;
  fuente: string;
  query: string;
  radio_m: number;
  lat: number;
  lng: number;
  meta: Record<string, unknown> | null;
  advanced_filters?: Record<string, unknown> | null;
  total_encontrados: number | null;
  creado_en: string;
};

export type DenueBusquedasResponse = {
  ok: boolean;
  items: DenueBusquedaItem[];
  total: number;
  limit: number;
  offset: number;
};

export type DenueResultadoItem = {
  resultado_id: string;
  busqueda_id: string;
  display_name: string | null;
  actividad: string | null;
  estrato: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distancia_m: number | null;
  maps_url: string | null;
};

export type DenueResultadosResponse = {
  ok: boolean;
  items: DenueResultadoItem[];
  total: number;
  limit: number;
  offset: number;
};

export type DenueResultadosMapItem = {
  kind: "point" | "cluster";
  id: string;
  lat: number | null;
  lng: number | null;
  count: number | null;
  resultado_id: string | null;
  display_name: string | null;
  actividad: string | null;
  estrato: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
};

export type DenueResultadosMapResponse = {
  ok: boolean;
  items: DenueResultadosMapItem[];
  limit: number;
  truncated: boolean;
};

export type DenueResultadosBoundsResponse = {
  ok: boolean;
  bounds: { west: number; south: number; east: number; north: number } | null;
  total: number;
};

export type DenueActividadesResponse = {
  ok: boolean;
  items: string[];
  limit: number;
};

export type DenueScianNode = {
  codigo: string;
  titulo: string | null;
  descripcion: string | null;
  incluye: string | null;
  excluye: string | null;
};

export type DenueCatalogosResponse = {
  ok: boolean;
  scian: {
    sector: DenueScianNode[];
    subsector: DenueScianNode[];
    rama: DenueScianNode[];
    subrama: DenueScianNode[];
    clase: DenueScianNode[];
  };
  geo: {
    states: {
      code: string;
      name: string;
      municipalities: {
        code: string;
        name: string;
      }[];
    }[];
  };
};

export type DenueScianClaseIndiceItem = {
  id: number;
  codigo_clase: string;
  item: string;
};

export type DenueScianClaseIndiceResponse = {
  ok: boolean;
  items: DenueScianClaseIndiceItem[];
};

async function requestJson<T>(
  input: string,
  init?: RequestInit,
  retryAuth = true,
  retryNetwork = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (retryNetwork) {
      await delay(400);
      return requestJson<T>(input, init, retryAuth, false);
    }
    const message = error instanceof Error ? error.message : null;
    throw new Error(message || "Error de red al contactar el backend.");
  }

  const rawText = await response.text();
  let data: unknown = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }
  }

  if (!response.ok) {
    if (retryAuth && shouldAttemptSessionRefresh(response.status, data)) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return requestJson<T>(input, init, false, retryNetwork);
      }
    }
    if (retryNetwork && RETRYABLE_STATUS.has(response.status)) {
      await delay(400);
      return requestJson<T>(input, init, retryAuth, false);
    }
    const detail =
      extractStringField(data, "detail") ||
      extractStringField(data, "error") ||
      extractStringField(data, "message") ||
      (typeof rawText === "string" && rawText.trim().length ? rawText : null) ||
      `Error ${response.status}`;
    throw new Error(detail);
  }

  return (data as T) ?? ({} as T);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildClientUrl(path: string): URL {
  const origin =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_PANEL_ORIGIN || "http://localhost"
      : window.location.origin;
  return new URL(path, origin);
}

export type CreateDenueSearchResponse = {
  ok: boolean;
  busqueda_id: string;
  denue_results?: number;
  upserted?: number;
  status?: "queued" | "running" | "completed" | "failed" | "canceled";
  job_id?: string;
  preview?: unknown[];
};

export async function createDenueBusqueda(payload: CreateDenueSearchPayload): Promise<CreateDenueSearchResponse> {
  const body = JSON.stringify(payload);
  return requestJson<CreateDenueSearchResponse>("/api/prospeccion/denue/busquedas", {
    method: "POST",
    body,
  });
}

export type DenueJobResponse = {
  ok: boolean;
  job: {
    id: string;
    busqueda_id: string;
    status: string;
    total?: number | null;
    error?: string | null;
    progress?: Record<string, unknown> | null;
    created_at?: string;
    started_at?: string | null;
    finished_at?: string | null;
    duration_ms?: number | null;
  };
};

export async function getDenueJob(jobId: string): Promise<DenueJobResponse> {
  return requestJson<DenueJobResponse>(`/api/prospeccion/denue/jobs/${jobId}`, { method: "GET" });
}

export async function cancelDenueJob(jobId: string) {
  return requestJson<{ ok: boolean; requested: boolean }>(`/api/prospeccion/denue/jobs/${jobId}/cancel`, {
    method: "POST",
    body: "{}",
  });
}

export async function listDenueBusquedas(params: { limit?: number; offset?: number; search?: string } = {}) {
  const url = buildClientUrl("/api/prospeccion/denue/busquedas");
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    url.searchParams.set("offset", String(params.offset));
  }
  if (params.search && params.search.trim().length) {
    url.searchParams.set("search", params.search.trim());
  }
  return requestJson<DenueBusquedasResponse>(url.toString());
}

export async function listDenueResultados(params: {
  busquedaId?: string;
  q?: string;
  limit?: number;
  offset?: number;
  order?: "recientes" | "distancia";
  estratoGroup?: string;
  phonePresent?: boolean;
  emailPresent?: boolean;
  websitePresent?: boolean;
  contactMatch?: "all" | "any";
  actividades?: string[];
  geoEstado?: string;
  geoMunicipio?: string;
} = {}) {
  const url = buildClientUrl("/api/prospeccion/denue/resultados");
  if (params.busquedaId) {
    url.searchParams.set("busqueda_id", params.busquedaId);
  }
  if (params.q && params.q.trim().length) {
    url.searchParams.set("q", params.q.trim());
  }
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    url.searchParams.set("offset", String(params.offset));
  }
  if (params.order) {
    url.searchParams.set("order", params.order);
  }
  if (params.estratoGroup) {
    url.searchParams.set("estrato_group", params.estratoGroup);
  }
  if (typeof params.phonePresent === "boolean") {
    url.searchParams.set("phone_present", String(params.phonePresent));
  }
  if (typeof params.emailPresent === "boolean") {
    url.searchParams.set("email_present", String(params.emailPresent));
  }
  if (typeof params.websitePresent === "boolean") {
    url.searchParams.set("website_present", String(params.websitePresent));
  }
  if (params.contactMatch) {
    url.searchParams.set("contact_match", params.contactMatch);
  }
  if (params.actividades?.length) {
    for (const actividad of params.actividades) {
      if (actividad && actividad.trim().length) {
        url.searchParams.append("actividades", actividad.trim());
      }
    }
  }
  if (params.geoEstado) {
    url.searchParams.set("geo_estado", params.geoEstado);
  }
  if (params.geoMunicipio) {
    url.searchParams.set("geo_municipio", params.geoMunicipio);
  }
  return requestJson<DenueResultadosResponse>(url.toString());
}

export async function listDenueResultadosMap(params: {
  busquedaId: string;
  bbox: { west: number; south: number; east: number; north: number };
  zoom: number;
  q?: string;
  estratoGroup?: string;
  phonePresent?: boolean;
  emailPresent?: boolean;
  websitePresent?: boolean;
  contactMatch?: "all" | "any";
  actividades?: string[];
  geoEstado?: string;
  geoMunicipio?: string;
  limit?: number;
}): Promise<DenueResultadosMapResponse> {
  const url = buildClientUrl("/api/prospeccion/denue/resultados/map");
  url.searchParams.set("busqueda_id", params.busquedaId);
  url.searchParams.set("bbox_w", String(params.bbox.west));
  url.searchParams.set("bbox_s", String(params.bbox.south));
  url.searchParams.set("bbox_e", String(params.bbox.east));
  url.searchParams.set("bbox_n", String(params.bbox.north));
  url.searchParams.set("zoom", String(params.zoom));
  if (params.q && params.q.trim().length) {
    url.searchParams.set("q", params.q.trim());
  }
  if (params.estratoGroup) {
    url.searchParams.set("estrato_group", params.estratoGroup);
  }
  if (typeof params.phonePresent === "boolean") {
    url.searchParams.set("phone_present", String(params.phonePresent));
  }
  if (typeof params.emailPresent === "boolean") {
    url.searchParams.set("email_present", String(params.emailPresent));
  }
  if (typeof params.websitePresent === "boolean") {
    url.searchParams.set("website_present", String(params.websitePresent));
  }
  if (params.contactMatch) {
    url.searchParams.set("contact_match", params.contactMatch);
  }
  if (params.actividades?.length) {
    for (const actividad of params.actividades) {
      if (actividad && actividad.trim().length) {
        url.searchParams.append("actividades", actividad.trim());
      }
    }
  }
  if (params.geoEstado) {
    url.searchParams.set("geo_estado", params.geoEstado);
  }
  if (params.geoMunicipio) {
    url.searchParams.set("geo_municipio", params.geoMunicipio);
  }
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  return requestJson<DenueResultadosMapResponse>(url.toString());
}

export async function getDenueResultadosBounds(params: {
  busquedaId: string;
  q?: string;
  estratoGroup?: string;
  phonePresent?: boolean;
  emailPresent?: boolean;
  websitePresent?: boolean;
  contactMatch?: "all" | "any";
  actividades?: string[];
  geoEstado?: string;
  geoMunicipio?: string;
}): Promise<DenueResultadosBoundsResponse> {
  const url = buildClientUrl("/api/prospeccion/denue/resultados/bounds");
  url.searchParams.set("busqueda_id", params.busquedaId);
  if (params.q && params.q.trim().length) {
    url.searchParams.set("q", params.q.trim());
  }
  if (params.estratoGroup) {
    url.searchParams.set("estrato_group", params.estratoGroup);
  }
  if (typeof params.phonePresent === "boolean") {
    url.searchParams.set("phone_present", String(params.phonePresent));
  }
  if (typeof params.emailPresent === "boolean") {
    url.searchParams.set("email_present", String(params.emailPresent));
  }
  if (typeof params.websitePresent === "boolean") {
    url.searchParams.set("website_present", String(params.websitePresent));
  }
  if (params.contactMatch) {
    url.searchParams.set("contact_match", params.contactMatch);
  }
  if (params.actividades?.length) {
    for (const actividad of params.actividades) {
      if (actividad && actividad.trim().length) {
        url.searchParams.append("actividades", actividad.trim());
      }
    }
  }
  if (params.geoEstado) {
    url.searchParams.set("geo_estado", params.geoEstado);
  }
  if (params.geoMunicipio) {
    url.searchParams.set("geo_municipio", params.geoMunicipio);
  }
  return requestJson<DenueResultadosBoundsResponse>(url.toString());
}

export async function listDenueActividades(params: {
  busquedaId: string;
  search?: string;
  geoEstado?: string;
  geoMunicipio?: string;
  limit?: number;
}): Promise<DenueActividadesResponse> {
  const url = buildClientUrl("/api/prospeccion/denue/actividades");
  url.searchParams.set("busqueda_id", params.busquedaId);
  if (params.search && params.search.trim().length) {
    url.searchParams.set("search", params.search.trim());
  }
  if (params.geoEstado) {
    url.searchParams.set("geo_estado", params.geoEstado);
  }
  if (params.geoMunicipio) {
    url.searchParams.set("geo_municipio", params.geoMunicipio);
  }
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  return requestJson<DenueActividadesResponse>(url.toString());
}

export async function deleteDenueBusqueda(busquedaId: string) {
  if (!busquedaId) {
    throw new Error("Falta el ID de la búsqueda.");
  }
  const url = buildClientUrl("/api/prospeccion/denue/busquedas");
  url.searchParams.set("delete_id", busquedaId);
  return requestJson<{ ok: boolean; deleted?: number }>(url.toString(), {
    method: "DELETE",
  });
}

export async function deleteDenueResultados(ids: string[], busquedaId?: string) {
  if (!ids.length) {
    throw new Error("Selecciona al menos un resultado.");
  }
  const normalizedBusquedaId = busquedaId && busquedaId.trim().length ? busquedaId.trim() : undefined;
  let deletedTotal = 0;
  for (let start = 0; start < ids.length; start += RESULT_DELETE_BATCH_SIZE) {
    const chunk = ids.slice(start, start + RESULT_DELETE_BATCH_SIZE);
    const payload: { ids: string[]; busqueda_id?: string } = { ids: chunk };
    if (normalizedBusquedaId) {
      payload.busqueda_id = normalizedBusquedaId;
    }
    const response = await requestJson<{ ok: boolean; deleted: number }>(
      "/api/prospeccion/denue/resultados",
      {
        method: "DELETE",
        body: JSON.stringify(payload),
      },
    );
    deletedTotal += Number(response.deleted ?? chunk.length);
  }
  return { ok: true, deleted: deletedTotal };
}

export async function listDenueCatalogos(): Promise<DenueCatalogosResponse> {
  const url = buildClientUrl("/api/prospeccion/denue/catalogos");
  return requestJson<DenueCatalogosResponse>(url.toString());
}

export async function listScianClaseIndice(params: {
  codigoClase: string;
  limit?: number;
  offset?: number;
}): Promise<DenueScianClaseIndiceResponse> {
  const url = buildClientUrl("/api/prospeccion/denue/scian/clase-indice");
  url.searchParams.set("codigo_clase", params.codigoClase);
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    url.searchParams.set("offset", String(params.offset));
  }
  return requestJson<DenueScianClaseIndiceResponse>(url.toString());
}

function extractStringField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const container = payload as Record<string, unknown>;
  const value = container[key];
  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }
  return undefined;
}
