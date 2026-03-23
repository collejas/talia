import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"
import { AgendaActionResponse } from "@/lib/agenda/data"

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

  const response = await callCrmApi<AgendaActionResponse>(`/crm/agenda/bookings/${bookingId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { reason: payload.reason },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "cancel_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
