import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const body = await request.json()
  const response = await callCrmApi("/tenant/me/settings", {
    method: "PUT",
    organizacionId: null,
    withUserToken: true,
    body,
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }

  return NextResponse.json(response.data)
}
