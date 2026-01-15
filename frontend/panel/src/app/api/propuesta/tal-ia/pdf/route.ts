import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveProspeccionAccessToken } from "@/app/api/prospeccion/prospectos/proxy-helpers"

export async function GET() {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const backendUrl = new URL(`${getPanelApiBaseUrl()}/propuesta/tal-ia/pdf`)
  let backendResponse: Response
  try {
    backendResponse = await fetch(backendUrl, {
      method: "GET",
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const headers = new Headers()
  backendResponse.headers.forEach((value, key) => headers.set(key, value))
  headers.set("cache-control", headers.get("cache-control") ?? "private, no-store")

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers,
  })
}
