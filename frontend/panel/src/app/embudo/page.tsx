import { AppSidebar } from '@/components/AppSidebar'
import { EmbudoBoard } from '@/components/embudo/board'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { loadEmbudoData } from '@/lib/embudo/data'
import { fetchPermissionContext } from '@/lib/auth/permissions'
import type { CSSProperties } from 'react'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const permContext = await fetchPermissionContext()
  const normalizedRoles = (permContext.roles ?? [])
    .map((role) => (role ?? '').toString().trim().toLowerCase())
    .filter(Boolean)
  const isAdminRole =
    Boolean(permContext.es_admin) ||
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

  const embudo = await loadEmbudoData({
    asignadoId: isAgenteRole && !isPrivilegedRole && permContext.usuario_id ? permContext.usuario_id : undefined,
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
        <div className='flex h-[calc(100vh-var(--header-height))] flex-1 flex-col overflow-hidden'>
          <div className='@container/main flex flex-1 flex-col gap-2'>
            <div className='flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6'>
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
