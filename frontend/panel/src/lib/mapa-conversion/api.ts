"use server";

import { cookies } from "next/headers";

import { getPanelApiBaseUrl } from "@/lib/api/panel";

type DemografiaSummaryItem = {
  level: string;
  key: string;
  name: string;
  canal: string;
  total: number;
  abiertas: number;
  ganadas: number;
  perdidas: number;
};

type DemografiaMapDataset = {
  key: string;
  name: string;
  leads_total: number;
  leads_por_canal: Record<string, number>;
  leads_por_etapa: Record<string, number>;
  visitantes_total: number;
  visitantes_con_chat: number;
  visitantes_sin_chat: number;
};

export type DemografiaSummaryResponse = {
  ok: boolean;
  nivel: string;
  canales: string[] | null;
  range: Record<string, unknown>;
  leads: {
    items: DemografiaSummaryItem[];
    totals: Record<string, number>;
    totals_by_channel: Record<string, Record<string, number>>;
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

export type DemografiaMapResponse = {
  ok: boolean;
  nivel: string;
  estado: string | null;
  canales: string[] | null;
  range: Record<string, unknown>;
  totales_leads: Record<string, number>;
  totales_visitantes: {
    total: number;
    con_chat: number;
    sin_chat: number;
  };
  totales_leads_por_canal: Record<string, Record<string, number>>;
  dataset: DemografiaMapDataset[];
  geojson: Record<string, unknown>;
};

export type DemografiaData = {
  summary: DemografiaSummaryResponse;
  map: DemografiaMapResponse;
};

async function resolveAuthToken(): Promise<string> {
  const store = await cookies();
  const cookieToken =
    store.get("talia.access_token")?.value ||
    store.get("sb-access-token")?.value ||
    store.get("access_token")?.value;
  if (cookieToken && cookieToken.trim().length) {
    return cookieToken;
  }
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;
  if (!serviceRole) {
    throw new Error("No se encontró token para consultar el backend del panel.");
  }
  return serviceRole;
}

async function callDemografiaEndpoint<T>(
  endpoint: string,
  params: URLSearchParams,
): Promise<T> {
  const baseUrl = getPanelApiBaseUrl();
  const token = await resolveAuthToken();
  const url = `${baseUrl}/kpis/demografia/${endpoint}?${params.toString()}`;

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
    throw new Error(`Backend respondió ${response.status} (${endpoint}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function loadDemografiaData(
  nivel: "pais" | "estado" | "municipio" = "estado",
  options: { estado?: string | null; canales?: string[] } = {},
): Promise<DemografiaData> {
  const resumenParams = new URLSearchParams({ nivel });
  const mapaParams = new URLSearchParams({ nivel });

  if (options.canales?.length) {
    const joined = options.canales.join(",");
    resumenParams.set("canales", joined);
    mapaParams.set("canales", joined);
  }
  if (nivel === "municipio" && options.estado) {
    mapaParams.set("estado", options.estado);
  }

  const [summary, map] = await Promise.all([
    callDemografiaEndpoint<DemografiaSummaryResponse>("resumen", resumenParams),
    callDemografiaEndpoint<DemografiaMapResponse>("mapa", mapaParams),
  ]);

  return { summary, map };
}
