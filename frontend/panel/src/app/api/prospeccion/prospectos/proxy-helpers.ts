import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolveServerAccessToken } from "@/lib/auth/server-session"
import { resolveOrganizacionId } from "@/lib/settings/org"

export async function resolveProspeccionAccessToken(): Promise<string | null> {
  const cookieToken = await resolveServerAccessToken({ minTtlSeconds: 300 })
  if (cookieToken && cookieToken.trim().length) {
    return cookieToken.trim()
  }
  return null
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
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
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
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
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
