export type TenantContextCookieValue = {
  tenant_id: string
  user_id: string
}

export function parseTenantContextCookie(value: string | null | undefined): TenantContextCookieValue | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<TenantContextCookieValue>
    const tenantId = typeof parsed.tenant_id === "string" ? parsed.tenant_id.trim() : ""
    const userId = typeof parsed.user_id === "string" ? parsed.user_id.trim() : ""
    if (!tenantId || !userId) return null
    return { tenant_id: tenantId, user_id: userId }
  } catch {
    return null
  }
}

export function serializeTenantContextCookie(value: TenantContextCookieValue): string {
  return JSON.stringify({
    tenant_id: value.tenant_id.trim(),
    user_id: value.user_id.trim(),
  })
}
