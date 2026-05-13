import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"
import type { AgendaActionResponse } from "@/lib/agenda/data"

type BookingCreatePayload = {
  contacto_id?: string
  oportunidad_id?: string
  crear_oportunidad?: boolean
  start_at?: string
  notes?: string
  canal?: string
}

export async function POST(request: NextRequest) {
  let payload: BookingCreatePayload
  try {
    payload = (await request.json()) as BookingCreatePayload
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const contactoId = payload.contacto_id?.trim()
  const startAt = payload.start_at?.trim()
  const oportunidadId = payload.oportunidad_id?.trim()

  if (!contactoId) {
    return NextResponse.json({ error: "contacto_id_required" }, { status: 400 })
  }
  if (!startAt) {
    return NextResponse.json({ error: "start_at_required" }, { status: 400 })
  }

  const response = await callCrmApi<AgendaActionResponse>("/crm/agenda/bookings", {
    method: "POST",
    body: {
      contacto_id: contactoId,
      oportunidad_id: oportunidadId || undefined,
      crear_oportunidad: payload.crear_oportunidad ?? false,
      start_at: startAt,
      notes: payload.notes?.trim() || undefined,
      canal: payload.canal?.trim() || "manual",
    },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "booking_create_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
