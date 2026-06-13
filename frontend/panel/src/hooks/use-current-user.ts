"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { SessionPayload, SupabaseUser, TenantInfo } from "@/lib/auth/session"

type UseCurrentUserState = {
  user: SupabaseUser | null
  tenant: TenantInfo | null
  employeePosition: string | null
  isPlatformAdmin: boolean
  profilingEnabled: boolean
  featureFlags: SessionPayload["featureFlags"] | null
  loading: boolean
  error: string | null
}

async function fetchSessionPayload(): Promise<SessionPayload> {
  const response = await fetch("/api/session", {
    method: "GET",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  })
  if (response.status === 401) {
    throw new Error("auth_required")
  }
  if (!response.ok) {
    throw new Error(`auth_error_${response.status}`)
  }
  return (await response.json()) as SessionPayload
}

export function useCurrentUser() {
  const router = useRouter()
  const [state, setState] = useState<UseCurrentUserState>({
    user: null,
    tenant: null,
    employeePosition: null,
    isPlatformAdmin: false,
    profilingEnabled: true,
    featureFlags: null,
    loading: true,
    error: null,
  })
  const redirectedRef = useRef(false)

  const resolveAuthErrorState = useCallback(
    (error: unknown): Omit<UseCurrentUserState, "loading"> => {
      if ((error as Error).message === "auth_required") {
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
        return {
          user: null,
          tenant: null,
          employeePosition: null,
          isPlatformAdmin: false,
          profilingEnabled: true,
          featureFlags: null,
          error: "auth_required",
        }
      }
      if ((error as Error).message.startsWith("auth_error_")) {
        return {
          user: null,
          tenant: null,
          employeePosition: null,
          isPlatformAdmin: false,
          profilingEnabled: true,
          featureFlags: null,
          error: (error as Error).message,
        }
      }
      console.error("[auth] error fetching current user", error)
      return {
        user: null,
        tenant: null,
        employeePosition: null,
        isPlatformAdmin: false,
        profilingEnabled: true,
        featureFlags: null,
        error: "auth_network_error",
      }
    },
    [router],
  )

  const fetchSession = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const data = await fetchSessionPayload()
      setState({
        user: data.user ?? null,
        tenant: data.tenant ?? null,
        employeePosition: data.employeePosition ?? null,
        isPlatformAdmin: Boolean(data.isPlatformAdmin),
        profilingEnabled: data.profilingEnabled ?? true,
        featureFlags: data.featureFlags ?? null,
        loading: false,
        error: data.user ? null : "auth_invalid_payload",
      })
    } catch (error) {
      setState({
        ...resolveAuthErrorState(error),
        loading: false,
      })
    }
  }, [resolveAuthErrorState])

  useEffect(() => {
    let mounted = true
    void fetchSessionPayload()
      .then((data) => {
        if (!mounted) return
        setState({
          user: data.user ?? null,
          tenant: data.tenant ?? null,
          employeePosition: data.employeePosition ?? null,
          isPlatformAdmin: Boolean(data.isPlatformAdmin),
          profilingEnabled: data.profilingEnabled ?? true,
          featureFlags: data.featureFlags ?? null,
          loading: false,
          error: data.user ? null : "auth_invalid_payload",
        })
      })
      .catch((error) => {
        if (!mounted) return
        setState({
          ...resolveAuthErrorState(error),
          loading: false,
        })
      })

    return () => {
      mounted = false
    }
  }, [resolveAuthErrorState])

  const refresh = async () => {
    await fetchSession()
  }

  return { ...state, refresh }
}
