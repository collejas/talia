import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = { params: Promise<{ cuentaId: string }> };
type UnknownRecord = Record<string, unknown>;

export async function GET(_request: NextRequest, context: RouteContext) {
  const { cuentaId } = await context.params;
  if (!cuentaId) return NextResponse.json({ error: "missing_cuenta_id" }, { status: 400 });

  const response = await callCrmApi<UnknownRecord>(`/crm/cuentas/${encodeURIComponent(cuentaId)}`, {
    method: "GET",
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cuenta_detail_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { cuentaId } = await context.params;
  if (!cuentaId) return NextResponse.json({ error: "missing_cuenta_id" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as UnknownRecord;
  const response = await callCrmApi<UnknownRecord>(`/crm/cuentas/${encodeURIComponent(cuentaId)}`, {
    method: "PATCH",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cuenta_update_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
