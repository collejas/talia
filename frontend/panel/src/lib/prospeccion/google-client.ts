import { refreshSession, shouldAttemptSessionRefresh } from "@/lib/auth/session-refresh";

const RETRYABLE_STATUS = new Set([502, 503, 504, 522, 524]);

export type GoogleSearchStrategy = "nearby" | "text";

export type CreateGoogleSearchPayload = {
  query?: string | null;
  lat: number;
  lng: number;
  radio_m: number;
  included_types?: string[] | null;
  strategy?: GoogleSearchStrategy;
  language_code?: string | null;
  region_code?: string | null;
  dense_mode?: boolean | null;
  meta?: Record<string, unknown> | null;
};

export type GoogleSearchPreviewItem = {
  external_id?: string | null;
  name?: string | null;
  actividad?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  rating?: number | null;
  reviews?: number | null;
  maps_url?: string | null;
};

export type CreateGoogleSearchResponse = {
  ok: boolean;
  busqueda_id: string;
  status: "queued";
};

export type GoogleBusquedaItem = {
  id: string;
  fuente: string;
  query: string;
  radio_m: number;
  lat: number;
  lng: number;
  meta: Record<string, unknown> | null;
  total_encontrados: number | null;
  creado_en: string;
};

export type GoogleBusquedasResponse = {
  ok: boolean;
  items: GoogleBusquedaItem[];
  total: number;
  limit: number;
  offset: number;
};

export type GoogleResultadoItem = {
  resultado_id: string;
  busqueda_id: string;
  display_name: string | null;
  actividad: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviews: number | null;
  distancia_m: number | null;
  maps_url: string | null;
  google_primary_type: string | null;
  google_primary_type_display_name: string | null;
  google_types: string[] | null;
};

export type GoogleResultadosResponse = {
  ok: boolean;
  items: GoogleResultadoItem[];
  total: number;
  limit: number;
  offset: number;
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

export async function createGoogleBusqueda(
  payload: CreateGoogleSearchPayload,
): Promise<CreateGoogleSearchResponse> {
  const body = JSON.stringify(payload);
  return requestJson<CreateGoogleSearchResponse>("/api/prospeccion/google/busquedas", {
    method: "POST",
    body,
  });
}

function buildClientUrl(path: string): URL {
  const origin =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_PANEL_ORIGIN || "http://localhost"
      : window.location.origin;
  return new URL(path, origin);
}

export async function listGoogleBusquedas(params: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<GoogleBusquedasResponse> {
  const url = buildClientUrl("/api/prospeccion/google/busquedas");
  if (typeof params.limit === "number") {
    url.searchParams.set("limit", String(params.limit));
  }
  if (typeof params.offset === "number") {
    url.searchParams.set("offset", String(params.offset));
  }
  if (params.search && params.search.trim().length) {
    url.searchParams.set("search", params.search.trim());
  }
  return requestJson<GoogleBusquedasResponse>(url.toString());
}

export async function listGoogleResultados(params: {
  busquedaId?: string;
  limit?: number;
  offset?: number;
  order?: "recientes" | "rating" | "distancia";
} = {}): Promise<GoogleResultadosResponse> {
  const url = buildClientUrl("/api/prospeccion/google/resultados");
  if (params.busquedaId) {
    url.searchParams.set("busqueda_id", params.busquedaId);
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
  return requestJson<GoogleResultadosResponse>(url.toString());
}

export async function deleteGoogleBusqueda(busquedaId: string) {
  if (!busquedaId) {
    throw new Error("Falta el ID de la búsqueda.");
  }
  const url = buildClientUrl("/api/prospeccion/google/busquedas");
  url.searchParams.set("delete_id", busquedaId);
  return requestJson<{ ok: boolean; deleted?: number }>(url.toString(), {
    method: "DELETE",
  });
}

export async function deleteGoogleResultados(ids: string[]) {
  if (!ids.length) {
    throw new Error("Selecciona al menos un resultado.");
  }
  return requestJson<{ ok: boolean; deleted: number }>("/api/prospeccion/google/resultados", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
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
