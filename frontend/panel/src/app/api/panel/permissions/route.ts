import { NextResponse } from "next/server"

import { callPanelAgendaEndpoint } from "@/lib/agenda/data"

type PermissionsResponse = {
  ok: boolean
  roles: string[]
}

export async function GET() {
  try {
    const data = await callPanelAgendaEndpoint<PermissionsResponse>("/auth/permisos")
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "permissions_failed"
    return NextResponse.json({ ok: false, roles: [], error: message }, { status: 502 })
  }
}
