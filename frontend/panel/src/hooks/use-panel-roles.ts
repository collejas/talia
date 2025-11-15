"use client"

import { useEffect, useState } from "react"

type PanelRolesState = {
  roles: string[]
  loading: boolean
  error: string | null
}

export function usePanelRoles() {
  const [state, setState] = useState<PanelRolesState>({
    roles: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch("/api/panel/permissions", { cache: "no-store" })
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const data = (await response.json()) as { roles?: string[] }
        if (cancelled) return
        setState({ roles: data.roles ?? [], loading: false, error: null })
      } catch (error) {
        if (cancelled) return
        setState({
          roles: [],
          loading: false,
          error: error instanceof Error ? error.message : "permissions_failed",
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
