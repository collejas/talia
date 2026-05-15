import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = { params: Promise<{ cuentaId: string; relacionId: string }> };
type UnknownRecord = Record<string, unknown>;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { cuentaId, relacionId } = await context.params;
  if (!cuentaId || !relacionId) {
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  }

  let payload: UnknownRecord;
  try {
    payload = (await request.json()) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const response = await callCrmApi<UnknownRecord>(
    `/crm/cuentas/${encodeURIComponent(cuentaId)}/relaciones/${encodeURIComponent(relacionId)}`,
    {
      method: "PATCH",
      body: payload,
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cuenta_relacion_update_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const { cuentaId, relacionId } = await context.params;
  if (!cuentaId || !relacionId) {
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  }

  const response = await callCrmApi(
    `/crm/cuentas/${encodeURIComponent(cuentaId)}/relaciones/${encodeURIComponent(relacionId)}`,
    {
      method: "DELETE",
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cuenta_relacion_delete_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
