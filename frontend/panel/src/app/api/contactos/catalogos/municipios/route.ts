import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pais = (url.searchParams.get("pais") || "MX").trim().toUpperCase();
  const estado = (url.searchParams.get("estado") || "").trim();

  if (!estado) {
    return NextResponse.json({ items: [] });
  }

  const response = await callCrmApi("/crm/contactos/catalogos/municipios", {
    withUserToken: true,
    searchParams: { pais, estado },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "municipalities_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ items: response.data ?? [] });
}
