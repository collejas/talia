"use server";

import { callCrmApi } from "@/lib/api/crm";

export type DashboardKpis = {
  conversaciones?: {
    total?: number;
    webchat_total?: number;
    canales_activos?: number;
    sin_respuesta_total?: number;
    abiertas_total?: number;
    activas_24h?: number;
    por_estado?: Record<string, number>;
    por_canal?: Record<string, number>;
    sin_respuesta_por_canal?: Record<string, number>;
  };
  contactos?: {
    total?: number;
    por_estado?: Record<string, number>;
    captura?: Record<string, number>;
    desde_conversaciones?: {
      con_contacto_total?: number;
      contacto_completo_total?: number;
      por_canal?: Record<
        string,
        {
          conversaciones?: number;
          con_contacto?: number;
          contacto_completo?: number;
        }
      >;
    };
  };
  visitantes?: number;
  visitas_totales?: number;
  tiempos_respuesta?: {
    promedio?: number | null;
    maximo?: number | null;
    por_canal?: Record<
      string,
      {
        con_respuesta?: number;
        promedio?: number | null;
        maximo?: number | null;
      }
    >;
  };
  webchat?: {
    visitas_sin_chat?: number;
    conversaciones?: number;
    visitas_totales?: number;
    contactos_completos?: number;
  };
};

type DashboardKpisResponse = {
  ok?: boolean;
  kpis?: DashboardKpis;
  range?: {
    preset?: string | null;
    from?: string | null;
    to?: string | null;
  };
};

type RangeFilters = {
  rango?: string;
  desde?: string;
  hasta?: string;
};

export async function fetchDashboardKpis(
  filters: RangeFilters = {},
): Promise<DashboardKpis> {
  const response = await callCrmApi<DashboardKpisResponse>("/crm/dashboard/kpis", {
    withUserToken: true,
    searchParams: {
      rango: filters.rango || undefined,
      desde: filters.desde || undefined,
      hasta: filters.hasta || undefined,
    },
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data?.kpis ?? {};
}
