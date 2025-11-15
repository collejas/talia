import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { AgendaActionResponse, callPanelAgendaEndpoint } from "@/lib/agenda/data"

export async function POST(request: NextRequest, context: { params: Promise<{ bookingId: string }> }) {
  const params = await context.params
  const bookingId = params?.bookingId
  if (!bookingId) {
    return NextResponse.json({ error: "booking_id_required" }, { status: 400 })
  }

  let payload: { reason?: string }
  try {
    payload = (await request.json()) as { reason?: string }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<AgendaActionResponse>(
      `/panel/agenda/bookings/${bookingId}/cancel`,
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: payload.reason }),
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "cancel_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
