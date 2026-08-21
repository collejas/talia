import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const response = await callCrmApi<unknown[]>("/crm/catalog/price-lists", {
    searchParams: {
      usable_only: searchParams.get("usable_only") === "true" ? "true" : undefined,
      include_inactive: "false",
    },
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron consultar las listas de precios." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json({ items: Array.isArray(response.data) ? response.data : [] });
}
