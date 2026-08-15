import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/tenant/me/web-tracking", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const response = await callCrmApi("/tenant/me/web-tracking/sites", {
    method: "POST",
    organizacionId: null,
    withUserToken: true,
    body,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
