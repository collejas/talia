import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = { params: Promise<{ personaId: string }> };
type UnknownRecord = Record<string, unknown>;

export async function GET(request: NextRequest, context: RouteContext) {
  const { personaId } = await context.params;
  if (!personaId) return NextResponse.json({ error: "missing_persona_id" }, { status: 400 });

  const search = request.nextUrl.searchParams;
  const activo = search.get("activo");
  const qs = typeof activo === "string" ? `?activo=${encodeURIComponent(activo)}` : "";

  const response = await callCrmApi<UnknownRecord[]>(
    `/crm/personas/${encodeURIComponent(personaId)}/relaciones${qs}`,
    {
      method: "GET",
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "relaciones_list_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ items: Array.isArray(response.data) ? response.data : [] });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { personaId } = await context.params;
  if (!personaId) return NextResponse.json({ error: "missing_persona_id" }, { status: 400 });

  let payload: UnknownRecord;
  try {
    payload = (await request.json()) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const response = await callCrmApi<UnknownRecord>(
    `/crm/personas/${encodeURIComponent(personaId)}/relaciones`,
    {
      method: "POST",
      body: payload,
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "relacion_create_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
