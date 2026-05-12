"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type CrmActivityRow = {
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
  completado_en: string | null;
  cancelado_en: string | null;
  cerrado_por_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  const response = await callCrmApi<{ items?: CrmActivityRow[] } | CrmActivityRow[]>("/crm/actividades", {
    searchParams: {
      oportunidad_id: oportunidadId,
      limit: "200",
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron cargar las actividades." },
      { status: response.status ?? 500 },
    );
  }

  const rows = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as { items?: CrmActivityRow[] }).items)
      ? (response.data as { items: CrmActivityRow[] }).items
      : [];

  return NextResponse.json({ data: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const tipo = typeof (payload as { tipo?: unknown })?.tipo === "string"
    ? ((payload as { tipo: string }).tipo ?? "seguimiento")
    : "seguimiento";
  const asunto = typeof (payload as { asunto?: unknown })?.asunto === "string"
    ? ((payload as { asunto: string }).asunto ?? "")
    : "";
  const descripcion = typeof (payload as { descripcion?: unknown })?.descripcion === "string"
    ? ((payload as { descripcion: string }).descripcion ?? "")
    : "";
  const prioridad = typeof (payload as { prioridad?: unknown })?.prioridad === "string"
    ? ((payload as { prioridad: string }).prioridad ?? "media")
    : "media";
  const estado = typeof (payload as { estado?: unknown })?.estado === "string"
    ? ((payload as { estado: string }).estado ?? "pendiente")
    : "pendiente";
  const fechaVencimiento = typeof (payload as { fecha_vencimiento?: unknown })?.fecha_vencimiento === "string"
    ? ((payload as { fecha_vencimiento: string }).fecha_vencimiento ?? "")
    : "";
  const recordatorioEn = typeof (payload as { recordatorio_en?: unknown })?.recordatorio_en === "string"
    ? ((payload as { recordatorio_en: string }).recordatorio_en ?? "")
    : "";
  const asignadoAUsuarioId = typeof (payload as { asignado_a_usuario_id?: unknown })?.asignado_a_usuario_id === "string"
    ? ((payload as { asignado_a_usuario_id: string }).asignado_a_usuario_id ?? "")
    : "";

  const response = await callCrmApi<CrmActivityRow>("/crm/actividades", {
    method: "POST",
    body: {
      tipo,
      asunto,
      descripcion,
      prioridad,
      estado,
      fecha_vencimiento: fechaVencimiento || undefined,
      recordatorio_en: recordatorioEn || undefined,
      asignado_a_usuario_id: asignadoAUsuarioId || undefined,
      oportunidad_id: oportunidadId,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo crear la actividad." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json({ data: response.data });
}
