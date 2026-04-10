import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveServerAccessToken } from "@/lib/auth/server-session"
import { resolveOrganizacionId } from "@/lib/settings/org"

/**
 * Forward website verification requests for prospects to the backend API.
 */
export async function POST(request: Request) {
  const token = await resolveServerAccessToken({ minTtlSeconds: 300 })
  const organizacionId = await resolveOrganizacionId()

  if (!token || !token.trim().length) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  let target: URL
  try {
    const backendBase = getPanelApiBaseUrl()
    target = new URL(`${backendBase}/crm/prospeccion/prospectos/verificar-sitios-web`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  try {
    const backendResponse = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
        ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
      },
      cache: "no-store",
      body: await request.text(),
    })

    const text = await backendResponse.text()
    return new NextResponse(text || null, {
      status: backendResponse.status,
      headers: {
        "content-type": backendResponse.headers.get("content-type") ?? "application/json",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
