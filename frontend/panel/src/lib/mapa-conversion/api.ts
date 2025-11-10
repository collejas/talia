"use server";

import { cookies } from "next/headers";

import { getPanelApiBaseUrl } from "@/lib/api/panel";

export type DemografiaLeadsRow = {
  level: string;
  key: string;
  name: string;
  canal: string;
  total: number;
  etapa_codigo: string;
  etapa_categoria: string;
  etapa_orden: number;
  captado_orden: number;
  webchat_bucket: string | null;
};

type DemografiaLeadsTotals = {
  total: number;
  abiertas: number;
  ganadas: number;
  perdidas: number;
  webchat_sin_conversacion: number;
  webchat_captado: number;
  webchat_post_captado: number;
};

export type DemografiaLeadsChannelsTotals = Record<
  string,
  {
    total: number;
    abiertas: number;
    ganadas: number;
    perdidas: number;
    webchat_breakdown?: {
      sin_conversacion: number;
      captado: number;
      post_captado: number;
    };
  }
>;

export type DemografiaMapDataset = {
  key: string;
  name: string;
  nivel: string;
  leads_total: number;
  totales_por_canal: Record<string, number>;
  webchat_breakdown: {
    sin_conversacion: number;
    captado: number;
    post_captado: number;
  };
  visitantes_total: number;
  visitantes_con_chat: number;
  visitantes_sin_chat: number;
  total_visitas: number;
  has_data: boolean;
  next_level: "estado" | "municipio" | null;
  parent_state: string | null;
};

export type DemografiaSummaryResponse = {
  ok: boolean;
  nivel: string;
  canales: string[] | null;
  etapas: string[] | null;
  range: Record<string, unknown>;
  leads: {
    rows: DemografiaLeadsRow[];
    captado_orden: number;
    totals: DemografiaLeadsTotals;
    totals_by_channel: DemografiaLeadsChannelsTotals;
  };
  visitantes: {
    items: Array<{
      level: string;
      key: string;
      name: string;
      total: number;
      con_chat: number;
      sin_chat: number;
      webchat_total: number;
      webchat_con_chat: number;
      webchat_sin_chat: number;
      whatsapp_total: number;
      voz_total: number;
      has_data: boolean;
    }>;
    totals: {
      total: number;
      con_chat: number;
      sin_chat: number;
      webchat_con_chat: number;
      webchat_sin_chat: number;
    };
  };
};

export type DemografiaMapResponse = {
  ok: boolean;
  nivel: string;
  estado: string | null;
  canales: string[] | null;
  etapas: string[] | null;
  range: Record<string, unknown>;
  totales_leads: DemografiaLeadsTotals;
  totales_visitantes: {
    total: number;
    con_chat: number;
    sin_chat: number;
    webchat_con_chat: number;
    webchat_sin_chat: number;
  };
  totales_leads_por_canal: DemografiaLeadsChannelsTotals;
  captado_orden: number | null;
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
  options: { estado?: string | null; canales?: string[]; etapas?: string[] } = {},
): Promise<DemografiaData> {
  const resumenParams = new URLSearchParams({ nivel });
  const mapaParams = new URLSearchParams({ nivel });

  if (options.canales?.length) {
    const joined = options.canales.join(",");
    resumenParams.set("canales", joined);
    mapaParams.set("canales", joined);
  }
  if (options.etapas?.length) {
    const joinedStages = options.etapas.join(",");
    resumenParams.set("etapas", joinedStages);
    mapaParams.set("etapas", joinedStages);
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
