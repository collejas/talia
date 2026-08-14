import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { fetchPermissionContext } from "@/lib/auth/permissions"
import { MASTER_TENANT_ID } from "@/lib/auth/master-tenant"

import { MessageBillingPageClient } from "./page.client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MessageBillingPage() {
  const context = await fetchPermissionContext()
  const permissions = new Set((context.permisos ?? []).map((permission) => permission.toLowerCase()))
  const allowed = context.es_owner || context.es_admin || permissions.has("settings.view") || permissions.has("reports.view")
  if (!allowed) redirect("/unauthorized")

  return (
    <AppViewLayout title="Settings · Cobro de mensajes">
      <MessageBillingPageClient
        isOwner={Boolean(context.es_owner && context.organizacion_id === MASTER_TENANT_ID)}
      />
    </AppViewLayout>
  )
}
