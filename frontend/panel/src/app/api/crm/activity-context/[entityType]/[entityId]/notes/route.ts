import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteParams = { entityType: string; entityId: string };

function resolveRelation(entityType: string, entityId: string): { relacion_tipo: string; relacion_id: string } | null {
  if (entityType === "persona") return { relacion_tipo: "persona", relacion_id: entityId };
  if (entityType === "cuenta") return { relacion_tipo: "cuenta", relacion_id: entityId };
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const { entityType, entityId } = await params;
  const relation = resolveRelation(entityType, entityId);
  if (!relation) return NextResponse.json({ error: "entidad_no_soportada" }, { status: 400 });

  const response = await callCrmApi<{ items?: unknown[] } | unknown[]>("/crm/notas", {
    searchParams: relation,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "No se pudieron cargar las notas." }, { status: response.status ?? 500 });
  }
  const items = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as { items?: unknown[] }).items)
      ? (response.data as { items: unknown[] }).items
      : [];
  return NextResponse.json({ data: items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const { entityType, entityId } = await params;
  const relation = resolveRelation(entityType, entityId);
  if (!relation) return NextResponse.json({ error: "entidad_no_soportada" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    const body = await request.json();
    payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const response = await callCrmApi("/crm/notas", {
    method: "POST",
    body: { ...payload, ...relation },
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "No se pudo guardar la nota." }, { status: response.status ?? 500 });
  }
  return NextResponse.json({ data: response.data });
}
