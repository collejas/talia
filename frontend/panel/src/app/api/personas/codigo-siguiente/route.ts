import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(_request: NextRequest) {
  const result = await callCrmApi<{ codigo_contacto?: string | null }>("/crm/personas/codigo-siguiente", {
    withUserToken: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "persona_code_preview_failed" },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json({ codigo_contacto: result.data.codigo_contacto ?? null });
}
