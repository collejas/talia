import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}))
  const response = await callCrmApi("/admin/roles/permissions/sync", {
    method: "POST",
    body: payload,
    organizacionId: null,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { detail: response.error },
      { status: response.status ?? 500 },
    )
  }

  return NextResponse.json(response.data)
}
