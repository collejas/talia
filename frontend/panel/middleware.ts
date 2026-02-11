import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"

const DASHBOARD_PREFIX = "/dashboard"
const LOGIN_PATH = "/auth/login"
const UNAUTHORIZED_PATH = "/unauthorized"

type PermissionRule = {
  prefix: string
  permission: string | string[]
}

const PERMISSION_RULES: PermissionRule[] = [
  { prefix: "/settings/usuarios/roles", permission: "role.manage" },
  { prefix: "/settings/usuarios/permisos", permission: "role.manage" },
  { prefix: "/settings/usuarios", permission: "user.manage" },
  { prefix: "/settings/empleados/departamentos", permission: "user.manage" },
  { prefix: "/settings/empleados/puestos", permission: "user.manage" },
  { prefix: "/settings/empleados", permission: "user.manage" },
  { prefix: "/settings/variables", permission: "settings.manage" },
  { prefix: "/settings/catalogo", permission: "settings.manage" },
  { prefix: "/settings/productos", permission: "settings.manage" },
  { prefix: "/settings/propiedades", permission: "settings.manage" },
  { prefix: "/settings/email", permission: "settings.manage" },
  { prefix: "/settings/formato-cotizacion", permission: "settings.manage" },
  { prefix: "/settings/reminders", permission: "settings.manage" },
  { prefix: "/settings/prospeccion", permission: "settings.manage" },
  { prefix: "/settings/tenants", permission: "settings.manage" },
  { prefix: "/settings", permission: ["settings.view", "settings.manage"] },
  { prefix: "/crm/whatsapp/asignaciones", permission: "conv.assign" },
  { prefix: "/crm/tickets", permission: "tickets.view" },
  { prefix: "/crm/campanas", permission: "campaigns.view" },
  { prefix: "/crm/actividades", permission: "activities.view" },
  { prefix: "/crm/notas", permission: "notes.view" },
  { prefix: "/crm/oportunidades", permission: "pipeline.view" },
  { prefix: "/crm/leads", permission: "leads.view" },
  { prefix: "/crm", permission: "conv.read" },
  { prefix: "/prospeccion/google-busqueda", permission: "ver_busquedas_google" },
  { prefix: "/prospeccion/denue-busqueda", permission: "ver_busquedas_inegi" },
  { prefix: "/prospeccion/buscador", permission: "ejecutar_busquedas" },
  { prefix: "/prospeccion/prospectos", permission: "ejecutar_busquedas" },
  { prefix: "/prospeccion/contactos", permission: "contacts.read" },
  { prefix: "/prospeccion/mensajes", permission: "messages.read" },
  { prefix: "/prospeccion/campanas", permission: "campaigns.view" },
  { prefix: "/prospeccion", permission: "ejecutar_busquedas" },
  { prefix: "/mapa-de-conversion", permission: "reports.view" },
  { prefix: "/visitas", permission: "reports.view" },
  { prefix: "/vista-2", permission: "reports.view" },
  { prefix: "/propuesta", permission: "propuesta.view" },
  { prefix: "/agenda", permission: "agenda.view" },
  { prefix: "/inbox", permission: "ver_inbox" },
  { prefix: "/embudo", permission: "pipeline.view" },
  { prefix: "/oportunidades", permission: "pipeline.view" },
  { prefix: "/propiedades", permission: "propiedades.view" },
  { prefix: "/leads", permission: "leads.view" },
  { prefix: "/contactos", permission: "contacts.read" },
  { prefix: "/clientes", permission: "clientes.view" },
  { prefix: "/dashboard", permission: "ver_panel" },
]

function buildRedirectUrl(request: NextRequest, pathname: string) {
  const url = new URL(LOGIN_PATH, request.url)
  const originalPath = pathname + request.nextUrl.search
  if (originalPath && originalPath !== LOGIN_PATH) {
    url.searchParams.set("redirectTo", originalPath)
  }
  return url
}

function resolvePermission(pathname: string): string | string[] | null {
  for (const rule of PERMISSION_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permission
    }
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value)

  const isDashboard = pathname.startsWith(DASHBOARD_PREFIX)
  const isLogin = pathname === LOGIN_PATH
  const isUnauthorized = pathname === UNAUTHORIZED_PATH

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next()
  }

  if (isDashboard && !hasSession) {
    const redirectUrl = buildRedirectUrl(request, pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (isLogin && hasSession) {
    const redirectUrl = new URL(DASHBOARD_PREFIX, request.url)
    return NextResponse.redirect(redirectUrl)
  }

  if (!hasSession || isLogin || isUnauthorized) {
    return NextResponse.next()
  }

  const required = resolvePermission(pathname)
  if (!required) {
    return NextResponse.next()
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value

    if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
      return NextResponse.redirect(new URL(UNAUTHORIZED_PATH, request.url))
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/mi_contexto_permisos`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    })

    if (!response.ok) {
      return NextResponse.redirect(new URL(UNAUTHORIZED_PATH, request.url))
    }

    const payload = (await response.json()) as
      | { permisos?: string[]; es_admin?: boolean }
      | Array<{ permisos?: string[]; es_admin?: boolean }>

    const data = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {}
    if (data?.es_admin) {
      return NextResponse.next()
    }
    const permisos = new Set((data?.permisos ?? []).map((perm) => perm.toLowerCase()))
    const requiredList = Array.isArray(required) ? required : [required]
    const allowed = requiredList.some((perm) => permisos.has(perm.toLowerCase()))
    if (!allowed) {
      return NextResponse.redirect(new URL(UNAUTHORIZED_PATH, request.url))
    }
  } catch {
    return NextResponse.redirect(new URL(UNAUTHORIZED_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|api|auth|portal|webchat-landing|privacy-policy|favicon.ico).*)",
  ],
}
