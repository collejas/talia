"use client"

import { useEffect, useRef, useState } from "react"

export type PermissionContext = {
  usuario_id?: string
  organizacion_id?: string
  roles: string[]
  permisos: string[]
  es_admin: boolean
  es_owner: boolean
}

type UsePermissionsState = {
  context: PermissionContext
  loading: boolean
  error: string | null
}

const EMPTY_CONTEXT: PermissionContext = {
  roles: [],
  permisos: [],
  es_admin: false,
  es_owner: false,
}

export function usePermissions() {
  const [state, setState] = useState<UsePermissionsState>({
    context: { ...EMPTY_CONTEXT },
    loading: true,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const fetchPermissions = async (options: { setLoading?: boolean } = {}) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (options.setLoading !== false) {
      setState((prev) => ({ ...prev, loading: true }))
    }
    try {
      const response = await fetch("/api/permissions", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      })

      if (!response.ok) {
        setState({ context: { ...EMPTY_CONTEXT }, loading: false, error: `perm_error_${response.status}` })
        return
      }

      const data = (await response.json()) as Partial<PermissionContext>
      setState({
        context: {
          ...EMPTY_CONTEXT,
          ...data,
          roles: Array.isArray(data.roles) ? data.roles : [],
          permisos: Array.isArray(data.permisos) ? data.permisos : [],
          es_admin: Boolean(data.es_admin),
          es_owner: Boolean(data.es_owner),
        },
        loading: false,
        error: null,
      })
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      console.error("[auth] error fetching permissions", error)
      setState({ context: { ...EMPTY_CONTEXT }, loading: false, error: "perm_network_error" })
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPermissions({ setLoading: false })
    return () => abortRef.current?.abort()
  }, [])

  return { ...state, refresh: fetchPermissions }
}
