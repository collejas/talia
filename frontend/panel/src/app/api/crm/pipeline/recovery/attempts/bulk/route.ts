import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const response = await callCrmApi("/crm/pipeline/recovery/attempts/bulk", {
    method: "POST",
    body,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status ?? 502 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
