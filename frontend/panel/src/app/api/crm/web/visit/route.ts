import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Tenant-Alias",
  "Access-Control-Max-Age": "86400",
}

function buildTargetUrl(request: Request): URL {
  let backendBase: string
  try {
    backendBase = getPanelApiBaseUrl()
  } catch {
    backendBase = process.env.PANEL_API_FALLBACK_URL?.trim() || "http://127.0.0.1:8004"
  }
  const target = new URL(`${backendBase}/crm/web/visit`)
  const source = new URL(request.url)
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value)
  })
  return target
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export async function POST(request: Request) {
  let targetUrl: URL
  try {
    targetUrl = buildTargetUrl(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const rawBody = await request.text()
  const contentType = request.headers.get("content-type") || "application/json"

  let backendResponse: Response
  try {
    backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": contentType,
        "User-Agent": request.headers.get("user-agent") || "talia-panel-proxy",
        ...(request.headers.get("x-forwarded-for")
          ? { "X-Forwarded-For": request.headers.get("x-forwarded-for") as string }
          : {}),
        ...(request.headers.get("x-real-ip")
          ? { "X-Real-IP": request.headers.get("x-real-ip") as string }
          : {}),
        ...(request.headers.get("x-forwarded-proto")
          ? { "X-Forwarded-Proto": request.headers.get("x-forwarded-proto") as string }
          : {}),
        ...(request.headers.get("referer")
          ? { Referer: request.headers.get("referer") as string }
          : {}),
        ...(request.headers.get("x-tenant-alias")
          ? { "X-Tenant-Alias": request.headers.get("x-tenant-alias") as string }
          : {}),
      },
      cache: "no-store",
      body: rawBody,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (backendResponse.status === 204) {
    return new NextResponse(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  const responseText = await backendResponse.text()
  return new NextResponse(responseText || null, {
    status: backendResponse.status,
    headers: {
      ...CORS_HEADERS,
      "content-type": backendResponse.headers.get("content-type") || "application/json",
    },
  })
}
