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

export type FeatureFlags = {
  webchatEnabled?: boolean
  whatsappEnabled?: boolean
  messengerEnabled?: boolean
  voiceEnabled?: boolean
  productosEnabled?: boolean
  propiedadesEnabled?: boolean
}

export type SessionPayload = {
  user: SupabaseUser
  tenant?: TenantInfo | null
  tenantConfig?: Record<string, unknown> | null
  organizacion_id?: string | null
  userTimezone?: string | null
  tenantTimezone?: string | null
  effectiveTimezone?: string | null
  timezoneSource?: "user" | "organization" | "default" | null
  employeePosition?: string | null
  isPlatformAdmin?: boolean
  profilingEnabled?: boolean
  featureFlags?: FeatureFlags
}
