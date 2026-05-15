import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type SearchItem = {
  id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
};

type SearchResponse = {
  items: SearchItem[];
  limit: number;
  offset: number;
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = request.nextUrl.searchParams.get("limit") ?? "20";
  const offset = request.nextUrl.searchParams.get("offset") ?? "0";

  const response = await callCrmApi<SearchResponse>("/crm/personas/search", {
    searchParams: { q, limit, offset },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "personas_search_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
