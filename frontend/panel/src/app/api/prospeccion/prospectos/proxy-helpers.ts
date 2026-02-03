import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"
import { resolveOrganizacionId } from "@/lib/settings/org"

export async function resolveProspeccionAccessToken(): Promise<string | null> {
  const store = await cookies()
  const cookieToken =
    store.get(ACCESS_TOKEN_COOKIE)?.value ||
    store.get("talia.access_token")?.value ||
    store.get("sb-access-token")?.value ||
    store.get("access_token")?.value
  if (cookieToken && cookieToken.trim().length) {
    return cookieToken.trim()
  }
  const fallback =
    process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_API_KEY
  return fallback?.trim().length ? fallback.trim() : null
}

function buildBackendUrl(request: Request, backendPath: string, forwardSearch: boolean): URL {
  const backendBase = getPanelApiBaseUrl()
  const target = new URL(`${backendBase}${backendPath}`)
  if (forwardSearch) {
    const source = new URL(request.url)
    source.searchParams.forEach((value, key) => {
      target.searchParams.append(key, value)
    })
  }
  return target
}

export async function proxyProspeccionRequest(
  request: Request,
  init: {
    method: "GET" | "POST" | "PATCH" | "DELETE"
    backendPath: string
    forwardSearch?: boolean
  }
): Promise<NextResponse> {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  let targetUrl: URL
  try {
    targetUrl = buildBackendUrl(request, init.backendPath, init.forwardSearch ?? true)
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const shouldSendBody = init.method !== "GET"
  const rawBody = shouldSendBody ? await request.text() : null
  const body = rawBody && rawBody.length ? rawBody : undefined
  const organizacionId = await resolveOrganizacionId()

  let backendResponse: Response
  try {
    backendResponse = await fetch(targetUrl, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
      },
      cache: "no-store",
      body,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const respText = await backendResponse.text()
  const contentType = backendResponse.headers.get("content-type") ?? "application/json"
  return new NextResponse(respText || null, {
    status: backendResponse.status,
    headers: {
      "content-type": contentType,
    },
  })
}

export async function proxyProspeccionStreamingRequest(backendPath: string): Promise<NextResponse> {
  const token = await resolveProspeccionAccessToken()
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }
  const backendBase = getPanelApiBaseUrl()
  const target = new URL(`${backendBase}${backendPath}`)
  const organizacionId = await resolveOrganizacionId()
  const backendResponse = await fetch(target, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
      ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
    },
    cache: "no-store",
  })
  const headers = new Headers()
  backendResponse.headers.forEach((value, key) => {
    headers.set(key, value)
  })
  headers.set("Cache-Control", headers.get("cache-control") ?? "no-cache")
  headers.set("Content-Type", "text/event-stream")
  headers.set("Connection", "keep-alive")
  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers,
  })
}
