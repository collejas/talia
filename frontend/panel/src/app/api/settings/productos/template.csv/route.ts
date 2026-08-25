import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolvePanelApiToken } from "@/lib/auth/panel-token"
import { resolveOrganizacionId } from "@/lib/settings/org"

export async function GET() {
  const baseUrl = getPanelApiBaseUrl()
  const organizacionId = await resolveOrganizacionId()
  let token: string
  try {
    token = await resolvePanelApiToken()
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const response = await fetch(`${baseUrl}/crm/catalog/items/template`, {
    headers: {
      Accept: "text/csv",
      Authorization: `Bearer ${token}`,
      ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
    },
    cache: "no-store",
  })
  const buffer = await response.arrayBuffer()
  if (!response.ok) {
    const message = new TextDecoder().decode(buffer) || `Error ${response.status}`
    return NextResponse.json({ error: message }, { status: response.status })
  }

  const headers = new Headers()
  headers.set("Content-Type", "text/csv; charset=utf-8")
  headers.set("Content-Disposition", response.headers.get("Content-Disposition") ?? 'attachment; filename="productos_plantilla.csv"')
  return new NextResponse(buffer, { status: 200, headers })
}
