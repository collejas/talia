import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET() {
  const response = await callCrmApi("/crm/personas/catalogos/paises", {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "countries_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ items: response.data ?? [] });
}
