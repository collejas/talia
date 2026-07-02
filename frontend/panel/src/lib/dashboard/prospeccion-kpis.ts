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
  campanas_whatsapp: {
    batches_total: number;
    batches_completados: number;
    batches_en_proceso: number;
    batches_error: number;
    prospectos_total: number;
    mensajes_salientes: number;
    mensajes_con_evento_entrega: number;
    mensajes_entregados: number;
    mensajes_leidos: number;
    mensajes_fallidos: number;
    mensajes_sin_evento_entrega: number;
    mensajes_entrantes: number;
    conversaciones_total: number;
    conversaciones_respondidas: number;
    conversaciones_sin_respuesta: number;
    oportunidades_total: number;
    oportunidades_abiertas: number;
    oportunidades_ganadas: number;
    oportunidades_perdidas: number;
    monto_estimado_total: number;
    tasa_entrega_pct: number;
    tasa_lectura_pct: number;
    tasa_fallo_pct: number;
    tasa_trazabilidad_pct: number;
    tasa_respuesta_pct: number;
    tasa_oportunidad_pct: number;
    tasa_cierre_pct: number;
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
  template_id?: string | null;
  template_slug?: string | null;
  template_nombre?: string | null;
  twilio_content_sid?: string | null;
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

export type ProspeccionCampanaWhatsAppItem = ProspeccionMetricasSummary["campanas_whatsapp"] & {
  campana_id?: string | null;
  campana_nombre?: string | null;
  canal?: string | null;
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
  campanas_whatsapp?: {
    summary?: ProspeccionMetricasSummary["campanas_whatsapp"];
    items?: ProspeccionCampanaWhatsAppItem[];
  };
  frases_whatsapp?: {
    summary?: ProspeccionMetricasSummary["frases_whatsapp"];
    by_rule?: ProspeccionFraseByRule[];
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

export type ProspeccionFraseByRule = {
  regla_id?: string | null;
  regla_nombre: string;
  canal_publicitario: string;
  campana_publicitaria?: string | null;
  conversaciones_atribuidas: number;
  contactos_unicos: number;
  oportunidades_creadas: number;
  tasa_conversacion_oportunidad_pct: number;
  monto_estimado_total: number;
};

export async function fetchProspeccionMetricas(
  filters: ProspeccionFilters = {},
): Promise<{
  summary: ProspeccionMetricasSummary;
  timeseries: ProspeccionTimeseries;
  items: ProspeccionCampanaItem[];
  whatsappItems: ProspeccionCampanaWhatsAppItem[];
  byRule: ProspeccionFraseByRule[];
}> {
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
      campanas_whatsapp: response.data?.campanas_whatsapp?.summary ?? emptyWhatsAppCampanasSummary(),
      frases_whatsapp: response.data?.frases_whatsapp?.summary ?? emptyFrasesSummary(),
    },
    timeseries: {
      campanas: response.data?.campanas?.timeseries ?? [],
      frases_whatsapp: response.data?.frases_whatsapp?.timeseries ?? [],
    },
    items: Array.isArray(response.data?.campanas?.items) ? response.data?.campanas?.items ?? [] : [],
    whatsappItems: Array.isArray(response.data?.campanas_whatsapp?.items)
      ? response.data?.campanas_whatsapp?.items ?? []
      : [],
    byRule: Array.isArray(response.data?.frases_whatsapp?.by_rule) ? response.data?.frases_whatsapp?.by_rule ?? [] : [],
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

function emptyWhatsAppCampanasSummary(): ProspeccionMetricasSummary["campanas_whatsapp"] {
  return {
    batches_total: 0,
    batches_completados: 0,
    batches_en_proceso: 0,
    batches_error: 0,
    prospectos_total: 0,
    mensajes_salientes: 0,
    mensajes_con_evento_entrega: 0,
    mensajes_entregados: 0,
    mensajes_leidos: 0,
    mensajes_fallidos: 0,
    mensajes_sin_evento_entrega: 0,
    mensajes_entrantes: 0,
    conversaciones_total: 0,
    conversaciones_respondidas: 0,
    conversaciones_sin_respuesta: 0,
    oportunidades_total: 0,
    oportunidades_abiertas: 0,
    oportunidades_ganadas: 0,
    oportunidades_perdidas: 0,
    monto_estimado_total: 0,
    tasa_entrega_pct: 0,
    tasa_lectura_pct: 0,
    tasa_fallo_pct: 0,
    tasa_trazabilidad_pct: 0,
    tasa_respuesta_pct: 0,
    tasa_oportunidad_pct: 0,
    tasa_cierre_pct: 0,
  };
}
