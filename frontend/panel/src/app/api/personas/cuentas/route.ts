import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type CRMAccount = {
  id: string;
  nombre: string;
  alias: string | null;
  tipo: string | null;
  telefono: string | null;
  correo: string | null;
};

type CRMAccountsResponse = {
  items: CRMAccount[];
  limit: number;
  offset: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const query = normalize(request.nextUrl.searchParams.get("q") ?? "");
  const result = await callCrmApi<CRMAccountsResponse>("/crm/cuentas", {
    searchParams: { limit: "200", offset: "0" },
    withUserToken: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "accounts_search_failed" },
      { status: result.status ?? 502 },
    );
  }

  const items = (result.data.items ?? [])
    .filter((account) => {
      if (!query) return true;
      const haystack = [
        account.nombre,
        account.alias ?? "",
        account.tipo ?? "",
        account.correo ?? "",
        account.telefono ?? "",
      ]
        .map((value) => normalize(value))
        .join(" ");
      return haystack.includes(query);
    })
    .slice(0, 20)
    .map((account) => ({
      id: account.id,
      nombre: account.nombre,
      alias: account.alias,
      tipo: account.tipo,
      correo: account.correo,
      telefono: account.telefono,
    }));

  return NextResponse.json({ items });
}
