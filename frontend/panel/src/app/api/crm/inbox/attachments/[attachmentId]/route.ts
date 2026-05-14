import { NextRequest, NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { decodeJwtUserId } from "@/lib/auth/jwt"
import { resolvePanelApiToken } from "@/lib/auth/panel-token"
import { resolveServerAccessToken } from "@/lib/auth/server-session"
import { resolveOrganizacionId } from "@/lib/settings/org"

type RouteContext = {
  params: Promise<{ attachmentId: string }>
}

async function proxyAttachmentRequest(attachmentId: string) {
  let backendUrl: string
  let apiToken: string
  try {
    backendUrl = getPanelApiBaseUrl()
    apiToken = await resolvePanelApiToken()
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo resolver configuración del backend.",
      },
      { status: 500 },
    )
  }

  const userAccessToken = (await resolveServerAccessToken({ minTtlSeconds: 300 })) || ""
  const organizacionId = await resolveOrganizacionId()
  const usuarioId = decodeJwtUserId(userAccessToken || null)

  const headers: Record<string, string> = {
    Accept: "*/*",
    Authorization: `Bearer ${apiToken}`,
  }
  if (userAccessToken) {
    headers["X-User-Token"] = userAccessToken
  }
  if (organizacionId) {
    headers["X-Organizacion-Id"] = organizacionId
  }
  if (usuarioId) {
    headers["X-Usuario-Id"] = usuarioId
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(`${backendUrl}/crm/inbox/attachments/${encodeURIComponent(attachmentId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo conectar al backend.",
      },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  backendResponse.headers.forEach((value, key) => {
    responseHeaders.set(key, value)
  })
  responseHeaders.set("Cache-Control", responseHeaders.get("cache-control") ?? "private, no-store")

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const params = await context.params
  const attachmentId = typeof params?.attachmentId === "string" ? params.attachmentId.trim() : ""
  if (!attachmentId) {
    return NextResponse.json({ error: "attachment_required" }, { status: 400 })
  }
  return proxyAttachmentRequest(attachmentId)
}
