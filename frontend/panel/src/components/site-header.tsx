"use client"

import { useMemo } from "react"
import Image from 'next/image'

import { NotificationCenter } from "@/components/notifications/notification-center"
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useCurrentUser } from '@/hooks/use-current-user'

type SiteHeaderProps = {
  title?: string
}

export function SiteHeader({ title = "Panel" }: SiteHeaderProps) {
  const { user, tenant, loading } = useCurrentUser()

  const displayName = useMemo(() => {
    if (!user) {
      if (loading) return "Cargando usuario..."
      return null
    }
    const metadataName = resolveUserDisplayName(user.user_metadata, user.app_metadata)
    return metadataName || (user.email ? user.email.split("@")[0] || "Usuario" : "Usuario Tal-IA")
  }, [loading, user])

  const companyLabel = useMemo(() => {
    if (!tenant) return null
    const candidate = tenant.nombre?.trim() || tenant.razon_social?.trim()
    return candidate || null
  }, [tenant])

  return (
    <header className="sticky top-0 z-[1100] flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-sidebar">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <span className="text-base font-semibold text-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-3">
          <NotificationCenter />
          <Image
            src="/assets/logos/Logo8.png"
            alt="Tal-IA"
            width={32}
            height={32}
            className="rounded-lg border border-border/40 bg-surface-alt p-1"
          />
          <div className="flex flex-col items-end text-right">
            <span className="text-sm font-semibold leading-5 text-foreground">
              {loading ? "Usuario: Cargando..." : `Usuario: ${displayName || "Sin nombre"}`}
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              {loading
                ? "Empresa: Cargando..."
                : `Empresa: ${companyLabel || "Sin empresa"}`}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

function resolveUserDisplayName(
  userMetadata: Record<string, unknown> | undefined,
  appMetadata: Record<string, unknown> | undefined,
): string | null {
  const candidates = [
    userMetadata?.full_name,
    userMetadata?.nombre_completo,
    userMetadata?.nombre,
    userMetadata?.name,
    userMetadata?.display_name,
    appMetadata?.full_name,
    appMetadata?.nombre_completo,
    appMetadata?.nombre,
    appMetadata?.name,
    appMetadata?.display_name,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const value = candidate.trim()
      if (value) return value
    }
  }
  return null
}
