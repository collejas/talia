import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type RouteContext = { params: Promise<{ domainId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { domainId } = await context.params
  const response = await callCrmApi(`/tenant/me/web-tracking/domains/${encodeURIComponent(domainId)}`, {
    method: "PATCH",
    organizacionId: null,
    withUserToken: true,
    body: await request.json(),
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}
