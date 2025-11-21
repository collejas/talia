import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"

function buildErrorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

async function resolveBackendContext() {
  const store = await cookies()
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value
  if (!accessToken) {
    return { error: buildErrorResponse("auth_required", 401) }
  }

  try {
    const baseUrl = getPanelApiBaseUrl()
    return { baseUrl, accessToken }
  } catch (error) {
    return {
      error: buildErrorResponse(
        error instanceof Error ? error.message : "backend_not_configured",
      ),
    }
  }
}

async function proxyResponse(response: Response, fallbackError: string) {
  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { error: text || fallbackError }
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" && payload && "error" in payload
        ? payload
        : { error: fallbackError }
    return NextResponse.json(errorPayload, { status: response.status })
  }

  return NextResponse.json(payload ?? { ok: true }, { status: response.status })
}

export async function GET() {
  const ctx = await resolveBackendContext()
  if ("error" in ctx) {
    return ctx.error
  }

  const response = await fetch(`${ctx.baseUrl}/settings/logos`, {
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    cache: "no-store",
  })

  return proxyResponse(response, "logos_fetch_failed")
}

export async function POST(request: Request) {
  const ctx = await resolveBackendContext()
  if ("error" in ctx) {
    return ctx.error
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return buildErrorResponse("file_required", 400)
  }

  const backendForm = new FormData()
  backendForm.append("file", file, file.name || "logo.png")
  const nombre = formData.get("nombre")
  const resolvedName =
    typeof nombre === "string" && nombre.trim().length ? nombre.trim() : file.name || "Logo"
  backendForm.append("nombre", resolvedName)
  const descripcion = formData.get("descripcion")
  if (typeof descripcion === "string" && descripcion.trim().length) {
    backendForm.append("descripcion", descripcion.trim())
  }

  const response = await fetch(`${ctx.baseUrl}/settings/logos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    body: backendForm,
    cache: "no-store",
  })

  return proxyResponse(response, "logo_upload_failed")
}
