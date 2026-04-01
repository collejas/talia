"use server";

import { callCrmApi } from "@/lib/api/crm";

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
  leads_totales_por_canal: Record<string, number>;
  totales_por_canal: Record<string, number>;
  visitantes_totales_por_canal: Record<string, number>;
  conversacion_totales: {
    con_conversacion: number;
    sin_conversacion: number;
  };
  etapas_totales: {
    captado: number;
    precalificado: number;
    negociacion: number;
    ganado: number;
    perdido: number;
  };
  visitantes_total: number;
  visitantes_con_chat: number;
  visitantes_sin_chat: number;
  total_visitas: number;
  has_data: boolean;
  next_level: "estado" | "municipio" | null;
  parent_state: string | null;
  traffic_web?: {
    sesiones_web_total: number;
    fuentes_top: Array<{ source: string; total: number }>;
    utm_top: Array<{
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      total: number;
    }>;
  };
  conversation_channels?: {
    sesiones_webchat_total: number;
    sesiones_con_chat_webchat: number;
    sesiones_sin_chat_webchat: number;
    conversaciones_whatsapp: number;
    conversaciones_voz: number;
    conversaciones_correo?: number;
  };
};

export type DemografiaSummaryResponse = {
  ok: boolean;
  nivel: string;
  canales: string[] | null;
  etapas: string[] | null;
  range: Record<string, unknown>;
  attribution_catalog?: {
    utm_campaign_labels?: Record<string, string>;
    campana_options?: Array<{
      value: string;
      label: string;
      canal?: string | null;
    }>;
    campana_tipo_options?: string[];
    template_options?: Array<{
      value: string;
      label: string;
      total?: number;
    }>;
    wa_canal_options?: string[];
    wa_campana_options?: string[];
    wa_regla_options?: Array<{
      value: string;
      label: string;
      canal_publicitario?: string | null;
      campana_publicitaria?: string | null;
    }>;
  };
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
      sesiones_web_total?: number;
      sesiones_webchat_total?: number;
      sesiones_con_chat_webchat?: number;
      sesiones_sin_chat_webchat?: number;
      conversaciones_whatsapp?: number;
      conversaciones_voz?: number;
      conversaciones_correo?: number;
      wa_atribucion_total?: number;
      correo_total?: number;
      fuentes_top?: Array<{ source: string; total: number }>;
      utm_top?: Array<{
        utm_source: string;
        utm_medium: string;
        utm_campaign: string;
        total: number;
      }>;
      wa_atribucion_top?: Array<{
        canal_publicitario: string;
        campana_publicitaria: string;
        total: number;
      }>;
      has_data: boolean;
    }>;
    totals: {
      total: number;
      con_chat: number;
      sin_chat: number;
      webchat_con_chat: number;
      webchat_sin_chat: number;
      sesiones_web_total?: number;
      sesiones_webchat_total?: number;
      conversaciones_whatsapp?: number;
      conversaciones_voz?: number;
      conversaciones_correo?: number;
      wa_atribucion_total?: number;
      correo_total?: number;
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

type DemografiaQueryParams = Record<string, string | number | boolean | null | undefined>;

async function callDemografiaEndpoint<T>(
  endpoint: string,
  params: DemografiaQueryParams,
): Promise<T> {
  const response = await callCrmApi<T>(`/crm/demografia/${endpoint}`, {
    searchParams: params,
    withUserToken: true,
  });
  if (!response.ok) {
    throw new Error(response.error || `CRM respondió error (${endpoint}).`);
  }
  return response.data;
}

export async function loadDemografiaData(
  nivel: "pais" | "estado" | "municipio" = "estado",
  options: {
    estado?: string | null;
    canales?: string[];
    etapas?: string[];
    sourceClass?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    campanaId?: string | null;
    campanaTipo?: string | null;
    templateId?: string | null;
    waCanalPublicitario?: string | null;
    waCampanaPublicitaria?: string | null;
    waReglaId?: string | null;
    rango?: string | null;
    desde?: string | null;
    hasta?: string | null;
  } = {},
): Promise<DemografiaData> {
  const resumenParams: DemografiaQueryParams = { nivel };
  const mapaParams: DemografiaQueryParams = { nivel };

  if (options.canales?.length) {
    const joined = options.canales.join(",");
    resumenParams.canales = joined;
    mapaParams.canales = joined;
  }
  if (options.etapas?.length) {
    const joinedStages = options.etapas.join(",");
    resumenParams.etapas = joinedStages;
    mapaParams.etapas = joinedStages;
  }
  if (nivel === "municipio" && options.estado) {
    mapaParams.estado = options.estado;
    resumenParams.estado = options.estado;
  }
  if (options.sourceClass) {
    resumenParams.source_class = options.sourceClass;
    mapaParams.source_class = options.sourceClass;
  }
  if (options.utmSource) {
    resumenParams.utm_source = options.utmSource;
    mapaParams.utm_source = options.utmSource;
  }
  if (options.utmMedium) {
    resumenParams.utm_medium = options.utmMedium;
    mapaParams.utm_medium = options.utmMedium;
  }
  if (options.utmCampaign) {
    resumenParams.utm_campaign = options.utmCampaign;
    mapaParams.utm_campaign = options.utmCampaign;
  }
  if (options.campanaId) {
    resumenParams.campana_id = options.campanaId;
    mapaParams.campana_id = options.campanaId;
  }
  if (options.campanaTipo) {
    resumenParams.campana_tipo = options.campanaTipo;
    mapaParams.campana_tipo = options.campanaTipo;
  }
  if (options.templateId) {
    resumenParams.template_id = options.templateId;
    mapaParams.template_id = options.templateId;
  }
  if (options.waCanalPublicitario) {
    resumenParams.wa_canal_publicitario = options.waCanalPublicitario;
    mapaParams.wa_canal_publicitario = options.waCanalPublicitario;
  }
  if (options.waCampanaPublicitaria) {
    resumenParams.wa_campana_publicitaria = options.waCampanaPublicitaria;
    mapaParams.wa_campana_publicitaria = options.waCampanaPublicitaria;
  }
  if (options.waReglaId) {
    resumenParams.wa_regla_id = options.waReglaId;
    mapaParams.wa_regla_id = options.waReglaId;
  }
  if (options.rango) {
    resumenParams.rango = options.rango;
    mapaParams.rango = options.rango;
  }
  if (options.desde) {
    resumenParams.desde = options.desde;
    mapaParams.desde = options.desde;
  }
  if (options.hasta) {
    resumenParams.hasta = options.hasta;
    mapaParams.hasta = options.hasta;
  }

  const [summary, map] = await Promise.all([
    callDemografiaEndpoint<DemografiaSummaryResponse>("resumen-v2", resumenParams),
    callDemografiaEndpoint<DemografiaMapResponse>("mapa-v2", mapaParams),
  ]);

  return { summary, map };
}
