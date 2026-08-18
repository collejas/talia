import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type Context = { params: Promise<{ layoutId: string }> }

export async function PUT(request: Request, context: Context) {
  const { layoutId } = await context.params
  const body = await request.json()
  const response = await callCrmApi(`/tenant/me/prospeccion-template-ai-layouts/${encodeURIComponent(layoutId)}`, {
    method: "PUT",
    organizacionId: null,
    withUserToken: true,
    body,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  return NextResponse.json(response.data)
}

export async function DELETE(_request: Request, context: Context) {
  const { layoutId } = await context.params
  const response = await callCrmApi(`/tenant/me/prospeccion-template-ai-layouts/${encodeURIComponent(layoutId)}`, {
    method: "DELETE",
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  return new NextResponse(null, { status: 204 })
}
