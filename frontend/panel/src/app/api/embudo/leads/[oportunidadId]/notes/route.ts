"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type CrmUserRow = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  rol_principal?: string | null;
  roles?: string[];
};

type CrmNoteRow = {
  id: string;
  organizacion_id: string;
  relacion_tipo: string;
  relacion_id: string;
  actividad_id: string | null;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id: string | null;
  creado_por_usuario?: CrmUserRow | null;
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

  const response = await callCrmApi<{ items?: CrmNoteRow[] } | CrmNoteRow[]>("/crm/notas", {
    searchParams: {
      relacion_tipo: "oportunidad",
      relacion_id: oportunidadId,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron cargar las notas." },
      { status: response.status ?? 500 },
    );
  }

  const rows = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as { items?: CrmNoteRow[] }).items)
      ? (response.data as { items: CrmNoteRow[] }).items
      : [];

  const userIds = Array.from(
    new Set(rows.map((row) => row.creado_por_usuario_id).filter((value): value is string => !!value)),
  );
  const usersResponse = userIds.length
    ? await callCrmApi<{ items?: CrmUserRow[] } | CrmUserRow[]>("/crm/usuarios", {
        searchParams: {
          limit: "500",
        },
        withUserToken: true,
      })
    : null;
  const users = usersResponse?.ok ? normalizeItems(usersResponse.data) : [];
  const userMap = new Map(users.map((user) => [user.id, user] as const));
  const enrichedRows = rows.map((row) => ({
    ...row,
    creado_por_usuario:
      row.creado_por_usuario ??
      (row.creado_por_usuario_id ? userMap.get(row.creado_por_usuario_id) ?? null : null),
  }));

  return NextResponse.json({ data: enrichedRows });
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

  const texto = typeof (payload as { texto?: unknown })?.texto === "string"
    ? ((payload as { texto: string }).texto ?? "")
    : "";
  const actividadId = typeof (payload as { actividad_id?: unknown })?.actividad_id === "string"
    ? ((payload as { actividad_id: string }).actividad_id ?? "")
    : "";
  const visibleParaCliente = Boolean((payload as { visible_para_cliente?: unknown })?.visible_para_cliente);
  const tipo =
    typeof (payload as { tipo?: unknown })?.tipo === "string"
      ? ((payload as { tipo: string }).tipo ?? "interna")
      : "interna";

  const response = await callCrmApi<CrmNoteRow>("/crm/notas", {
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

function normalizeItems<T>(payload: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}
