import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { InboxWorkspace } from "@/components/inbox/workspace"
import { SessionRecovery } from "@/components/session-recovery"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { loadInboxData } from "@/lib/inbox/data"

export const dynamic = "force-dynamic"

export default async function Page() {
  const inboxData = await loadInboxData()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Inbox" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SessionRecovery errors={inboxData.errors} />
              {inboxData.errors.length ? (
                <div className="px-4 lg:px-6">
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <p className="font-medium">No se pudieron cargar todos los datos:</p>
                    <ul className="list-disc pl-5">
                      {inboxData.errors.map((message, index) => (
                        <li key={index}>{sanitizeMessage(message)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              <div className="px-4 lg:px-6">
                <InboxWorkspace
                  summary={inboxData.summary}
                  threads={inboxData.threads}
                  reengageTagOptions={inboxData.reengageTags}
                />
              </div>
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
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy)."
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "Tu sesión en Supabase caducó. Estamos intentando renovarla automáticamente; si persiste, vuelve a iniciar sesión."
  }
  return trimmed
}
