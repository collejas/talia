import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callPanelAgendaEndpoint } from "@/lib/agenda/data"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams.entries())
  try {
    const data = await callPanelAgendaEndpoint<{ ok: boolean; items: unknown[] }>(
      "/agenda/disponibilidad/patterns",
      params,
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_patterns_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<{ ok: boolean; pattern: unknown }>(
      "/agenda/disponibilidad/patterns",
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_pattern_create_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
