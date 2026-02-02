import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { TenantVariablesPanel } from "./components/tenant-variables-panel"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = {
  title: "Variables · Settings",
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function SettingsVariablesPage() {
  const response = await callCrmApi<{
    organizacion_id: string
    nombre: string
    razon_social?: string | null
    dominio_principal?: string | null
    rfc?: string | null
    pais?: string | null
    estado?: string | null
    ciudad?: string | null
    telefono?: string | null
    sitio_web?: string | null
    estado_onboarding?: string | null
    activo?: boolean | null
    routes: Array<{ canal: string; clave: string }>
  }>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })

  const data = response.ok ? response.data : null
  const error = response.ok ? null : response.error

  return (
    <AppViewLayout title="Variables del tenant" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <TenantVariablesPanel data={data} error={error} />
      </div>
    </AppViewLayout>
  )
}
