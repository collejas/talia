import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant_id")
  const response = await callCrmApi("/tenant/me/web-tracking", {
    organizacionId: tenantId,
    withUserToken: true,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}

export async function POST(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant_id")
  const body = await request.json()
  const response = await callCrmApi("/tenant/me/web-tracking/sites", {
    method: "POST",
    organizacionId: tenantId,
    withUserToken: true,
    body,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
