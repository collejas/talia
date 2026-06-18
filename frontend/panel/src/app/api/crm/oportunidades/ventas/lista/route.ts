import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "100";
  const response = await callCrmApi("/crm/oportunidades/ventas/lista", {
    searchParams: { limit },
    // Este listado usa el token de panel para evitar el RPC pesado de contexto por usuario.
    withUserToken: false,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "opportunities_sale_list_failed" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? []);
}
