import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"
import { decodeJwtOrganizacionId, decodeJwtUserId } from "@/lib/auth/jwt"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 500 },
    )
  }

  const store = await cookies()
  const accessToken =
    store.get(ACCESS_TOKEN_COOKIE)?.value ||
    store.get("sb-access-token")?.value ||
    store.get("access_token")?.value

  if (!accessToken) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  const usuarioId = decodeJwtUserId(accessToken)
  const organizacionId = decodeJwtOrganizacionId(accessToken)

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/mi_contexto_permisos`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    return NextResponse.json(
      { error: text || "permissions_fetch_failed" },
      { status: response.status },
    )
  }

  const payload = (await response.json()) as
    | { permisos?: string[]; es_admin?: boolean; es_owner?: boolean }
    | Array<{ permisos?: string[]; es_admin?: boolean; es_owner?: boolean }>

  const data = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {}
  return NextResponse.json({
    ...data,
    usuario_id: usuarioId ?? undefined,
    organizacion_id: organizacionId ?? undefined,
  })
}
