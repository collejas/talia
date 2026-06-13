import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const response = await callCrmApi<unknown[]>("/crm/compras/ordenes", {
    searchParams: {
      solo_abiertas: searchParams.get("solo_abiertas") ?? "true",
      lite: searchParams.get("lite") ?? "false",
      offset: searchParams.get("offset") ?? "0",
      limit: searchParams.get("limit") ?? "100",
      search: searchParams.get("search") ?? undefined,
    },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "ordenes_unavailable" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data ?? [])
}
