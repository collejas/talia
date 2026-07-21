import { AppSidebar } from '@/components/AppSidebar'
import { EmbudoBoard } from '@/components/embudo/board'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { loadEmbudoData } from '@/lib/embudo/data'
import { fetchPermissionContext } from '@/lib/auth/permissions'
import type { CSSProperties } from 'react'
import { performance } from 'node:perf_hooks'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const pageStartedAt = performance.now()
  console.info('[embudo:page] start')

  const permissionStartedAt = performance.now()
  const permContext = await fetchPermissionContext()
  console.info('[embudo:page] permissions-loaded', {
    elapsed_ms: Math.round(performance.now() - permissionStartedAt),
  })
  const normalizedRoles = (permContext.roles ?? [])
    .map((role) => (role ?? '').toString().trim().toLowerCase())
    .filter(Boolean)
  const isAdminRole =
    Boolean(permContext.es_admin || permContext.es_owner) ||
    normalizedRoles.some((value) => value === 'admin' || value.includes('admin'))
  const isSupervisorRole = normalizedRoles.some(
    (value) => value === '0002' || value === 'supervisor' || value.includes('supervisor'),
  )
  const isPrivilegedRole = isAdminRole || isSupervisorRole
  const isAgenteRole = normalizedRoles.some(
    (value) =>
      value === '0003' ||
      value === 'agente' ||
      value === 'vendedor' ||
      value.includes('agente') ||
      value.includes('vendedor'),
  )

  const boardStartedAt = performance.now()
  const embudo = await loadEmbudoData({
    asignadoId: isAgenteRole && !isPrivilegedRole && permContext.usuario_id ? permContext.usuario_id : undefined,
  })
  console.info('[embudo:page] embudo-loaded', {
    elapsed_ms: Math.round(performance.now() - boardStartedAt),
  })
  console.info('[embudo:page] done', {
    elapsed_ms: Math.round(performance.now() - pageStartedAt),
  })

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AppSidebar variant='inset' />
      <SidebarInset>
        <SiteHeader title='Embudo' />
        <div className='flex h-[calc(100vh-var(--header-height))] min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='@container/main flex min-h-0 flex-1 flex-col gap-2'>
            <div className='flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6'>
              <EmbudoBoard
                etapas={embudo.stages}
                sinConversacion={embudo.sinConversacion}
                visitantesSinChat={embudo.visitantesSinChat}
                scoringKpis={embudo.scoringKpis}
                errors={embudo.errors}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
