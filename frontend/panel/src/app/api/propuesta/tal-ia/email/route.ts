import { NextRequest, NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveProspeccionAccessToken } from "@/app/api/prospeccion/prospectos/proxy-helpers"

function cloneHeaders(source: Headers): Headers {
  const clone = new Headers()
  for (const [key, value] of source.entries()) {
    clone.set(key, value)
  }
  return clone
}

export async function POST(request: NextRequest) {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const backendUrl = new URL(`${getPanelApiBaseUrl()}/propuesta/tal-ia/email`)
  const headers = cloneHeaders(request.headers)
  headers.set("Authorization", `Bearer ${token}`)
  headers.set("Accept", "application/json")

  const bodyText = await request.text()
  const backendResponse = await fetch(backendUrl, {
    method: "POST",
    headers,
    body: bodyText.length ? bodyText : undefined,
  })

  const responseHeaders = new Headers()
  backendResponse.headers.forEach((value, key) => responseHeaders.set(key, value))
  responseHeaders.set("cache-control", responseHeaders.get("cache-control") ?? "no-cache")
  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  })
}
