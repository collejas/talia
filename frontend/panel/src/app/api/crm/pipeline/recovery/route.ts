import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

const ALLOWED_PARAMS = [
  "limit",
  "offset",
  "asignado_id",
  "estado_seguimiento",
  "temperatura",
  "estrategia_seguimiento",
  "q",
] as const

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const params: Record<string, string> = {}

  for (const key of ALLOWED_PARAMS) {
    const value = searchParams.get(key)
    if (value) params[key] = value
  }

  const response = await callCrmApi("/crm/pipeline/recovery", {
    searchParams: params,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
