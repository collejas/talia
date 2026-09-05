import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/crm/pipeline/recovery/configuration", { withUserToken: true })
  if (!response.ok) return NextResponse.json({ ok: false, error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data)
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  const response = await callCrmApi("/crm/pipeline/recovery/configuration", {
    method: "PUT",
    body,
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ ok: false, error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data)
}
