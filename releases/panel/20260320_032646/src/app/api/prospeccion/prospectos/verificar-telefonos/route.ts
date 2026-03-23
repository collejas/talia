import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"

/**
 * Forward verification requests for prospect phone numbers to the backend API.
 */
export async function POST(request: Request) {
  const store = await cookies()
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value

  if (!token || !token.trim().length) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  let target: URL
  try {
    const backendBase = getPanelApiBaseUrl()
    target = new URL(`${backendBase}/crm/prospeccion/prospectos/verificar-telefonos`)
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
