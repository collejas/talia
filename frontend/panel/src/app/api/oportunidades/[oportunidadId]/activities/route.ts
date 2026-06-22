"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type PermissionContext = {
  roles?: string[];
  permisos?: string[];
  es_admin?: boolean;
  es_owner?: boolean;
};

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

function hasSupervisedActivityAccess(context: PermissionContext | null | undefined): boolean {
  if (!context) return false;
  if (context.es_admin || context.es_owner) return true;

  const roles = Array.isArray(context.roles)
    ? context.roles.map((role) => (role ?? "").toString().trim().toLowerCase()).filter(Boolean)
    : [];
  if (
    roles.some((role) =>
      role === "0002" ||
      role.includes("supervisor") ||
      role.includes("gerente") ||
      role.includes("manager") ||
      role.includes("admin"),
    )
  ) {
    return true;
  }

  const permisos = Array.isArray(context.permisos)
    ? context.permisos.map((permiso) => (permiso ?? "").toString().trim().toLowerCase()).filter(Boolean)
    : [];
  return permisos.some((permiso) =>
    permiso === "activities.create.supervised" ||
    permiso === "activities.write" ||
    permiso === "activities.manage" ||
    permiso === "activities.view",
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  const permissionsResponse = await callCrmApi<PermissionContext>("/crm/me/permissions", {
    withUserToken: true,
  });
  if (!permissionsResponse.ok || !hasSupervisedActivityAccess(permissionsResponse.data)) {
    return NextResponse.json({ error: "permiso_denegado" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const response = await callCrmApi<CrmActivityRow>("/crm/actividades", {
    method: "POST",
    body: {
      tipo: typeof (payload as { tipo?: unknown })?.tipo === "string" ? (payload as { tipo: string }).tipo : "seguimiento",
      canal: typeof (payload as { canal?: unknown })?.canal === "string" ? (payload as { canal: string }).canal : undefined,
      asunto: typeof (payload as { asunto?: unknown })?.asunto === "string" ? (payload as { asunto: string }).asunto : undefined,
      descripcion:
        typeof (payload as { descripcion?: unknown })?.descripcion === "string"
          ? (payload as { descripcion: string }).descripcion
          : undefined,
      estado: typeof (payload as { estado?: unknown })?.estado === "string" ? (payload as { estado: string }).estado : "pendiente",
      prioridad:
        typeof (payload as { prioridad?: unknown })?.prioridad === "string"
          ? (payload as { prioridad: string }).prioridad
          : "media",
      fecha_vencimiento:
        typeof (payload as { fecha_vencimiento?: unknown })?.fecha_vencimiento === "string"
          ? (payload as { fecha_vencimiento: string }).fecha_vencimiento
          : undefined,
      recordatorio_en:
        typeof (payload as { recordatorio_en?: unknown })?.recordatorio_en === "string"
          ? (payload as { recordatorio_en: string }).recordatorio_en
          : undefined,
      asignado_a_usuario_id:
        typeof (payload as { asignado_a_usuario_id?: unknown })?.asignado_a_usuario_id === "string"
          ? (payload as { asignado_a_usuario_id: string }).asignado_a_usuario_id
          : undefined,
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
