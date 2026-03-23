import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { TenantVariablesPanel, type TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { callCrmApi } from "@/lib/api/crm"

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
  const error = response.ok ? null : response.error

  return (
    <AppViewLayout title="Account" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <TenantVariablesPanel
          data={data}
          error={error}
          title="Cuenta y organización"
          description="Actualiza sólo los datos públicos de tu organización."
          showRoutes={false}
        />
      </div>
    </AppViewLayout>
  )
}
