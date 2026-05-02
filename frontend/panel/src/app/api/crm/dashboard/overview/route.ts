import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const params: Record<string, string> = {}

  const rango = searchParams.get("rango") ?? undefined
  const desde = searchParams.get("desde") ?? undefined
  const hasta = searchParams.get("hasta") ?? undefined

  if (rango) params.rango = rango
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta

  const response = await callCrmApi("/crm/dashboard/overview", {
    searchParams: params,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: response.error,
        overview: null,
        errors: { dashboard: response.error },
      },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
