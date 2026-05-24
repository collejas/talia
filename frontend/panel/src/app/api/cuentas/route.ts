import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type UnknownRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as UnknownRecord;
  const response = await callCrmApi<UnknownRecord>("/crm/cuentas", {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cuenta_create_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data, { status: 201 });
}
