"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMActivity = {
  id: string;
  tipo: string;
  canal: string | null;
  asunto: string | null;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  fecha_vencimiento: string | null;
  inicio_en: string | null;
  fin_en: string | null;
  recordatorio_en: string | null;
  cuenta_id: string | null;
  contacto_id: string | null;
  oportunidad_id: string | null;
  asignado_a_usuario_id: string | null;
  creado_por_usuario_id: string | null;
  asignado_a_usuario?: { id: string; nombre_completo: string | null } | null;
  creado_por_usuario?: { id: string; nombre_completo: string | null } | null;
  oportunidad?: {
    id: string;
    codigo_oportunidad: string | null;
    titulo: string | null;
    contacto_nombre: string | null;
  } | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMActivitiesResponse = {
  items: CRMActivity[];
  limit: number;
  offset: number;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : dateTimeFormatter.format(date);
}

export type CrmActivitiesPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmActivities(): Promise<CrmActivitiesPayload> {
  const response = await callCrmApi<CRMActivitiesResponse>("/crm/actividades", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok) {
    return { rows: [], total: 0, errors: [response.error] };
  }

  const rows = response.data.items.map<DataTableRow>((activity, index) => ({
    id: index + 1,
    header: activity.asunto || activity.tipo || "Actividad sin título",
    type: activity.tipo,
    status: activity.estado,
    target:
      [activity.oportunidad?.codigo_oportunidad, activity.oportunidad?.titulo]
        .filter(Boolean)
        .join(" · ") || "Sin oportunidad",
    limit: formatDateTime(activity.fecha_vencimiento),
    reviewer:
      activity.asignado_a_usuario?.nombre_completo?.trim() ||
      activity.asignado_a_usuario_id ||
      "Sin asignar",
    raw: {
      ...activity,
      target_href: activity.oportunidad?.id
        ? `/embudo?oportunidadId=${encodeURIComponent(activity.oportunidad.id)}`
        : undefined,
      detail_href: activity.oportunidad?.id
        ? `/embudo?oportunidadId=${encodeURIComponent(activity.oportunidad.id)}`
        : undefined,
    },
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}
