import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { InboxWorkspace } from "@/components/inbox/workspace"
import { SessionRecovery } from "@/components/session-recovery"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"
import { loadInboxData } from "@/lib/inbox/data"

export const dynamic = "force-dynamic"

type InboxSearchParams = Record<string, string | string[] | undefined>

type InboxPageProps = {
  searchParams?: Promise<InboxSearchParams> | InboxSearchParams
}

export default async function Page({ searchParams }: InboxPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const initialFilters = {
    estado: pickQueryParam(resolvedSearchParams, "estado"),
    source: pickQueryParam(resolvedSearchParams, "source"),
    channel: pickQueryParam(resolvedSearchParams, "channel"),
    batchId: pickQueryParam(resolvedSearchParams, "batchId") ?? pickQueryParam(resolvedSearchParams, "batch_id"),
    campanaId:
      pickQueryParam(resolvedSearchParams, "campanaId") ?? pickQueryParam(resolvedSearchParams, "campana_id"),
  }
  const inboxData = await loadInboxData(initialFilters)

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
                  batchOptions={inboxData.batchOptions}
                  campanaOptions={inboxData.campanaOptions}
                  initialFilters={initialFilters}
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

function pickQueryParam(
  searchParams: InboxSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key]
  if (Array.isArray(value)) {
    const candidate = value[0]
    return typeof candidate === "string" && candidate.trim().length ? candidate.trim() : null
  }
  if (typeof value === "string" && value.trim().length) {
    return value.trim()
  }
  return null
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
