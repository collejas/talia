import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: NextRequest) {
  const tipo = request.nextUrl.searchParams.get("tipo") ?? "";
  const result = await callCrmApi<{ codigo_cuenta?: string | null }>("/crm/cuentas/codigo-siguiente", {
    searchParams: tipo ? { tipo } : undefined,
    withUserToken: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "account_code_preview_failed" },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json({ codigo_cuenta: result.data.codigo_cuenta ?? null });
}
