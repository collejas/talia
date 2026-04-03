import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const source = new URL(request.url)
  const searchParams: Record<string, string> = {}
  source.searchParams.forEach((value, key) => {
    searchParams[key] = value
  })

  const response = await callCrmApi("/crm/web/cta-events", {
    method: "GET",
    searchParams,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "cta_events_fetch_failed" },
      { status: response.status ?? 500 },
    )
  }

  return NextResponse.json(response.data ?? {})
}
