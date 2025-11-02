import { useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Outlet, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getLegacyPanelBasePath, getSpaBasePath, buildLoginUrl } from '@/lib/paths'
import { getSupabaseClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { Toaster } from '@/components/ui/toaster'
import {
  CalendarDays,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  Users,
  ArrowLeftRight,
  Globe,
  ExternalLink,
} from 'lucide-react'

const PANEL_LINKS = [
  { id: 'dashboard', label: 'Dashboard', href: '/panel.html', legacy: true, icon: LayoutDashboard },
  { id: 'embudo', label: 'Embudo', href: '/panel/embudo.html', legacy: true, icon: ArrowLeftRight },
  { id: 'leads', label: 'Leads', href: '/leads', legacy: false, icon: Users },
  { id: 'agenda', label: 'Agenda', href: '/panel/agenda.html', legacy: true, icon: CalendarDays },
  { id: 'visitas', label: 'Visitas', href: '/visitas', legacy: false, icon: Globe },
  { id: 'inbox', label: 'Inbox', href: '/panel/inbox.html', legacy: true, icon: MessageSquare },
] as const

const AUX_LINKS = [
  { id: 'inicio', label: 'Inicio', href: '/panel.html', legacy: true, icon: Home },
  { id: 'config', label: 'Configuración', href: '/panel/configuracion.html', legacy: true, icon: Settings },
] as const

type PanelLayoutProps = {
  session: Session
}

export function PanelLayout({ session }: PanelLayoutProps) {
  const location = useLocation()
  const spaBase = getSpaBasePath()
  const legacyBase = getLegacyPanelBasePath()
  const { theme, setTheme, options } = useTheme()
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      window.location.href = buildLoginUrl()
    }
  }

  const isActive = (href: string, legacy: boolean) => {
    if (legacy) {
      return false
    }
    const normalized = href.startsWith('/') ? href : `/${href}`
    return location.pathname === normalized
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border/60 bg-surface/80 px-5 py-6 md:flex md:flex-col md:gap-8">
          <a href={`${spaBase}/visitas`} className="flex items-center gap-3">
            <img
              src="/api/shared/logos/Logo8.png"
              alt="TalIA logo"
              className="h-10 w-10 rounded-lg border border-border/70 bg-surface-alt p-1"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-muted-foreground">Panel</span>
              <span className="text-lg font-bold tracking-tight text-foreground">
                Tal-<span className="rounded-md bg-primary px-1 py-0.5 text-primary-foreground">IA</span>
              </span>
            </div>
          </a>
          <div className="flex flex-1 flex-col gap-6 text-sm">
            <nav className="space-y-1">
              {PANEL_LINKS.map((link) => {
                const href = link.legacy
                  ? `${legacyBase}${link.href.startsWith('/') ? link.href : `/${link.href}`}`
                  : `${spaBase}${link.href}`
                const active = isActive(link.href, link.legacy)
                const Icon = link.icon
                return (
                  <a
                    key={link.id}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition',
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{link.label}</span>
                    {link.legacy ? <ExternalLink className="h-3.5 w-3.5 opacity-70" /> : null}
                  </a>
                )
              })}
            </nav>
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Rápido acceso
              </p>
              {AUX_LINKS.map((link) => {
                const href = link.legacy
                  ? `${legacyBase}${link.href.startsWith('/') ? link.href : `/${link.href}`}`
                  : `${spaBase}${link.href}`
                const Icon = link.icon
                return (
                  <a
                    key={link.id}
                    href={href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-surface-alt hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </a>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-alt p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sesión</span>
              <span className="text-sm font-semibold text-foreground">{session.user.email}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
        </aside>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b border-border/60 bg-surface/80 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
              <div className="flex items-center gap-3 md:hidden">
                <Button variant="outline" size="icon" onClick={() => setMobileNavOpen(true)}>
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Abrir navegación</span>
                </Button>
                <a href={`${spaBase}/visitas`} className="flex items-center gap-2 text-base font-semibold">
                  <img src="/api/shared/logos/Logo8.png" alt="TalIA logo" className="h-8 w-8 rounded-md border border-border/60 bg-surface-alt p-1" />
                  <span>Tal-IA</span>
                </a>
              </div>
              <div className="flex flex-1 items-center justify-end gap-3 md:justify-between">
                <div className="hidden md:flex md:flex-col">
                  <span className="text-xs text-muted-foreground">Bienvenido</span>
                  <span className="text-sm font-semibold text-foreground">{session.user.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
                    <SelectTrigger className="w-[150px] border-border bg-surface-alt text-foreground">
                      <SelectValue placeholder="Tema" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={handleLogout}>
                    Cerrar sesión
                  </Button>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8">
              <Outlet />
            </div>
          </main>
          <footer className="px-4 pb-8 text-xs text-muted-foreground md:px-8">
            <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 border-t border-border/60 pt-4 md:flex-row md:items-center md:justify-between">
              <span>
                Sesión iniciada como{' '}
                <span className="font-medium text-foreground">{session.user.email}</span>
              </span>
              <div className="flex items-center gap-4">
                {AUX_LINKS.map((link) => {
                  const href = link.legacy
                    ? `${legacyBase}${link.href.startsWith('/') ? link.href : `/${link.href}`}`
                    : `${spaBase}${link.href}`
                  return (
                    <a key={link.id} href={href} className="transition hover:text-primary">
                      {link.label}
                    </a>
                  )
                })}
              </div>
            </div>
          </footer>
        </div>
      </div>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            className="h-full flex-1 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar navegación"
          />
          <div className="flex h-full w-[280px] flex-col gap-6 border-l border-border bg-surface px-5 py-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/api/shared/logos/Logo8.png" alt="TalIA logo" className="h-9 w-9 rounded-md border border-border/60 bg-surface-alt p-1" />
                <span className="text-lg font-semibold text-foreground">Tal-IA</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMobileNavOpen(false)}>
                Cerrar
              </Button>
            </div>
            <nav className="flex flex-col gap-2 text-sm">
              {PANEL_LINKS.map((link) => {
                const href = link.legacy
                  ? `${legacyBase}${link.href.startsWith('/') ? link.href : `/${link.href}`}`
                  : `${spaBase}${link.href}`
                const active = isActive(link.href, link.legacy)
                const Icon = link.icon
                return (
                  <a
                    key={`mobile-${link.id}`}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition',
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{link.label}</span>
                    {link.legacy ? <ExternalLink className="h-3.5 w-3.5 opacity-70" /> : null}
                  </a>
                )
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Sesión</span>
                <span className="text-sm font-semibold text-foreground">{session.user.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Cerrar sesión
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <Toaster />
    </div>
  )
}
