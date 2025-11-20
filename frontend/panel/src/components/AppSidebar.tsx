"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconChartBar,
  IconDatabase,
  IconFileWord,
  IconInbox,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
  IconCalendar,
  IconMessageCircle,
  IconAddressBook,
  IconLayoutGrid,
  IconLayoutKanban,
  IconMap,
  IconMail,
  IconBell,
  IconTargetArrow,
  IconUsersGroup,
} from "@tabler/icons-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { NavDocuments } from '@/components/nav-documents'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const NAVIGATION = {
  navMain: [
    { title: "Dashboard", url: "/dashboard", icon: IconChartBar },
    { title: "Contactos", url: "/contactos", icon: IconAddressBook },
    { title: "Inbox", url: "/inbox", icon: IconInbox },
    { title: "Embudo", url: "/embudo", icon: IconListDetails },
    { title: "Leads", url: "/leads", icon: IconUsers },
    { title: "Clientes", url: "/clientes", icon: IconUsersGroup },
    { title: "Agenda", url: "/agenda", icon: IconCalendar },
    { title: "Visitas", url: "/visitas", icon: IconMessageCircle },
    { title: "Proyectos", url: "#", icon: IconFolder },
    { title: "Vista 1", url: "/vista-1", icon: IconLayoutGrid },
    { title: "Mapa de Conversión", url: "/mapa-de-conversion", icon: IconMap },
    { title: "Vista 2", url: "/vista-2", icon: IconLayoutKanban },
  ],
  documents: [
    { name: "Data Library", url: "#", icon: IconDatabase },
    { name: "Reports", url: "#", icon: IconReport },
    { name: "Templates", url: "#", icon: IconFileWord },
  ],
  navSecondary: [
    {
      title: "Prospeccion",
      url: "/prospeccion",
      icon: IconTargetArrow,
      children: [
        { title: "Pipeline", url: "/prospeccion/pipeline" },
        { title: "Campañas", url: "/prospeccion/campanas" },
        { title: "Mensajes automatizados", url: "/prospeccion/mensajes" },
        { title: "Google búsqueda", url: "/prospeccion/google-busqueda" },
        { title: "Denue búsqueda", url: "/prospeccion/denue-busqueda" },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
      children: [
        { title: "Formato de correos", url: "/settings/email", icon: IconMail },
        { title: "Recordatorios de demos", url: "/settings/reminders", icon: IconBell },
      ],
    },
    { title: "Get Help", url: "#", icon: IconHelp },
    { title: "Search", url: "#", icon: IconSearch },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const { user, loading } = useCurrentUser()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHydrated(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const sidebarUser = useMemo(() => {
    const fallbackAvatar = "/assets/logos/Logo8.png"
    if (user) {
      const metadataName =
        typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
          ? user.user_metadata.full_name.trim()
          : null
      const name =
        metadataName ||
        (user.email ? user.email.split("@")[0] || "Usuario" : "Usuario Tal-IA")
      const avatar =
        typeof user.user_metadata?.avatar_url === "string" && user.user_metadata.avatar_url
          ? (user.user_metadata.avatar_url as string)
          : fallbackAvatar
      return {
        name,
        email: user.email || "usuario@tal-ia.mx",
        avatar,
      }
    }
    if (loading) {
      return {
        name: "Cargando usuario...",
        email: "••••••••••••",
        avatar: fallbackAvatar,
      }
    }
    return {
      name: "Sesión no disponible",
      email: "Inicia sesión nuevamente",
      avatar: fallbackAvatar,
    }
  }, [user, loading])

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("[auth] logout error", error)
    } finally {
      router.replace("/auth/login")
      router.refresh()
    }
  }, [router])

  if (!hydrated) {
    return (
      <div
        data-slot="sidebar"
        className="bg-sidebar text-sidebar-foreground hidden h-full w-(--sidebar-width) flex-col border-r border-border/40 md:flex"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="h-10 w-32 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse" />
        </div>
        <div className="flex-1 px-4">
          <div className="mb-3 h-4 w-28 rounded bg-muted/70 animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-8 rounded bg-muted/40 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="/dashboard" className="flex items-center gap-3">
                <Image
                  src="/assets/logos/Logo8.png"
                  alt="Tal-IA"
                  width={36}
                  height={36}
                  className="rounded-lg border border-border/50 bg-surface-alt p-1"
                />
                <span className="text-base font-semibold">Tal-IA</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAVIGATION.navMain} />
        <NavDocuments items={NAVIGATION.documents} />
        <NavSecondary items={NAVIGATION.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} loading={loading} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
