"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconChartBar,
  IconDatabase,
  IconFileDescription,
  IconFileWord,
  IconInbox,
  IconFolder,
  IconHelp,
  IconFilter,
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
  IconActivity,
  IconTicket,
  IconNotes,
  IconShieldCheck,
  IconShoppingCart,
  IconCoin,
  type Icon,
} from "@tabler/icons-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { usePermissions } from "@/hooks/use-permissions"
import { useTenantContext } from "@/hooks/use-tenant-context"
import { isMasterTenantId } from "@/lib/auth/master-tenant"
import { NavDocuments } from '@/components/nav-documents'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { NavUser } from '@/components/nav-user'
import { Button } from "@/components/ui/button"
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
  ownerAdminOnly?: boolean
  ownerOnly?: boolean
  masterTenantOnly?: boolean
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
  masterTenantOnly?: boolean
  children?: { title: string; url: string; icon?: Icon }[]
}

const NAVIGATION: {
  navMain: NavItem[]
  documents: NavDocItem[]
  navSecondary: NavSecondaryItem[]
} = {
  navMain: [
    { title: "Dashboard", url: "/dashboard?from_onboarding=1", icon: IconChartBar, permission: "ver_panel" },
    {
      title: "CRM",
      url: "/crm",
      icon: IconUsersGroup,
      permission: "conv.read",
      children: [
        { title: "Embudo", url: "/embudo", icon: IconFilter, permission: "pipeline.view" },
        { title: "Contactos", url: "/contactos", icon: IconAddressBook, permission: "contacts.read" },
        { title: "Empresas", url: "/empresas", icon: IconBuilding, permission: "clientes.view" },
        { title: "Oportunidades", url: "/oportunidades", icon: IconLayoutKanban, permission: "pipeline.view" },
        { title: "Clientes", url: "/clientes", icon: IconUsersGroup, permission: "clientes.view" },
        { title: "Actividades", url: "/crm/actividades", icon: IconActivity, permission: "activities.view" },
        { title: "Tickets", url: "/crm/tickets", icon: IconTicket, permission: "tickets.view", masterTenantOnly: true },
        { title: "Notas", url: "/crm/notas", icon: IconNotes, permission: "notes.view" },
        { title: "Auditoría reasignaciones", url: "/crm/asignaciones-vendedores", icon: IconShieldCheck, permission: ["audit.view", "audit.view_all"] },
      ],
    },
    { title: "Inbox", url: "/inbox", icon: IconInbox, permission: "ver_inbox" },
    { title: "Agenda", url: "/agenda", icon: IconCalendar, permission: "agenda.view" },
    { title: "Mapa de Conversion", url: "/mapa-de-conversion", icon: IconMap, permission: "reports.view" },
    { title: "Propiedades 3D", url: "/propiedades", icon: IconBuilding, permission: "propiedades.view" },
    {
      title: "Prospeccion",
      url: "/prospeccion",
      icon: IconTargetArrow,
      children: [
        { title: "Google búsqueda", url: "/prospeccion/google-busqueda", permission: "busquedas.view" },
        {
          title: "Google Trends",
          url: "/prospeccion/google-trends",
          permission: "__owner_admin_only__",
          ownerAdminOnly: true,
          masterTenantOnly: true,
        },
        { title: "Denue búsqueda", url: "/prospeccion/denue-busqueda", permission: "busquedas.view" },
        { title: "Buscador web", url: "/prospeccion/buscador", permission: "busquedas.run" },
        { title: "Prospectos", url: "/prospeccion/prospectos", permission: "busquedas.run" },
        { title: "Contactos", url: "/prospeccion/contactos", permission: "contacts.read" },
        { title: "Campañas", url: "/prospeccion/campanas", permission: "campaigns.view" },
        { title: "Métricas", url: "/prospeccion/metricas", permission: "reports.view" },
        { title: "Landing A/B/C", url: "/prospeccion/landing-ab", permission: "reports.view" },
        { title: "Atribución WhatsApp", url: "/prospeccion/whatsapp-atribucion", permission: "busquedas.run" },
        {
          title: "Mensajes automatizados",
          url: "/prospeccion/mensajes",
          permission: "messages.read",
          masterTenantOnly: true,
        },
      ],
    },
    {
      title: "Compras e inventario",
      url: "/compras",
      icon: IconShoppingCart,
      permission: "settings.manage",
    },
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
      permission: ["settings.view", "settings.manage"],
      children: [
        { title: "Extras", url: "/settings/account", icon: IconAdjustments, permission: "settings.manage" },
        { title: "Formato de correos", url: "/settings/email", icon: IconMail, permission: "settings.manage" },
        { title: "Recordatorios de citas", url: "/settings/reminders", icon: IconBell, permission: "settings.manage" },
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
        {
          title: "Inbox Metrics",
          url: "/settings/inbox-metrics",
          icon: IconInbox,
          permission: "settings.manage",
          ownerOnly: true,
        },
        {
          title: "Ops Alta Demanda",
          url: "/settings/ops",
          icon: IconGauge,
          permission: "settings.manage",
          ownerOnly: true,
        },
        {
          title: "Supabase Connectivity",
          url: "/settings/supabase-connectivity",
          icon: IconDatabase,
          permission: "settings.manage",
        },
        {
          title: "Costos OpenAI",
          url: "/settings/openai-costs",
          icon: IconDatabase,
          permission: ["settings.view", "settings.manage"],
        },
        {
          title: "Cobro de mensajes",
          url: "/settings/cobro-mensajes",
          icon: IconCoin,
          permission: ["settings.view", "reports.view"],
        },
        { title: "Recursos Humanos", url: "/settings/rh", icon: IconUsersGroup, permission: "user.manage" },
        { title: "Disponibilidad agenda", url: "/agenda/disponibilidad", icon: IconCalendar, permission: "agenda.manage" },
      ],
    },
    {
      title: "Comercial",
      url: "/settings/commercial",
      icon: IconCoin,
      ownerOnly: true,
      masterTenantOnly: true,
      children: [
        {
          title: "Resumen comercial",
          url: "/settings/commercial",
          icon: IconChartBar,
          ownerOnly: true,
          masterTenantOnly: true,
        },
        {
          title: "Planes comerciales",
          url: "/settings/commercial/plans",
          icon: IconFileDescription,
          ownerOnly: true,
          masterTenantOnly: true,
        },
        {
          title: "Billing / Stripe",
          url: "/settings/commercial/billing",
          icon: IconCoin,
          ownerOnly: true,
          masterTenantOnly: true,
        },
        {
          title: "Suscripciones",
          url: "/settings/commercial/billing/subscriptions",
          icon: IconFileDescription,
          ownerOnly: true,
          masterTenantOnly: true,
        },
        {
          title: "Eventos webhook",
          url: "/settings/commercial/billing/events",
          icon: IconActivity,
          ownerOnly: true,
          masterTenantOnly: true,
        },
        {
          title: "Configuración de conexión",
          url: "/settings/commercial/billing/connection",
          icon: IconSettings,
          ownerOnly: true,
          masterTenantOnly: true,
        },
      ],
    },
    { title: "Proyectos", url: "#", icon: IconFolder, masterTenantOnly: true },
    {
      title: "Propuesta",
      url: "/propuesta",
      icon: IconLayoutGrid,
      permission: "propuesta.view",
      masterTenantOnly: true,
    },
    {
      title: "Propuesta Ejecutiva",
      url: "/propuesta-ejecutiva",
      icon: IconLayoutGrid,
      permission: "propuesta.view",
      masterTenantOnly: true,
    },
    {
      title: "Visita 2",
      url: "/vista-2",
      icon: IconLayoutKanban,
      permission: "reports.view",
      masterTenantOnly: true,
    },
    {
      title: "Visitas",
      url: "/visitas",
      icon: IconMessageCircle,
      permission: "reports.view",
      masterTenantOnly: true,
    },
  ],
  documents: [
    { name: "Data Library", url: "#", icon: IconDatabase },
    { name: "Reports", url: "#", icon: IconReport },
    { name: "Templates", url: "#", icon: IconFileWord },
  ],
  navSecondary: [
    { title: "Get Help", url: "#", icon: IconHelp, masterTenantOnly: true },
    { title: "Search", url: "#", icon: IconSearch, masterTenantOnly: true },
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
  const { user, loading, isPlatformAdmin, profilingEnabled, featureFlags } = useCurrentUser()
  const { context: permissionContext, loading: permissionsLoading } = usePermissions()
  const [hydrated, setHydrated] = useState(false)
  const sidebarApiEnabled = !loading && Boolean(user)
  const {
    tenantId: activeTenantId,
    tenantName: activeTenantName,
    refresh: refreshTenantContext,
  } = useTenantContext({ enabled: sidebarApiEnabled && isPlatformAdmin })
  const moduleFlags = useMemo(
    () => ({
      productosEnabled: Boolean(featureFlags?.productosEnabled),
      propiedadesEnabled: Boolean(featureFlags?.propiedadesEnabled),
    }),
    [featureFlags?.productosEnabled, featureFlags?.propiedadesEnabled],
  )
  const isMasterTenant = isMasterTenantId(permissionContext.organizacion_id)
  const settingsChildren = useMemo(() => {
    const base = SETTINGS_CHILDREN_TEMPLATE.map((child) => ({ ...child })).filter((child) =>
      child.url === "/settings/scoring" ? profilingEnabled : true,
    )
    base.unshift({
      title: "Configuración",
      url: "/settings/variables",
      icon: IconAdjustments,
      permission: "settings.manage",
    })
    const filtered = base.filter((child) => {
      if (!moduleFlags.productosEnabled && child.url.startsWith("/settings/productos")) {
        return false
      }
      if (!moduleFlags.propiedadesEnabled && child.url === "/settings/propiedades") {
        return false
      }
      return true
    })
    if (isPlatformAdmin) {
      filtered.push({ title: "Organizaciones", url: "/settings/tenants", icon: IconDatabase })
    }
    return filtered
  }, [isPlatformAdmin, moduleFlags.productosEnabled, moduleFlags.propiedadesEnabled, profilingEnabled])
  const navItems = useMemo(() => {
    const items = NAVIGATION.navMain.map((item) =>
      item.title === "Settings" ? { ...item, children: settingsChildren } : item,
    ).filter((item) => {
      if (item.url === "/propiedades" && !moduleFlags.propiedadesEnabled) {
        return false
      }
      if (item.masterTenantOnly && !isMasterTenant) {
        return false
      }
      return true
    })

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
        const allowedByRole = item.ownerOnly
          ? permissionContext.es_owner
          : item.ownerAdminOnly
            ? isAdmin
            : hasPermission(item.permission)
        const allowedByTenant = item.masterTenantOnly ? isMasterTenant : true
        const allowed = (allowedByRole && allowedByTenant) || (children && children.length > 0)
        if (!allowed) return acc
        acc.push({ ...item, children })
        return acc
      }, [])

    return filterItems(items)
  }, [isMasterTenant, moduleFlags.propiedadesEnabled, settingsChildren, permissionsLoading, permissionContext])
  const dashboardRoutePrefetchedRef = useRef(false)
  const mapaRoutePrefetchedRef = useRef(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHydrated(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!hydrated || !sidebarApiEnabled || permissionsLoading) {
      return
    }
    if (!dashboardRoutePrefetchedRef.current) {
      dashboardRoutePrefetchedRef.current = true
      void router.prefetch("/dashboard?from_onboarding=1")
    }
    const hasMapaDeConversion = navItems.some((item) => item.url === "/mapa-de-conversion")
    if (!hasMapaDeConversion || mapaRoutePrefetchedRef.current) {
      return
    }
    mapaRoutePrefetchedRef.current = true
    void router.prefetch("/mapa-de-conversion")
  }, [hydrated, navItems, permissionsLoading, router, sidebarApiEnabled])

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

  const handleClearTenantContext = useCallback(async () => {
    try {
      await fetch("/api/platform-admin/tenant-context", { method: "DELETE" })
    } catch (error) {
      console.error("[tenant-context] clear error", error)
    } finally {
      await refreshTenantContext()
      router.refresh()
    }
  }, [refreshTenantContext, router])

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
              <a href="/dashboard?from_onboarding=1" className="flex items-center gap-3">
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
        {isPlatformAdmin && activeTenantId ? (
          <div className="mx-2 mb-2 rounded-lg border border-amber-300/40 bg-amber-100/40 p-2 text-xs text-amber-950 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
            <p className="font-medium">Operando como tenant</p>
            <p className="truncate">
              {activeTenantName || activeTenantId}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 w-full text-xs"
              onClick={() => {
                void handleClearTenantContext()
              }}
            >
              Salir de contexto
            </Button>
          </div>
        ) : null}
        <NavMain items={navItems} />
        {isMasterTenant ? <NavDocuments items={NAVIGATION.documents} /> : null}
        {isMasterTenant ? <NavSecondary items={NAVIGATION.navSecondary} className="mt-auto" /> : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} loading={loading} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
