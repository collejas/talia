import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callPanelAgendaEndpoint } from "@/lib/agenda/data"

export async function PATCH(request: NextRequest, context: { params: Promise<{ exceptionId: string }> }) {
  const params = await context.params
  const exceptionId = params?.exceptionId
  if (!exceptionId) {
    return NextResponse.json({ error: "exception_id_required" }, { status: 400 })
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<{ ok: boolean; exception: unknown }>(
      `/agenda/disponibilidad/exceptions/${exceptionId}`,
      {},
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_exception_update_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ exceptionId: string }> }) {
  const params = await context.params
  const exceptionId = params?.exceptionId
  if (!exceptionId) {
    return NextResponse.json({ error: "exception_id_required" }, { status: 400 })
  }

  try {
    const data = await callPanelAgendaEndpoint<{ ok: boolean }>(
      `/agenda/disponibilidad/exceptions/${exceptionId}`,
      {},
      {
        method: "DELETE",
      },
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "availability_exception_delete_failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
