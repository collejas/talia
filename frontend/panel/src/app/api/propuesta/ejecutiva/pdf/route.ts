import { NextRequest, NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveProspeccionAccessToken } from "@/app/api/prospeccion/prospectos/proxy-helpers"

type ProxyOptions = {
  method: "GET" | "POST"
  body?: string
}

async function proxyPdfRequest({ method, body }: ProxyOptions) {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const backendUrl = new URL(`${getPanelApiBaseUrl()}/propuesta/ejecutiva/pdf`)
  const headers = new Headers()
  headers.set("Accept", "application/pdf")
  headers.set("Authorization", `Bearer ${token}`)
  if (method === "POST") {
    headers.set("Content-Type", "application/json")
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const responseHeaders = new Headers()
  backendResponse.headers.forEach((value, key) => responseHeaders.set(key, value))
  responseHeaders.set("cache-control", responseHeaders.get("cache-control") ?? "private, no-store")

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  })
}

export async function GET() {
  return proxyPdfRequest({ method: "GET" })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  return proxyPdfRequest({ method: "POST", body: body.length ? body : undefined })
}
