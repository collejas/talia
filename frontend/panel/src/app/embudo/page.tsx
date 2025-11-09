import { AppSidebar } from '@/components/AppSidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { loadEmbudoData } from '@/lib/embudo/data'
import { EmbudoBoard } from '@/components/embudo/board'
import { SessionRecovery } from '@/components/session-recovery'
import type { CSSProperties } from 'react'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const embudo = await loadEmbudoData()

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
              <SessionRecovery errors={embudo.errors} />
              {embudo.errors.length ? (
                <div className='rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
                  <p className='font-medium'>No se pudieron cargar todas las etapas:</p>
                  <ul className='list-disc pl-5'>
                    {embudo.errors.map((message, index) => (
                      <li key={index}>{sanitizeMessage(message)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <EmbudoBoard
                etapas={embudo.stages}
                sinConversacion={embudo.sinConversacion}
                visitantesSinChat={embudo.visitantesSinChat}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}

function sanitizeMessage(message: string) {
  const trimmed = message.trim()
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return 'El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy).'
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return 'Tu sesión en Supabase caducó. Estamos intentando renovarla automáticamente; si persiste, vuelve a iniciar sesión.'
  }
  return trimmed
}
