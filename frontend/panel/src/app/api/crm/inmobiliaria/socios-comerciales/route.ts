import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: NextRequest) {
  const response = await callCrmApi(`/crm/inmobiliaria/socios-comerciales${request.nextUrl.search}`, { withUserToken: true })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? { items: [], total: 0 })
}

export async function POST(request: NextRequest) {
  const response = await callCrmApi("/crm/inmobiliaria/socios-comerciales", {
    method: "POST",
    body: await request.json().catch(() => ({})),
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? {}, { status: 201 })
}
