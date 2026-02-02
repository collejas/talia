import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function DELETE(request: NextRequest, context: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await context.params
  if (!routeId) {
    return NextResponse.json({ error: "routeId faltante." }, { status: 400 })
  }

  const response = await callCrmApi(`/tenant/me/routes/${encodeURIComponent(routeId)}`, {
    method: "DELETE",
    organizacionId: null,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }

  return NextResponse.json({ ok: true })
}
