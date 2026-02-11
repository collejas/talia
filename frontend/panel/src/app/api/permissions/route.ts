import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/crm/me/permissions")
  if (response.ok) {
    return NextResponse.json(response.data ?? {})
  }
  return NextResponse.json(
    { error: response.error || "permissions_fetch_failed" },
    { status: response.status ?? 500 },
  )
}
