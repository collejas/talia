"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { SessionPayload, SupabaseUser, TenantInfo } from "@/lib/auth/session"

type UseCurrentUserState = {
  user: SupabaseUser | null
  tenant: TenantInfo | null
  employeePosition: string | null
  loading: boolean
  error: string | null
}

export function useCurrentUser() {
  const router = useRouter()
  const [state, setState] = useState<UseCurrentUserState>({
    user: null,
    tenant: null,
    employeePosition: null,
    loading: true,
    error: null,
  })
  const redirectedRef = useRef(false)

  async function fetchSession(signal?: AbortSignal) {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const response = await fetch("/api/session", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal,
      })

      if (response.status === 401) {
        if (!redirectedRef.current) {
          redirectedRef.current = true
          if (typeof window !== "undefined") {
            const currentPath = `${window.location.pathname}${window.location.search || ""}`
            const redirectParam = currentPath ? `?redirectTo=${encodeURIComponent(currentPath)}` : ""
            router.replace(`/auth/login${redirectParam}`)
          } else {
            router.replace("/auth/login")
          }
        }
        setState({ user: null, tenant: null, employeePosition: null, loading: false, error: "auth_required" })
        return
      }

      if (!response.ok) {
        const message = `auth_error_${response.status}`
        setState({ user: null, tenant: null, employeePosition: null, loading: false, error: message })
        return
      }

      const data = (await response.json()) as SessionPayload
      setState({
        user: data.user ?? null,
        tenant: data.tenant ?? null,
        employeePosition: data.employeePosition ?? null,
        loading: false,
        error: data.user ? null : "auth_invalid_payload",
      })
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      console.error("[auth] error fetching current user", error)
      setState({ user: null, tenant: null, employeePosition: null, loading: false, error: "auth_network_error" })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchSession(controller.signal)
    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async () => {
    await fetchSession()
  }

  return { ...state, refresh }
}
