import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type RouteContext = { params: Promise<{ domainId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { domainId } = await context.params
  const tenantId = new URL(request.url).searchParams.get("tenant_id")
  const response = await callCrmApi(`/tenant/me/web-tracking/domains/${encodeURIComponent(domainId)}`, {
    method: "PATCH",
    organizacionId: tenantId,
    withUserToken: true,
    body: await request.json(),
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}

export async function POST(request: Request, context: RouteContext) {
  const { domainId } = await context.params
  const tenantId = new URL(request.url).searchParams.get("tenant_id")
  const response = await callCrmApi(`/tenant/me/web-tracking/domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
    organizacionId: tenantId,
    withUserToken: true,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}
