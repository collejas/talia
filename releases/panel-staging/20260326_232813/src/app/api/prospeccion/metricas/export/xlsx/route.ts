import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveOrganizacionId } from "@/lib/settings/org"
import { resolveProspeccionAccessToken } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET(request: Request) {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const sourceUrl = new URL(request.url)
  const backendUrl = new URL(`${getPanelApiBaseUrl()}/crm/prospeccion/metricas/export/xlsx`)
  sourceUrl.searchParams.forEach((value, key) => backendUrl.searchParams.append(key, value))
  const organizacionId = await resolveOrganizacionId()

  let backendResponse: Response
  try {
    backendResponse = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Authorization: `Bearer ${token}`,
        ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
      },
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const buffer = await backendResponse.arrayBuffer()
  if (!backendResponse.ok) {
    const message = new TextDecoder().decode(buffer) || `Error ${backendResponse.status}`
    return NextResponse.json({ error: message }, { status: backendResponse.status })
  }

  const headers = new Headers()
  headers.set(
    "Content-Type",
    backendResponse.headers.get("Content-Type")
      ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  headers.set(
    "Content-Disposition",
    backendResponse.headers.get("Content-Disposition")
      ?? 'attachment; filename="prospeccion_metricas.xlsx"',
  )
  return new NextResponse(buffer, { status: 200, headers })
}

