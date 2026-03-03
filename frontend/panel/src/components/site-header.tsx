"use client"

import { useMemo } from "react"
import Image from 'next/image'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useCurrentUser } from '@/hooks/use-current-user'

type SiteHeaderProps = {
  title?: string
}

export function SiteHeader({ title = "Panel" }: SiteHeaderProps) {
  const { user, tenant, employeePosition, loading } = useCurrentUser()

  const displayName = useMemo(() => {
    if (!user) {
      if (loading) return "Cargando usuario..."
      return null
    }
    const metadataName =
      typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
        ? user.user_metadata.full_name.trim()
        : null
    return (
      metadataName ||
      (user.email ? user.email.split("@")[0] || "Usuario" : "Usuario Tal-IA")
    )
  }, [loading, user])

  const headerTitle = useMemo(() => {
    if (displayName) return `Tal-IA · ${displayName}`
    return "Tal-IA"
  }, [displayName])

  const jobLabel = useMemo(() => {
    if (!employeePosition) return null
    return `Puesto · ${employeePosition}`
  }, [employeePosition])

  const companyLabel = useMemo(() => {
    if (!tenant) return null
    const candidate = tenant.razon_social?.trim() || tenant.nombre?.trim()
    return candidate || null
  }, [tenant])

  const companySubtitle = useMemo(() => {
    if (!companyLabel) return null
    return `Razón social · ${companyLabel}`
  }, [companyLabel])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <span className="text-base font-semibold text-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-3">
          <Image
            src="/assets/logos/Logo8.png"
            alt="Tal-IA"
            width={32}
            height={32}
            className="rounded-lg border border-border/40 bg-surface-alt p-1"
          />
          <div className="flex flex-col items-end text-right">
            <span className="text-base font-semibold leading-4 text-foreground">{headerTitle}</span>
            {jobLabel ? (
            <span className="text-xs font-medium text-muted-foreground leading-tight">
              {jobLabel}
            </span>
            ) : null}
            {companySubtitle ? (
              <span className="text-xs text-muted-foreground">{companySubtitle}</span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
