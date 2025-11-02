import { useMemo } from 'react'
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

const PANEL_LINKS = [
  { id: 'dashboard', label: 'Dashboard', href: '/panel.html', legacy: true },
  { id: 'embudo', label: 'Embudo', href: '/panel/embudo.html', legacy: true },
  { id: 'leads', label: 'Leads', href: '/leads', legacy: false },
  { id: 'agenda', label: 'Agenda', href: '/panel/agenda.html', legacy: true },
  { id: 'visitas', label: 'Visitas', href: '/visitas', legacy: false },
  { id: 'inbox', label: 'Inbox', href: '/panel/inbox.html', legacy: true },
] as const

const AUX_LINKS = [
  { id: 'config', label: 'Configuración', href: '/panel/configuracion.html' },
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
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-6 px-6 py-4">
          <a
            className="flex items-center gap-3 text-lg font-semibold tracking-tight"
            href={`${spaBase}/visitas`}
          >
            <img
              src="/api/shared/logos/Logo8.png"
              alt="TalIA logo"
              className="h-10 w-10"
            />
            <span>
              Tal-<span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">IA</span>
            </span>
          </a>

          <nav className="hidden flex-1 items-center gap-3 text-sm font-medium text-muted md:flex">
            {PANEL_LINKS.map((link) => {
              if (link.legacy) {
                return (
                  <a
                    key={link.id}
                    className="rounded-md px-3 py-2 transition hover:text-primary"
                    href={`${legacyBase}${link.href.startsWith('/') ? link.href : `/${link.href}`}`}
                  >
                    {link.label}
                  </a>
                )
              }
              const active = isActive(link.href, link.legacy)
              return (
                <a
                  key={link.id}
                  className={cn(
                    'rounded-md px-3 py-2 transition',
                    active ? 'bg-primary/15 text-primary' : 'hover:text-primary',
                  )}
                  href={`${spaBase}${link.href}`}
                >
                  {link.label}
                </a>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            <Select value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
              <SelectTrigger className="w-[160px] border-border bg-surface-alt text-foreground">
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
            <div className="hidden flex-col text-right text-xs md:flex">
              <span className="font-semibold text-foreground">{session.user.email}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-6 pb-3 text-xs text-muted md:hidden">
          {PANEL_LINKS.filter((link) => !link.legacy).map((link) => (
            <a
              key={link.id}
              className={cn(
                'rounded-md px-3 py-2 transition',
                isActive(link.href, link.legacy)
                  ? 'bg-primary/15 text-primary'
                  : 'hover:text-primary',
              )}
              href={`${spaBase}${link.href}`}
            >
              {link.label}
            </a>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-6 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-6 pb-10 text-xs text-muted">
        <div>
          <span>Sesión iniciada como </span>
          <span className="font-medium text-foreground">{session.user.email}</span>
        </div>
        <div className="flex items-center gap-4">
          {AUX_LINKS.map((link) => (
            <a
              key={link.id}
              className="hover:text-primary"
              href={`${legacyBase}${link.href}`}
            >
              {link.label}
            </a>
          ))}
        </div>
      </footer>
      <Toaster />
    </div>
  )
}
