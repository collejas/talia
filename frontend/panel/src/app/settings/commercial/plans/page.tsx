import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { callCrmApi } from "@/lib/api/crm"

import { CommercialPlansManager } from "../../commercial-plans/commercial-plans-manager.client"
import { ProspeccionPlanLimits } from "../../commercial-plans/prospeccion-plan-limits.client"

export const metadata: Metadata = { title: "Planes comerciales · Comercial" }
export const dynamic = "force-dynamic"

type Plan = { id: string; code: string; name: string; description?: string | null; active: boolean; sort_order: number; created_at: string; updated_at: string }
type Price = { id: string; plan_id: string; billing_provider: string; provider_product_id: string; provider_price_id: string; currency: string; billing_interval: string; amount_cents: number; active: boolean }
type Entitlement = { id: string; plan_id: string; entitlement_key: string; value_type: string; enabled: boolean; limit_value?: number | null; value_text?: string | null; value_json?: unknown; limit_unit?: string | null; scope?: string | null; created_at: string }
type Default = { id: string; plan_id: string; default_key: string; default_value: string; scope?: string | null; created_at: string }
type Response = { ok: boolean; items: Plan[]; prices: Price[]; entitlements: Entitlement[]; defaults: Default[] }

export default async function CommercialPlansPage() {
  const response = await callCrmApi<Response>("/admin/commercial-plans", { organizacionId: null, withUserToken: true })
  if (!response.ok) redirect("/unauthorized")
  const { items, prices, entitlements, defaults } = response.data

  return (
    <AppViewLayout title="Planes comerciales" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Catálogo</p><h1 className="text-3xl font-semibold tracking-tight">Planes comerciales</h1><p className="max-w-3xl text-sm text-muted-foreground">Configura qué se vende, cuánto cuesta y qué incluye cada plan.</p></header>
        <SettingsErrorCallout title="No se pudo recuperar el catálogo" messages={[]} />
        <CommercialPlansManager plans={items} prices={prices} entitlements={entitlements} defaults={defaults} />
        <ProspeccionPlanLimits plans={items} entitlements={entitlements} />
        <Card><CardHeader><CardTitle>Reglas de operación</CardTitle><CardDescription>El catálogo es global para la plataforma.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>No borres físicamente un plan ya utilizado.</p><p>Versiona precios y desactiva elementos que ya no deban venderse.</p></CardContent></Card>
      </div>
    </AppViewLayout>
  )
}
