import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = url.searchParams.get("limit") || "100"
  const response = await callCrmApi(`/crm/inmobiliaria/apartados/pendientes-validacion?limit=${encodeURIComponent(limit)}`, {
    withUserToken: true,
  })
  if (response.ok) return NextResponse.json(response.data, { status: 200 })
  return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
}
