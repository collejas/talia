"use client"

import { useEffect, useState, type ReactNode } from "react"

import { GlobalNotificationsProvider } from "@/components/notifications/global-notifications-provider"

type TenantNotificationsProviderProps = {
  children: ReactNode
}

type SessionResponse = {
  organizacion_id?: string | null
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
          return
        }
        const payload = (await response.json()) as SessionResponse
        const nextTenantId = typeof payload.organizacion_id === "string" ? payload.organizacion_id.trim() : ""
        setTenantId(nextTenantId || null)
      } catch {
        if (controller.signal.aborted) {
          return
        }
        // Si la sesión todavía no está lista, el provider sigue funcionando con tenant null.
        setTenantId(null)
      }
    }

    void loadTenantId()

    return () => controller.abort()
  }, [])

  return <GlobalNotificationsProvider tenantId={tenantId}>{children}</GlobalNotificationsProvider>
}
