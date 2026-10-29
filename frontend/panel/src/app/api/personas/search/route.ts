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
  const soloConOportunidad = request.nextUrl.searchParams.get("solo_con_oportunidad");
  const dominioComercial = request.nextUrl.searchParams.get("dominio_comercial");

  const searchParams: Record<string, string> = { q, limit, offset };
  if (soloConOportunidad) searchParams.solo_con_oportunidad = soloConOportunidad;
  if (dominioComercial) searchParams.dominio_comercial = dominioComercial;

  const response = await callCrmApi<SearchResponse>("/crm/personas/search", {
    searchParams,
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
