import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = { params: Promise<{ personaId: string }> };
type UnknownRecord = Record<string, unknown>;

export async function GET(_request: NextRequest, context: RouteContext) {
  const { personaId } = await context.params;
  if (!personaId) return NextResponse.json({ error: "missing_persona_id" }, { status: 400 });

  const response = await callCrmApi<UnknownRecord>(`/crm/personas/${encodeURIComponent(personaId)}`, {
    method: "GET",
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "persona_detail_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { personaId } = await context.params;
  if (!personaId) return NextResponse.json({ error: "missing_persona_id" }, { status: 400 });

  let payload: UnknownRecord;
  try {
    payload = (await request.json()) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const response = await callCrmApi<UnknownRecord>(`/crm/personas/${encodeURIComponent(personaId)}`, {
    method: "PATCH",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "persona_update_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
