"use server"

import { callCrmApi } from "@/lib/api/crm"

export type PermissionContext = {
  usuario_id?: string
  organizacion_id?: string
  roles?: string[]
  permisos?: string[]
  es_admin?: boolean
  es_owner?: boolean
}

const EMPTY_CONTEXT: PermissionContext = {
  roles: [],
  permisos: [],
  es_admin: false,
  es_owner: false,
}

export async function fetchPermissionContext(): Promise<PermissionContext> {
  const response = await callCrmApi<PermissionContext>("/crm/me/permissions")
  if (!response.ok) {
    console.warn("[auth] failed to load permissions", response.error)
    return { ...EMPTY_CONTEXT }
  }
  const data = response.data ?? {}
  return {
    ...EMPTY_CONTEXT,
    ...data,
    roles: Array.isArray(data.roles) ? data.roles : [],
    permisos: Array.isArray(data.permisos) ? data.permisos : [],
    es_admin: Boolean(data.es_admin),
    es_owner: Boolean(data.es_owner),
  }
}

export async function hasPermission(code: string): Promise<boolean> {
  const context = await fetchPermissionContext()
  if (context.es_admin || context.es_owner) return true
  const normalized = code.trim().toLowerCase()
  if (!normalized) return false
  const permisos = (context.permisos ?? []).map((perm) => perm.toLowerCase())
  return permisos.includes(normalized)
}

export async function requirePermission(code: string): Promise<void> {
  const allowed = await hasPermission(code)
  if (!allowed) {
    throw new Error("permiso_denegado")
  }
}
