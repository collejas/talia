"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

type TenantContextActionButtonProps = {
  tenantId: string
  tab: "brand" | "web-tracking"
  children: React.ReactNode
}

export function TenantContextActionButton({ tenantId, tab, children }: TenantContextActionButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
    try {
      const response = await fetch("/api/platform-admin/tenant-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || "No se pudo activar la organización seleccionada.")
      }

      window.location.assign(`/settings/variables?tab=${encodeURIComponent(tab)}`)
    } catch (error) {
      setLoading(false)
      window.alert(error instanceof Error ? error.message : "No se pudo activar la organización seleccionada.")
    }
  }

  return (
    <Button type="button" onClick={() => void handleClick()} disabled={loading}>
      {loading ? "Abriendo…" : children}
    </Button>
  )
}
