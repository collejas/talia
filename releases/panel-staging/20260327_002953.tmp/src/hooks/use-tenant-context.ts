"use client"

import { useCallback, useEffect, useState } from "react"

type TenantContextState = {
  tenantId: string | null
  tenantName: string | null
  loading: boolean
}

export function useTenantContext() {
  const [state, setState] = useState<TenantContextState>({
    tenantId: null,
    tenantName: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
