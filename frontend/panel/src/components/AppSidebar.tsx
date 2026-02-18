"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconChartBar,
  IconDatabase,
  IconFileDescription,
  IconFileWord,
  IconInbox,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconCalendar,
  IconMessageCircle,
  IconAddressBook,
  IconLayoutGrid,
  IconLayoutKanban,
  IconMap,
  IconMail,
  IconBell,
  IconTargetArrow,
  IconGauge,
  IconUsersGroup,
  IconAdjustments,
  IconBuilding,
  IconHierarchy,
  type Icon,
} from "@tabler/icons-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { usePermissions } from "@/hooks/use-permissions"
import { usePlatformAdminStatus } from "@/hooks/use-platform-admin-status"
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

type NavPermission = string | string[]

type NavItem = {
  title: string
  url: string
  icon?: Icon
  permission?: NavPermission
  children?: NavItem[]
}

type NavDocItem = {
  name: string
  url: string
  icon: Icon
}

type NavSecondaryItem = {
  title: string
  url: string
  icon: Icon
  children?: { title: string; url: string; icon?: Icon }[]
}

const NAVIGATION: {
  navMain: NavItem[]
  documents: NavDocItem[]
  navSecondary: NavSecondaryItem[]
} = {
  navMain: [
    { title: "Dashboard", url: "/dashboard", icon: IconChartBar, permission: "ver_panel" },
    { title: "Embudo", url: "/embudo", icon: IconListDetails, permission: "pipeline.view" },
    { title: "Inbox", url: "/inbox", icon: IconInbox, permission: "ver_inbox" },
    { title: "Agenda", url: "/agenda", icon: IconCalendar, permission: "agenda.view" },
    { title: "Mapa de Conversion", url: "/mapa-de-conversion", icon: IconMap, permission: "reports.view" },
    { title: "Propiedades 3D", url: "/propiedades", icon: IconBuilding, permission: "propiedades.view" },
    { title: "Oportunidades", url: "/oportunidades", icon: IconLayoutKanban, permission: "pipeline.view" },
    { title: "Contactos", url: "/contactos", icon: IconAddressBook, permission: "contacts.read" },
    { title: "Clientes", url: "/clientes", icon: IconUsersGroup, permission: "clientes.view" },
    {
      title: "CRM (beta)",
      url: "/crm",
      icon: IconFolder,
      permission: "conv.read",
      children: [
        { title: "Cuentas", url: "/crm", permission: "clientes.view" },
        { title: "Actividades", url: "/crm/actividades", permission: "activities.view" },
        { title: "Tickets", url: "/crm/tickets", permission: "tickets.view" },
        { title: "Campañas", url: "/crm/campanas", permission: "campaigns.view" },
        { title: "Notas", url: "/crm/notas", permission: "notes.view" },
        { title: "Asignaciones WhatsApp", url: "/crm/whatsapp/asignaciones", permission: "conv.assign" },
      ],
    },
    {
      title: "Prospeccion",
      url: "/prospeccion",
      icon: IconTargetArrow,
      children: [
        { title: "Google búsqueda", url: "/prospeccion/google-busqueda", permission: "busquedas.view" },
        { title: "Denue búsqueda", url: "/prospeccion/denue-busqueda", permission: "busquedas.view" },
        { title: "Buscador web", url: "/prospeccion/buscador", permission: "busquedas.run" },
        { title: "Prospectos", url: "/prospeccion/prospectos", permission: "busquedas.run" },
        { title: "Contactos", url: "/prospeccion/contactos", permission: "contacts.read" },
        { title: "Campañas", url: "/prospeccion/campanas", permission: "campaigns.view" },
        { title: "Mensajes automatizados", url: "/prospeccion/mensajes", permission: "messages.read" },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
      permission: ["settings.view", "settings.manage"],
      children: [
        { title: "Formato de correos", url: "/settings/email", icon: IconMail, permission: "settings.manage" },
        { title: "Recordatorios de demos", url: "/settings/reminders", icon: IconBell, permission: "settings.manage" },
        { title: "Calificación IA", url: "/settings/scoring", icon: IconGauge, permission: "settings.manage" },
        {
          title: "Formato de cotización",
          url: "/settings/formato-cotizacion",
          icon: IconFileDescription,
          permission: "settings.manage",
        },
        {
          title: "Productos y servicios",
          url: "/settings/productos",
          icon: IconHierarchy,
          permission: "settings.manage",
        },
        {
          title: "Propiedades",
          url: "/settings/propiedades",
          icon: IconBuilding,
          permission: "settings.manage",
        },
        { title: "Recursos Humanos", url: "/settings/rh", icon: IconUsersGroup, permission: "user.manage" },
        
        {
          title: "Plantillas de contacto",
          url: "/settings/prospeccion/plantillas",
          icon: IconMessageCircle,
          permission: "settings.manage",
        },
      ],
    },
    { title: "Proyectos", url: "#", icon: IconFolder },
    { title: "Propuesta", url: "/propuesta", icon: IconLayoutGrid, permission: "propuesta.view" },
    { title: "Visita 2", url: "/vista-2", icon: IconLayoutKanban, permission: "reports.view" },
    { title: "Visitas", url: "/visitas", icon: IconMessageCircle, permission: "reports.view" },
  ],
  documents: [
    { name: "Data Library", url: "#", icon: IconDatabase },
    { name: "Reports", url: "#", icon: IconReport },
    { name: "Templates", url: "#", icon: IconFileWord },
  ],
  navSecondary: [
    { title: "Get Help", url: "#", icon: IconHelp },
    { title: "Search", url: "#", icon: IconSearch },
  ],
}

type SettingsChildNavItem = {
  title: string
  url: string
  icon?: Icon
  permission?: NavPermission
}

const SETTINGS_CHILDREN_TEMPLATE: SettingsChildNavItem[] =
  (NAVIGATION.navMain.find((item) => item.title === "Settings")?.children ?? []) as SettingsChildNavItem[]

export function AppSidebar({
  collapsible = "icon",
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const { user, loading } = useCurrentUser()
  const { context: permissionContext, loading: permissionsLoading } = usePermissions()
  const [hydrated, setHydrated] = useState(false)

  const { isPlatformAdmin } = usePlatformAdminStatus()
  const settingsChildren = useMemo(() => {
    const base = SETTINGS_CHILDREN_TEMPLATE.map((child) => ({ ...child }))
    base.unshift({
      title: "Variables",
      url: "/settings/variables",
      icon: IconAdjustments,
      permission: "settings.manage",
    })
    if (isPlatformAdmin) {
      base.push({ title: "Tenants", url: "/settings/tenants", icon: IconDatabase })
    }
    return base
  }, [isPlatformAdmin])
  const navItems = useMemo(() => {
    const items = NAVIGATION.navMain.map((item) =>
      item.title === "Settings" ? { ...item, children: settingsChildren } : item,
    )

    if (permissionsLoading) {
      return items
    }

    const perms = new Set((permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()))
    const isAdmin = permissionContext.es_admin || permissionContext.es_owner

    const hasPermission = (permission?: NavPermission) => {
      if (!permission) return true
      if (isAdmin) return true
      const required = Array.isArray(permission) ? permission : [permission]
      return required.some((perm) => perms.has(perm.toLowerCase()))
    }

    const filterItems = (list: NavItem[]): NavItem[] =>
      list.reduce<NavItem[]>((acc, item) => {
        const children = item.children ? filterItems(item.children) : undefined
        const allowed = hasPermission(item.permission) || (children && children.length > 0)
        if (!allowed) return acc
        acc.push({ ...item, children })
        return acc
      }, [])

    return filterItems(items)
  }, [settingsChildren, permissionsLoading, permissionContext])

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
    <Sidebar collapsible={collapsible} {...props}>
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
        <NavMain items={navItems} />
        <NavDocuments items={NAVIGATION.documents} />
        <NavSecondary items={NAVIGATION.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} loading={loading} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
