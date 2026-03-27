"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { usePlatformAdminStatus } from "@/hooks/use-platform-admin-status"

type SyncResponse = {
  ok?: boolean
  skipped?: boolean
  reason?: string | null
  added?: number | null
  removed?: number | null
  detail?: string
}

export function RolePermissionsSyncButton() {
  const { isPlatformAdmin, loading } = usePlatformAdminStatus()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (loading || !isPlatformAdmin) {
    return null
  }

  function handleSync() {
    setMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch("/api/platform-admin/roles-permissions-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const payload = (await response.json()) as SyncResponse
        if (!response.ok) {
          setMessage(payload.detail || "No se pudo sincronizar la matriz.")
          return
        }
        if (payload.skipped) {
          setMessage("Sin cambios. La matriz ya estaba sincronizada.")
          return
        }
        const added = payload.added ?? 0
        const removed = payload.removed ?? 0
        setMessage(`Sincronización completa. +${added} / -${removed}.`)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo sincronizar la matriz.")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={handleSync} disabled={isPending}>
        {isPending ? "Sincronizando..." : "Sincronizar matriz"}
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  )
}
