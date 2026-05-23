import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { type TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { callCrmApi } from "@/lib/api/crm"
import { TenantContactCatalogsForm } from "../tenants/[tenantId]/tenant-forms"

export const metadata: Metadata = {
  title: "Account · Settings",
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function SettingsAccountPage() {
  const response = await callCrmApi<TenantScopedSettings>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })

  const data = response.ok ? response.data : null
  return (
    <AppViewLayout title="Account" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        {data ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold">Contactos</h2>
              <p className="text-sm text-muted-foreground">
                Cada tenant puede definir sus propios catálogos de puesto, rol de decisión y clasificación de negocio.
              </p>
            </div>
            <TenantContactCatalogsForm tenantId={data.organizacion_id} config={data.config ?? null} />
          </div>
        ) : null}
      </div>
    </AppViewLayout>
  )
}
