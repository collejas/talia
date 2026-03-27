import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { AgendaActionResponse, callPanelAgendaEndpoint } from "@/lib/agenda/data"

export async function POST(request: NextRequest, context: { params: Promise<{ bookingId: string }> }) {
  const params = await context.params
  const bookingId = params?.bookingId
  if (!bookingId) {
    return NextResponse.json({ error: "booking_id_required" }, { status: 400 })
  }

  let payload: { startAt?: string; notes?: string }
  try {
    payload = (await request.json()) as { startAt?: string; notes?: string }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  if (!payload.startAt) {
    return NextResponse.json({ error: "start_at_required" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<AgendaActionResponse>(
      `/agenda/bookings/${bookingId}/reschedule`,
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_at: payload.startAt, notes: payload.notes }),
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "reschedule_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
