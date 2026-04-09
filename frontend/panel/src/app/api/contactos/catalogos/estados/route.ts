import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pais = (url.searchParams.get("pais") || "MX").trim().toUpperCase();

  const response = await callCrmApi("/crm/contactos/catalogos/estados", {
    withUserToken: true,
    searchParams: { pais },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "states_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ items: response.data ?? [] });
}
