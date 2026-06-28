import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { callCrmApi } from "@/lib/api/crm"

import { CommercialPlansManager } from "./commercial-plans-manager.client"

export const metadata: Metadata = {
  title: "Commercial Plans · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type CommercialPlan = {
  id: string
  code: string
  name: string
  description?: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type CommercialPlanPrice = {
  id: string
  plan_id: string
  billing_provider: string
  provider_product_id: string
  provider_price_id: string
  currency: string
  billing_interval: string
  amount_cents: number
  active: boolean
}

type CommercialPlanEntitlement = {
  id: string
  plan_id: string
  entitlement_key: string
  value_type: string
  enabled: boolean
  limit_value?: number | null
  value_text?: string | null
  value_json?: unknown
  limit_unit?: string | null
  scope?: string | null
  created_at: string
}

type CommercialPlanDefault = {
  id: string
  plan_id: string
  default_key: string
  default_value: string
  scope?: string | null
  created_at: string
}

type CommercialPlansResponse = {
  ok: boolean
  items: CommercialPlan[]
  prices: CommercialPlanPrice[]
  entitlements: CommercialPlanEntitlement[]
  defaults: CommercialPlanDefault[]
}

type PlatformAdminStatusResponse = { is_platform_admin?: boolean }

export default async function CommercialPlansSettingsPage() {
  const access = await callCrmApi<PlatformAdminStatusResponse>("/admin/me/platform-admin", {
    withUserToken: true,
  })
  if (!access.ok || !access.data.is_platform_admin) {
    redirect("/unauthorized")
  }

  const response = await callCrmApi<CommercialPlansResponse>("/admin/commercial-plans", {
    organizacionId: null,
    withUserToken: true,
  })

  const items = response.ok ? response.data.items : []
  const prices = response.ok ? response.data.prices : []
  const entitlements = response.ok ? response.data.entitlements : []
  const defaults = response.ok ? response.data.defaults : []
  const errors = response.ok ? [] : [response.error]

  return (
    <AppViewLayout title="Settings · Commercial Plans" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Plataforma
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Planes comerciales</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Catálogo maestro de lo que se vende. Aquí puedes crear, editar y desactivar planes sin tocar la lógica
            de billing ni la config operativa del tenant.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/tenants">Volver a tenants</Link>
          </Button>
        </div>

        <SettingsErrorCallout title="No se pudo recuperar el catálogo" messages={errors} />

        <CommercialPlansManager plans={items} prices={prices} entitlements={entitlements} defaults={defaults} />

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Notas de operación</CardTitle>
            <CardDescription>Reglas mínimas para no romper el catálogo comercial.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>No borres físicamente un plan si ya fue usado en producción.</p>
            <p>Si cambias el comportamiento comercial de un plan, desactívalo o versiona el precio/entitlement.</p>
            <p>Los cambios aquí son globales para la plataforma, no por tenant.</p>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
