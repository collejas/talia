import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type RouteContext = { params: Promise<{ agenteId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { agenteId } = await context.params
  const response = await callCrmApi(`/crm/inmobiliaria/agentes-externos/${encodeURIComponent(agenteId)}`, {
    method: "PATCH",
    body: await request.json().catch(() => ({})),
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? {})
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { agenteId } = await context.params
  const response = await callCrmApi(`/crm/inmobiliaria/agentes-externos/${encodeURIComponent(agenteId)}`, {
    method: "DELETE",
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? { ok: true })
}
