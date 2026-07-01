export const MASTER_TENANT_ID = "00000000-0000-0000-0000-000000000001"

export const MASTER_ONLY_PATHS = [
  "/propuesta",
  "/propuesta-ejecutiva",
  "/visitas",
  "/vista-2",
  "/prospeccion/google-trends",
  "/prospeccion/mensajes",
] as const

export function isMasterTenantId(value: string | null | undefined): boolean {
  return value?.trim() === MASTER_TENANT_ID
}

export function isMasterOnlyPath(pathname: string): boolean {
  return MASTER_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}
