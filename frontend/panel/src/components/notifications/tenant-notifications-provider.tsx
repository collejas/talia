"use client"

import { useEffect, useState, type ReactNode } from "react"

import { GlobalNotificationsProvider } from "@/components/notifications/global-notifications-provider"
import { setActiveTimeZone, resolveEffectiveTimeZone } from "@/lib/timezone"

type TenantNotificationsProviderProps = {
  children: ReactNode
}

type SessionResponse = {
  organizacion_id?: string | null
  userTimezone?: string | null
  tenantTimezone?: string | null
  effectiveTimezone?: string | null
  tenantConfig?: Record<string, unknown> | null
}

export function TenantNotificationsProvider({ children }: TenantNotificationsProviderProps) {
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const controller = new AbortController()

    const loadTenantId = async () => {
      try {
        const response = await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        if (!response.ok) {
          setActiveTimeZone(null)
          return
        }
        const payload = (await response.json()) as SessionResponse
        const nextTenantId = typeof payload.organizacion_id === "string" ? payload.organizacion_id.trim() : ""
        setTenantId(nextTenantId || null)
        const tenantTimezone =
          typeof payload.tenantTimezone === "string" && payload.tenantTimezone.trim()
            ? payload.tenantTimezone.trim()
            : extractTenantTimezone(payload.tenantConfig)
        const resolved = resolveEffectiveTimeZone(
          payload.userTimezone ?? null,
          tenantTimezone,
          payload.effectiveTimezone ?? null,
        )
        setActiveTimeZone(resolved.timeZone)
      } catch {
        if (controller.signal.aborted) {
          return
        }
        // Si la sesión todavía no está lista, el provider sigue funcionando con tenant null.
        setTenantId(null)
        setActiveTimeZone(null)
      }
    }

    void loadTenantId()

    return () => controller.abort()
  }, [])

  return <GlobalNotificationsProvider tenantId={tenantId}>{children}</GlobalNotificationsProvider>
}

function extractTenantTimezone(config?: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null
  }
  const webchat = config.webchat
  if (!webchat || typeof webchat !== "object" || Array.isArray(webchat)) {
    return null
  }
  const calendar = (webchat as Record<string, unknown>).calendar
  if (!calendar || typeof calendar !== "object" || Array.isArray(calendar)) {
    return null
  }
  const timezone = (calendar as Record<string, unknown>).timezone
  return typeof timezone === "string" && timezone.trim() ? timezone.trim() : null
}
