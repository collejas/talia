import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET() {
  const response = await callCrmApi<{ items?: Array<{ id?: string; nombre?: string | null }> }>("/admin/tenants", {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron cargar los tenants." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json({ items: Array.isArray(response.data?.items) ? response.data.items : [] });
}
