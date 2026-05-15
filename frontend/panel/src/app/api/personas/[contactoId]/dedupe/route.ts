import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = { params: Promise<{ contactoId: string }> };
type UnknownRecord = Record<string, unknown>;

export async function GET(_request: NextRequest, context: RouteContext) {
  const { contactoId } = await context.params;
  if (!contactoId) return NextResponse.json({ error: "missing_contacto_id" }, { status: 400 });

  const response = await callCrmApi<UnknownRecord>(`/crm/personas/${encodeURIComponent(contactoId)}/dedupe`, {
    method: "GET",
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "persona_dedupe_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
