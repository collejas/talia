"use client"

import { useEffect, useState } from "react"

type PlatformAdminStatus = {
  isPlatformAdmin: boolean | null
  loading: boolean
}

type UsePlatformAdminStatusOptions = {
  enabled?: boolean
}

export function usePlatformAdminStatus(
  options: UsePlatformAdminStatusOptions = {},
): PlatformAdminStatus {
  const enabled = options.enabled ?? true
  const [status, setStatus] = useState<PlatformAdminStatus>({
    isPlatformAdmin: null,
    loading: enabled,
  })

  useEffect(() => {
    if (!enabled) {
      return
    }

    let mounted = true
    void fetch("/api/platform-admin/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return { is_platform_admin: false }
        }
        const data = (await response.json()) as {
          is_platform_admin?: boolean
        }
        return { is_platform_admin: !!data.is_platform_admin }
      })
      .then((payload) => {
        if (!mounted) return
        setStatus({ isPlatformAdmin: payload.is_platform_admin, loading: false })
      })
      .catch(() => {
        if (!mounted) return
        setStatus({ isPlatformAdmin: false, loading: false })
      })
    return () => {
      mounted = false
    }
  }, [enabled])

  if (!enabled) {
    return { isPlatformAdmin: null, loading: false }
  }

  return status
}
