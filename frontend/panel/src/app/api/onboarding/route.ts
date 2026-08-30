import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/tenant/me/onboarding", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const response = await callCrmApi("/tenant/me/onboarding", {
    method: "PATCH",
    organizacionId: null,
    withUserToken: true,
    body,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}
