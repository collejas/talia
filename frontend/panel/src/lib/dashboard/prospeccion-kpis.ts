"use server";

import { callCrmApi } from "@/lib/api/crm";

export type ProspeccionMetricasSummary = {
  campanas: {
    envios_totales: number;
    envios_enviados: number;
    envios_entregados: number;
    envios_respondidos: number;
    brevo_aperturas: number;
    brevo_clicks: number;
    sesiones_utm: number;
    tasa_entrega_pct: number;
    tasa_respuesta_pct: number;
  };
  frases_whatsapp: {
    conversaciones_atribuidas: number;
    contactos_unicos: number;
    oportunidades_creadas: number;
    tasa_conversacion_oportunidad_pct: number;
    monto_estimado_total: number;
  };
};

export type ProspeccionCampanaItem = {
  campana_id?: string | null;
  campana_nombre?: string | null;
  canal?: string | null;
  envios_totales: number;
  envios_enviados: number;
  envios_entregados: number;
  envios_fallidos: number;
  envios_omitidos: number;
  envios_respondidos: number;
  brevo_aperturas: number;
  brevo_clicks: number;
  sesiones_utm: number;
  tasa_entrega_pct: number;
  tasa_respuesta_pct: number;
  click_to_session_pct: number;
};

type ProspeccionMetricasResponse = {
  ok?: boolean;
  campanas?: {
    summary?: ProspeccionMetricasSummary["campanas"];
    items?: ProspeccionCampanaItem[];
    timeseries?: Array<{
      fecha: string;
      envios_totales: number;
      envios_enviados: number;
      envios_entregados: number;
      envios_respondidos: number;
    }>;
  };
  frases_whatsapp?: {
    summary?: ProspeccionMetricasSummary["frases_whatsapp"];
    timeseries?: Array<{
      fecha: string;
      conversaciones_atribuidas: number;
      oportunidades_creadas: number;
      monto_estimado_total: number;
    }>;
  };
};

type ProspeccionFilters = {
  date_from?: string;
  date_to?: string;
  campana_id?: string;
  canal?: "todos" | "correo" | "whatsapp" | "llamada";
  campana_publicitaria?: string;
  regla_id?: string;
  limit?: number;
};

export type ProspeccionTimeseries = {
  campanas: Array<{
    fecha: string;
    envios_totales: number;
    envios_enviados: number;
    envios_entregados: number;
    envios_respondidos: number;
  }>;
  frases_whatsapp: Array<{
    fecha: string;
    conversaciones_atribuidas: number;
    oportunidades_creadas: number;
    monto_estimado_total: number;
  }>;
};

export async function fetchProspeccionMetricas(
  filters: ProspeccionFilters = {},
): Promise<{ summary: ProspeccionMetricasSummary; timeseries: ProspeccionTimeseries; items: ProspeccionCampanaItem[] }> {
  const response = await callCrmApi<ProspeccionMetricasResponse>("/crm/prospeccion/metricas", {
    withUserToken: true,
    searchParams: {
      date_from: filters.date_from,
      date_to: filters.date_to,
      campana_id: filters.campana_id,
      canal: filters.canal,
      campana_publicitaria: filters.campana_publicitaria,
      regla_id: filters.regla_id,
      limit: typeof filters.limit === "number" ? String(filters.limit) : undefined,
    },
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return {
    summary: {
      campanas: response.data?.campanas?.summary ?? emptyCampanasSummary(),
      frases_whatsapp: response.data?.frases_whatsapp?.summary ?? emptyFrasesSummary(),
    },
    timeseries: {
      campanas: response.data?.campanas?.timeseries ?? [],
      frases_whatsapp: response.data?.frases_whatsapp?.timeseries ?? [],
    },
    items: Array.isArray(response.data?.campanas?.items) ? response.data?.campanas?.items ?? [] : [],
  };
}

function emptyCampanasSummary(): ProspeccionMetricasSummary["campanas"] {
  return {
    envios_totales: 0,
    envios_enviados: 0,
    envios_entregados: 0,
    envios_respondidos: 0,
    brevo_aperturas: 0,
    brevo_clicks: 0,
    sesiones_utm: 0,
    tasa_entrega_pct: 0,
    tasa_respuesta_pct: 0,
  };
}

function emptyFrasesSummary(): ProspeccionMetricasSummary["frases_whatsapp"] {
  return {
    conversaciones_atribuidas: 0,
    contactos_unicos: 0,
    oportunidades_creadas: 0,
    tasa_conversacion_oportunidad_pct: 0,
    monto_estimado_total: 0,
  };
}
