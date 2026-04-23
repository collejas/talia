import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { callCrmApi } from "@/lib/api/crm"
import { COOKIE_BASE_OPTIONS, TENANT_CONTEXT_COOKIE } from "@/lib/auth/cookies"
import { decodeJwtUserId } from "@/lib/auth/jwt"
import { parseTenantContextCookie, serializeTenantContextCookie } from "@/lib/auth/tenant-context"
import { resolveServerAccessToken } from "@/lib/auth/server-session"

type TenantContextPayload = {
  tenant_id?: string
}

const UUID_V4ISH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clearTenantContextCookie(response: NextResponse) {
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: TENANT_CONTEXT_COOKIE,
    value: "",
    maxAge: 0,
  })
}

export async function GET() {
  const store = await cookies()
  const accessToken = await resolveServerAccessToken({ minTtlSeconds: 0 })
  const currentUserId = decodeJwtUserId(accessToken)
  const parsed = parseTenantContextCookie(store.get(TENANT_CONTEXT_COOKIE)?.value)
  if (!parsed || !currentUserId || parsed.user_id !== currentUserId) {
    const response = NextResponse.json({ tenant_id: null, tenant_name: null })
    clearTenantContextCookie(response)
    return response
  }

  const tenantId = parsed.tenant_id
  if (!tenantId) {
    return NextResponse.json({ tenant_id: null, tenant_name: null })
  }

  const adminCheck = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  })
  if (!adminCheck.ok || !adminCheck.data?.is_platform_admin) {
    const response = NextResponse.json({ tenant_id: null, tenant_name: null })
    clearTenantContextCookie(response)
    return response
  }

  const tenantCheck = await callCrmApi<{ tenant?: { nombre?: string | null } }>(`/admin/tenants/${tenantId}`, {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  })
  if (!tenantCheck.ok) {
    const response = NextResponse.json({ tenant_id: null, tenant_name: null })
    clearTenantContextCookie(response)
    return response
  }

  return NextResponse.json({
    tenant_id: tenantId,
    tenant_name: tenantCheck.data.tenant?.nombre ?? null,
  })
}

export async function PUT(request: Request) {
  let payload: TenantContextPayload
  try {
    payload = (await request.json()) as TenantContextPayload
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const tenantId = String(payload.tenant_id || "").trim()
  if (!tenantId || !UUID_V4ISH_RE.test(tenantId)) {
    return NextResponse.json({ error: "tenant_id_invalid" }, { status: 400 })
  }

  const adminCheck = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  })
  if (!adminCheck.ok || !adminCheck.data?.is_platform_admin) {
    return NextResponse.json({ error: "platform_admin_required" }, { status: 403 })
  }

  const accessToken = await resolveServerAccessToken({ minTtlSeconds: 0 })
  const currentUserId = decodeJwtUserId(accessToken)
  if (!currentUserId) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const tenantCheck = await callCrmApi<{ ok?: boolean }>(`/admin/tenants/${tenantId}`, {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  })
  if (!tenantCheck.ok) {
    return NextResponse.json({ error: tenantCheck.error || "tenant_not_found" }, { status: tenantCheck.status || 404 })
  }

  const response = NextResponse.json({ ok: true, tenant_id: tenantId })
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: TENANT_CONTEXT_COOKIE,
    value: serializeTenantContextCookie({ tenant_id: tenantId, user_id: currentUserId }),
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, tenant_id: null })
  clearTenantContextCookie(response)
  return response
}
