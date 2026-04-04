"use client"

import { useCallback, useEffect, useState } from "react"

type TenantContextState = {
  tenantId: string | null
  tenantName: string | null
  loading: boolean
}

export function useTenantContext(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const [state, setState] = useState<TenantContextState>({
    tenantId: null,
    tenantName: null,
    loading: enabled,
  })

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ tenantId: null, tenantName: null, loading: false })
      return
    }

    try {
      const response = await fetch("/api/platform-admin/tenant-context", { cache: "no-store" })
      if (!response.ok) {
        setState({ tenantId: null, tenantName: null, loading: false })
        return
      }
      const data = (await response.json()) as {
        tenant_id?: string | null
        tenant_name?: string | null
      }
      setState({
        tenantId: typeof data.tenant_id === "string" ? data.tenant_id : null,
        tenantName: typeof data.tenant_name === "string" ? data.tenant_name : null,
        loading: false,
      })
    } catch {
      setState({ tenantId: null, tenantName: null, loading: false })
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let mounted = true
    void fetch("/api/platform-admin/tenant-context", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (!mounted) return
          setState({ tenantId: null, tenantName: null, loading: false })
          return
        }
        const data = (await response.json()) as {
          tenant_id?: string | null
          tenant_name?: string | null
        }
        if (!mounted) return
        setState({
          tenantId: typeof data.tenant_id === "string" ? data.tenant_id : null,
          tenantName: typeof data.tenant_name === "string" ? data.tenant_name : null,
          loading: false,
        })
      })
      .catch(() => {
        if (!mounted) return
        setState({ tenantId: null, tenantName: null, loading: false })
      })

    return () => {
      mounted = false
    }
  }, [enabled])

  if (!enabled) {
    return {
      tenantId: null,
      tenantName: null,
      loading: false,
      refresh,
    }
  }

  return { ...state, refresh }
}
