import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type RouteContext = { params: Promise<{ siteId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { siteId } = await context.params
  const response = await callCrmApi(`/tenant/me/web-tracking/sites/${encodeURIComponent(siteId)}`, {
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

export async function POST(request: Request, context: RouteContext) {
  const { siteId } = await context.params
  const response = await callCrmApi(
    `/tenant/me/web-tracking/sites/${encodeURIComponent(siteId)}/domains`,
    {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: await request.json(),
    },
  )
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
