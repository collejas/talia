import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callPanelAgendaEndpoint } from "@/lib/agenda/data"

export async function PATCH(request: NextRequest, context: { params: Promise<{ resourceId: string }> }) {
  const params = await context.params
  const resourceId = params?.resourceId
  if (!resourceId) {
    return NextResponse.json({ error: "resource_id_required" }, { status: 400 })
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<{ ok: boolean; resource: unknown }>(
      `/agenda/disponibilidad/resources/${resourceId}`,
      {},
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_resource_update_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
