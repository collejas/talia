"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunityDetailRow = Record<string, unknown>;

type CRMUserRow = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  rol_principal?: string | null;
  roles?: string[];
};

type CRMNoteRow = {
  id: string;
  organizacion_id: string;
  relacion_tipo: string;
  relacion_id: string;
  actividad_id: string | null;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id: string | null;
  creado_por_usuario?: CRMUserRow | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMActivityRow = {
  id: string;
  organizacion_id: string;
  tipo: string;
  canal: string | null;
  asunto: string | null;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  fecha_vencimiento: string | null;
  inicio_en: string | null;
  fin_en: string | null;
  sla_horas: number | null;
  recordatorio_en: string | null;
  cuenta_id: string | null;
  contacto_id: string | null;
  oportunidad_id: string | null;
  creado_por_usuario_id: string | null;
  asignado_a_usuario_id: string | null;
  creado_por_usuario?: CRMUserRow | null;
  asignado_a_usuario?: CRMUserRow | null;
  completado_en: string | null;
  cancelado_en: string | null;
  cerrado_por_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMQuoteRow = {
  id: string;
  organizacion_id: string;
  oportunidad_id: string | null;
  cuenta_id: string | null;
  contacto_id: string | null;
  estatus: string;
  total: number | null;
  moneda: string;
  valida_hasta: string | null;
  creada_por_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMHistoryRow = {
  id: string;
  oportunidad_id: string;
  tipo: string;
  cambiado_en: string;
  cambiado_por_id: string | null;
  cambiado_por_nombre: string | null;
  fuente: string | null;
  etapa_origen_id: string | null;
  etapa_origen_nombre: string | null;
  etapa_destino_id: string | null;
  etapa_destino_nombre: string | null;
  motivo: string | null;
  nota: string | null;
  metadata: Record<string, unknown> | null;
};

type DetailErrorKey = "opportunity" | "notes" | "activities" | "quotes" | "history";

type DetailResponse = {
  ok: true;
  opportunity: CRMOpportunityDetailRow | null;
  notes: CRMNoteRow[];
  activities: CRMActivityRow[];
  quotes: CRMQuoteRow[];
  history: CRMHistoryRow[];
  errors: Partial<Record<DetailErrorKey, string>>;
};

function extractOpportunityId(request: Request, params: { oportunidadId?: string } | undefined): string | null {
  const fromParams = params?.oportunidadId?.trim();
  if (fromParams) return fromParams;
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const index = segments.findIndex((segment) => segment === "oportunidades");
    if (index >= 0 && segments[index + 1]) {
      return segments[index + 1].trim();
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  let oportunidadId: string | null = null;
  try {
    oportunidadId = extractOpportunityId(request, await params);
  } catch {
    oportunidadId = extractOpportunityId(request, undefined);
  }

  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  const opportunityResult = await callCrmApi<CRMOpportunityDetailRow>(`/crm/oportunidades/${oportunidadId}`, {
    withUserToken: true,
  });
  if (!opportunityResult.ok) {
    return NextResponse.json(
      { error: opportunityResult.error || "No se pudo cargar la oportunidad." },
      { status: opportunityResult.status ?? 500 },
    );
  }

  const [notesResult, activitiesResult, quotesResult, historyResult] = await Promise.all([
    callCrmApi<{ items?: CRMNoteRow[] } | CRMNoteRow[]>("/crm/notas", {
      searchParams: {
        oportunidad_id: oportunidadId,
      },
      withUserToken: true,
    }),
    callCrmApi<{ items?: CRMActivityRow[] } | CRMActivityRow[]>("/crm/actividades", {
      searchParams: {
        oportunidad_id: oportunidadId,
        limit: "50",
      },
      withUserToken: true,
    }),
    callCrmApi<CRMQuoteRow[] | { items?: CRMQuoteRow[] }>("/crm/cotizaciones", {
      searchParams: {
        oportunidad_id: oportunidadId,
      },
      withUserToken: true,
    }),
    callCrmApi<{ items?: CRMHistoryRow[] }>("/crm/pipeline/opportunities/" + oportunidadId + "/history", {
      searchParams: {
        limit: "50",
        offset: "0",
      },
      withUserToken: true,
    }),
  ]);

  const notes = normalizeItems(notesResult);
  const activities = normalizeItems(activitiesResult);
  const quotes = normalizeItems(quotesResult);
  const history = normalizeItems(historyResult);

  const errors: Partial<Record<DetailErrorKey, string>> = {};
  if (!notesResult.ok) errors.notes = notesResult.error || "No se pudieron cargar las notas.";
  if (!activitiesResult.ok) errors.activities = activitiesResult.error || "No se pudieron cargar las actividades.";
  if (!quotesResult.ok) errors.quotes = quotesResult.error || "No se pudieron cargar las cotizaciones.";
  if (!historyResult.ok) errors.history = historyResult.error || "No se pudo cargar el historial.";

  return NextResponse.json<DetailResponse>({
    ok: true,
    opportunity: opportunityResult.data,
    notes,
    activities,
    quotes,
    history,
    errors,
  });
}

function normalizeItems<T>(result: { ok: true; data: T[] | { items?: T[] } } | { ok: false; error: string }): T[] {
  if (!result.ok) return [];
  if (Array.isArray(result.data)) return result.data;
  if (result.data && typeof result.data === "object" && Array.isArray((result.data as { items?: T[] }).items)) {
    return (result.data as { items: T[] }).items;
  }
  return [];
}
