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

export type DemografiaWhatsappAtribucionRow = {
  canal_publicitario: string;
  campana_publicitaria: string;
  total: number;
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
  whatsapp_atribucion?: {
    top: DemografiaWhatsappAtribucionRow[];
  };
  whatsapp_atribucion_top?: DemografiaWhatsappAtribucionRow[];
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
  web_sessions_trend?: {
    metric: "sesiones_web";
    base: "unique_sessions";
    current: number;
    previous: number;
    delta: number;
    delta_pct: number | null;
    direction: "up" | "down" | "flat";
    comparable: boolean;
    current_range: Record<string, string | null>;
    previous_range: Record<string, string | null>;
  };
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
  attribution_rankings?: {
    campaigns?: Array<{
      value: string;
      label: string;
      canal?: string | null;
      conversion_total: number;
      context_total: number;
      conversion_label: string;
      context_label: string;
      conversion_rate_pct: number;
    }>;
    templates?: Array<{
      value: string;
      label: string;
      canal?: string | null;
      parent_campaign_value?: string | null;
      parent_campaign_label?: string | null;
      conversion_total: number;
      context_total: number;
      conversion_label: string;
      context_label: string;
      conversion_rate_pct: number;
    }>;
  };
  traffic_rankings?: {
    campaigns?: Array<{
      value: string;
      label: string;
      total: number;
    }>;
    templates?: Array<{
      value: string;
      label: string;
      parent_campaign_value?: string | null;
      parent_campaign_label?: string | null;
      total: number;
    }>;
  };
  traffic_contact_metrics?: {
    sessions: number;
    sessions_with_contact: number;
    unique_people: number;
    referrer_rows?: Array<{
      host: string;
      total: number;
      converted: number;
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
      whatsapp_atribucion_total?: number;
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
      whatsapp_atribucion_total?: number;
      whatsapp_atribucion_top?: DemografiaWhatsappAtribucionRow[];
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

function mergeMapWithSummaryVisitors(
  map: DemografiaMapResponse,
  summary: DemografiaSummaryResponse,
): DemografiaMapResponse {
  const summaryItems = Array.isArray(summary.visitantes?.items) ? summary.visitantes.items : [];
  const byKey = new Map(summaryItems.map((item) => [item.key, item]));
  const mergedKeys = new Set<string>();

  const mergedDataset = (Array.isArray(map.dataset) ? map.dataset : []).map((entry) => {
    const visitor = byKey.get(entry.key);
    if (!visitor) return entry;
    mergedKeys.add(entry.key);

    const visitantesPorCanal = {
      ...(entry.visitantes_totales_por_canal || {}),
      web: visitor.total ?? 0,
      webchat: visitor.webchat_total ?? 0,
      whatsapp: visitor.whatsapp_total ?? 0,
      voz: visitor.voz_total ?? 0,
      correo: visitor.correo_total ?? 0,
    };

    return {
      ...entry,
      visitantes_total: visitor.total ?? 0,
      visitantes_con_chat: visitor.con_chat ?? 0,
      visitantes_sin_chat: visitor.sin_chat ?? 0,
      visitantes_totales_por_canal: visitantesPorCanal,
      totales_por_canal: Object.fromEntries(
        Object.entries(visitantesPorCanal).filter(([, value]) => (value ?? 0) > 0),
      ),
      conversacion_totales: {
        con_conversacion: visitor.con_chat ?? 0,
        sin_conversacion: visitor.sin_chat ?? 0,
      },
      total_visitas: visitor.total ?? 0,
      traffic_web: {
        sesiones_web_total: visitor.sesiones_web_total ?? 0,
        fuentes_top: visitor.fuentes_top ?? [],
        utm_top: visitor.utm_top ?? [],
      },
      conversation_channels: {
        sesiones_webchat_total: visitor.sesiones_webchat_total ?? 0,
        sesiones_con_chat_webchat: visitor.sesiones_con_chat_webchat ?? 0,
        sesiones_sin_chat_webchat: visitor.sesiones_sin_chat_webchat ?? 0,
        conversaciones_whatsapp: visitor.conversaciones_whatsapp ?? 0,
        conversaciones_voz: visitor.conversaciones_voz ?? 0,
        conversaciones_correo: visitor.conversaciones_correo ?? 0,
      },
      has_data: Boolean(
        entry.leads_total > 0 ||
          (visitor.total ?? 0) > 0 ||
          (visitor.webchat_total ?? 0) > 0 ||
          (visitor.whatsapp_total ?? 0) > 0 ||
          (visitor.voz_total ?? 0) > 0 ||
          (visitor.correo_total ?? 0) > 0,
      ),
    };
  });

  for (const visitor of summaryItems) {
    if (mergedKeys.has(visitor.key)) continue;
    mergedDataset.push({
      key: visitor.key,
      name: visitor.name,
      nivel: map.nivel,
      leads_total: 0,
      leads_totales_por_canal: {},
      totales_por_canal: Object.fromEntries(
        [
          ["web", visitor.total ?? 0],
          ["webchat", visitor.webchat_total ?? 0],
          ["whatsapp", visitor.whatsapp_total ?? 0],
          ["voz", visitor.voz_total ?? 0],
          ["correo", visitor.correo_total ?? 0],
        ].filter(([, value]) => Number(value ?? 0) > 0),
      ),
      visitantes_totales_por_canal: {
        web: visitor.total ?? 0,
        webchat: visitor.webchat_total ?? 0,
        whatsapp: visitor.whatsapp_total ?? 0,
        voz: visitor.voz_total ?? 0,
        correo: visitor.correo_total ?? 0,
      },
      conversacion_totales: {
        con_conversacion: visitor.con_chat ?? 0,
        sin_conversacion: visitor.sin_chat ?? 0,
      },
      etapas_totales: {
        captado: 0,
        precalificado: 0,
        negociacion: 0,
        ganado: 0,
        perdido: 0,
      },
      visitantes_total: visitor.total ?? 0,
      visitantes_con_chat: visitor.con_chat ?? 0,
      visitantes_sin_chat: visitor.sin_chat ?? 0,
      total_visitas: visitor.total ?? 0,
      has_data: Boolean((visitor.total ?? 0) > 0),
      next_level:
        map.nivel === "pais"
          ? visitor.key === "MX"
            ? "estado"
            : null
          : map.nivel === "estado"
            ? "municipio"
            : null,
      parent_state: map.nivel === "municipio" ? visitor.key.slice(0, 2) : null,
      traffic_web: {
        sesiones_web_total: visitor.sesiones_web_total ?? 0,
        fuentes_top: visitor.fuentes_top ?? [],
        utm_top: visitor.utm_top ?? [],
      },
      conversation_channels: {
        sesiones_webchat_total: visitor.sesiones_webchat_total ?? 0,
        sesiones_con_chat_webchat: visitor.sesiones_con_chat_webchat ?? 0,
        sesiones_sin_chat_webchat: visitor.sesiones_sin_chat_webchat ?? 0,
        conversaciones_whatsapp: visitor.conversaciones_whatsapp ?? 0,
        conversaciones_voz: visitor.conversaciones_voz ?? 0,
        conversaciones_correo: visitor.conversaciones_correo ?? 0,
      },
    });
  }

  mergedDataset.sort((a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0));
  return {
    ...map,
    dataset: mergedDataset,
  };
}

function normalizeDemografiaSummaryResponse(
  summary: DemografiaSummaryResponse,
): DemografiaSummaryResponse {
  const visitantes = summary.visitantes ?? {
    items: [],
    totals: {
      total: 0,
      con_chat: 0,
      sin_chat: 0,
      webchat_con_chat: 0,
      webchat_sin_chat: 0,
    },
  };

  const normalizedItems = Array.isArray(visitantes.items)
    ? visitantes.items.map((item) => ({
        ...item,
        wa_atribucion_total: item.wa_atribucion_total ?? item.whatsapp_atribucion_total ?? 0,
        whatsapp_atribucion_total: item.whatsapp_atribucion_total ?? item.wa_atribucion_total ?? 0,
        wa_atribucion_top: Array.isArray(item.wa_atribucion_top) ? item.wa_atribucion_top : [],
      }))
    : [];

  const normalizedTotals = visitantes.totals ?? {
    total: 0,
    con_chat: 0,
    sin_chat: 0,
    webchat_con_chat: 0,
    webchat_sin_chat: 0,
  };

  return {
    ...summary,
    attribution_rankings: {
      campaigns: Array.isArray(summary.attribution_rankings?.campaigns)
        ? summary.attribution_rankings?.campaigns
        : [],
      templates: Array.isArray(summary.attribution_rankings?.templates)
        ? summary.attribution_rankings?.templates
        : [],
    },
    visitantes: {
      ...visitantes,
      items: normalizedItems,
      totals: {
        ...normalizedTotals,
        wa_atribucion_total:
          normalizedTotals.wa_atribucion_total ?? normalizedTotals.whatsapp_atribucion_total ?? 0,
        whatsapp_atribucion_total:
          normalizedTotals.whatsapp_atribucion_total ?? normalizedTotals.wa_atribucion_total ?? 0,
      },
    },
  };
}

function normalizeDemografiaMapResponse(map: DemografiaMapResponse): DemografiaMapResponse {
  return {
    ...map,
    dataset: (Array.isArray(map.dataset) ? map.dataset : []).map((entry) => ({
      ...entry,
      whatsapp_atribucion: {
        top: Array.isArray(entry.whatsapp_atribucion?.top) ? entry.whatsapp_atribucion.top : [],
      },
    })),
  };
}

function buildEmptyDemografiaMapResponse(
  nivel: "pais" | "estado" | "municipio",
  estado: string | null,
): DemografiaMapResponse {
  return {
    ok: true,
    nivel,
    estado,
    range: {},
    canales: null,
    etapas: null,
    totales_leads: {
      total: 0,
      abiertas: 0,
      ganadas: 0,
      perdidas: 0,
      webchat_sin_conversacion: 0,
      webchat_captado: 0,
      webchat_post_captado: 0,
    },
    totales_visitantes: {
      total: 0,
      con_chat: 0,
      sin_chat: 0,
      webchat_con_chat: 0,
      webchat_sin_chat: 0,
    },
    totales_leads_por_canal: {},
    captado_orden: null,
    dataset: [],
    geojson: { type: "FeatureCollection", features: [] },
  };
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
    includeMap?: boolean;
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
  mapaParams.skip_visitantes = true;

  const [summary, map] = await Promise.all([
    callDemografiaEndpoint<DemografiaSummaryResponse>("resumen-v2", resumenParams),
    options.includeMap === false
      ? Promise.resolve<DemografiaMapResponse | null>(null)
      : callDemografiaEndpoint<DemografiaMapResponse>("mapa-v2", mapaParams),
  ]);
  const normalizedSummary = normalizeDemografiaSummaryResponse(summary);
  const normalizedMap = normalizeDemografiaMapResponse(
    map ?? buildEmptyDemografiaMapResponse(nivel, options.estado ?? null),
  );
  return {
    summary: normalizedSummary,
    map: mergeMapWithSummaryVisitors(normalizedMap, normalizedSummary),
  };
}
