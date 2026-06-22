"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type PermissionContext = {
  roles?: string[];
  permisos?: string[];
  es_admin?: boolean;
  es_owner?: boolean;
};

type OpportunityNoteRow = {
  id: string;
  organizacion_id: string;
  relacion_tipo: string;
  relacion_id: string;
  actividad_id: string | null;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id: string | null;
  creado_en: string;
  actualizado_en: string;
};

function hasSupervisedNoteAccess(context: PermissionContext | null | undefined): boolean {
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
    permiso === "notes.create.supervised" ||
    permiso === "notes.write" ||
    permiso === "notes.manage" ||
    permiso === "notes.view",
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
  if (!permissionsResponse.ok || !hasSupervisedNoteAccess(permissionsResponse.data)) {
    return NextResponse.json({ error: "permiso_denegado" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const texto =
    typeof (payload as { texto?: unknown })?.texto === "string"
      ? ((payload as { texto: string }).texto ?? "").trim()
      : "";
  const visibleParaCliente = Boolean((payload as { visible_para_cliente?: unknown })?.visible_para_cliente);
  const tipo =
    typeof (payload as { tipo?: unknown })?.tipo === "string"
      ? ((payload as { tipo: string }).tipo ?? "interna").trim() || "interna"
      : "interna";
  const actividadId =
    typeof (payload as { actividad_id?: unknown })?.actividad_id === "string"
      ? ((payload as { actividad_id: string }).actividad_id ?? "").trim()
      : "";

  if (!texto) {
    return NextResponse.json({ error: "La nota no puede ir vacía." }, { status: 400 });
  }

  const response = await callCrmApi<OpportunityNoteRow>("/crm/notas", {
    method: "POST",
    body: {
      relacion_tipo: "oportunidad",
      relacion_id: oportunidadId,
      actividad_id: actividadId || undefined,
      texto,
      visible_para_cliente: visibleParaCliente,
      tipo,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo guardar la nota." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json({ data: response.data });
}
