import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { TenantVariablesSectionsPanel } from "./components/tenant-variables-sections-panel"
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
    config?: Record<string, unknown> | null
    routes: Array<{ canal: string; clave: string }>
  }>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })

  const data = response.ok ? response.data : null

  return (
    <AppViewLayout title="Variables del tenant" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Variables
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Variables del tenant</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Esta vista replica las secciones de variables que ve el administrador global para mantener coherencia
            en la experiencia y permitir que el tenant admin configure exactamente las mismas opciones.
          </p>
        </header>
        <TenantVariablesSectionsPanel data={data} />
      </div>
    </AppViewLayout>
  )
}
