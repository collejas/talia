import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type CatalogItemsResponse = {
  items: unknown[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "500";
  const includeInactive = searchParams.get("include_inactive");
  const search = searchParams.get("search");
  const tipo = searchParams.get("tipo");

  const response = await callCrmApi<unknown[]>("/crm/catalog/items", {
    searchParams: {
      limit,
      include_inactive: includeInactive === "true" ? "true" : undefined,
      search: search ?? undefined,
      tipo: tipo ?? undefined,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar el catálogo." },
      { status: response.status ?? 500 },
    );
  }

  const items = Array.isArray(response.data) ? response.data : [];
  const payload: CatalogItemsResponse = { items };
  return NextResponse.json(payload);
}
