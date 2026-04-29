export type SupabaseUser = {
  id: string
  email: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
  [key: string]: unknown
}

export type TenantInfo = {
  nombre: string
  razon_social?: string | null
}

export type SessionPayload = {
  user: SupabaseUser
  tenant?: TenantInfo | null
  organizacion_id?: string | null
  employeePosition?: string | null
  isPlatformAdmin?: boolean
  profilingEnabled?: boolean
}
