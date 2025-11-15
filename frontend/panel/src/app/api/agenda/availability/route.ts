import { NextResponse } from "next/server"

import {
  AgendaAvailabilityResponse,
  callPanelAgendaEndpoint,
} from "@/lib/agenda/data"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams.entries())
  try {
    const data = await callPanelAgendaEndpoint<AgendaAvailabilityResponse>(
      "/panel/agenda/availability",
      params,
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
