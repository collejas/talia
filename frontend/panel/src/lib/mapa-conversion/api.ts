"use server";

import { cookies } from "next/headers";

import { getPanelApiBaseUrl } from "@/lib/api/panel";

type DemografiaTotals = {
  total: number;
  abiertas?: number;
  ganadas?: number;
  perdidas?: number;
  [key: string]: number | undefined;
};

type DemografiaSummaryResponse = {
  ok: boolean;
  nivel: string;
  canales: string[] | null;
  range: Record<string, unknown>;
  leads: {
    items: Array<{
      level: string;
      key: string;
      name: string;
      canal: string;
      total: number;
      abiertas: number;
      ganadas: number;
      perdidas: number;
    }>;
    totals: DemografiaTotals;
    totals_by_channel: Record<
      string,
      { total: number; abiertas: number; ganadas: number; perdidas: number }
    >;
  };
  visitantes: {
    items: Array<{
      level: string;
      key: string;
      name: string;
      total: number;
      con_chat: number;
      sin_chat: number;
    }>;
    totals: {
      total: number;
      con_chat: number;
      sin_chat: number;
    };
  };
};

export type DemografiaMapDataset = {
  key: string;
  name: string;
  leads_total: number;
  leads_por_canal: Record<string, number>;
  leads_por_etapa: Record<string, number>;
  visitantes_total: number;
  visitantes_con_chat: number;
  visitantes_sin_chat: number;
};

type DemografiaMapResponse = {
  ok: boolean;
  nivel: string;
  estado: string | null;
  canales: string[] | null;
  range: Record<string, unknown>;
  totales_leads: DemografiaTotals;
  totales_visitantes: {
    total: number;
    con_chat: number;
    sin_chat: number;
  };
  totales_leads_por_canal: Record<string, DemografiaTotals>;
  dataset: DemografiaMapDataset[];
  geojson: Record<string, unknown>;
};

export type DemografiaData = {
  summary: DemografiaSummaryResponse;
  map: DemografiaMapResponse;
};

async function resolveAuthToken(): Promise<string> {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("talia.access_token")?.value ||
    cookieStore.get("sb-access-token")?.value ||
    cookieStore.get("access_token")?.value;
  if (accessToken && accessToken.trim()) {
    return accessToken;
  }
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;
  if (!serviceRole) {
    throw new Error("No se encontró token de autenticación para llamar al backend.");
  }
  return serviceRole;
}

async function callDemografiaEndpoint<T>(
  path: string,
  params: URLSearchParams,
): Promise<T> {
  const baseUrl = getPanelApiBaseUrl();
  const token = await resolveAuthToken();
  const url = `${baseUrl.replace(/\/+$/, "")}/kpis/demografia/${path}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend respondió ${response.status} en ${path}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function loadDemografiaData(
  nivel: "pais" | "estado" | "municipio" = "estado",
  options: { canales?: string[]; estado?: string | null } = {},
): Promise<DemografiaData> {
  const paramsResumen = new URLSearchParams({ nivel });
  if (options.canales && options.canales.length) {
    paramsResumen.set("canales", options.canales.join(","));
  }

  const paramsMapa = new URLSearchParams({ nivel });
  if (options.canales && options.canales.length) {
    paramsMapa.set("canales", options.canales.join(","));
  }
  if (nivel === "municipio" && options.estado) {
    paramsMapa.set("estado", options.estado);
  }

  const [summary, map] = await Promise.all([
    callDemografiaEndpoint<DemografiaSummaryResponse>("resumen", paramsResumen),
    callDemografiaEndpoint<DemografiaMapResponse>("mapa", paramsMapa),
  ]);

  return { summary, map };
}
