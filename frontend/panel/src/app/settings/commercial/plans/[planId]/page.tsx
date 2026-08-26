import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { callCrmApi } from "@/lib/api/crm"

import { CommercialPlansManager } from "../../../commercial-plans/commercial-plans-manager.client"

export const metadata: Metadata = { title: "Detalle de plan · Comercial" }
export const dynamic = "force-dynamic"

type Plan = { id: string; code: string; name: string; description?: string | null; active: boolean; sort_order: number; created_at: string; updated_at: string }
type Price = { id: string; plan_id: string; billing_provider: string; provider_product_id: string; provider_price_id: string; currency: string; billing_interval: string; amount_cents: number; active: boolean }
type LicensePrice = { id: string; code: string; name: string; billing_provider: string; provider_product_id: string; provider_price_id: string; currency: string; billing_interval: string; amount_cents: number; active: boolean }
type Entitlement = { id: string; plan_id: string; entitlement_key: string; value_type: string; enabled: boolean; limit_value?: number | null; value_text?: string | null; value_json?: unknown; limit_unit?: string | null; scope?: string | null; created_at: string }
type Default = { id: string; plan_id: string; default_key: string; default_value: string; scope?: string | null; created_at: string }
type Response = { ok: boolean; items: Plan[]; prices: Price[]; entitlements: Entitlement[]; defaults: Default[]; license_prices: LicensePrice[] }

export default async function CommercialPlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params
  const response = await callCrmApi<Response>("/admin/commercial-plans", { organizacionId: null, withUserToken: true })
  if (!response.ok) redirect("/unauthorized")
  const plan = response.data.items.find((item) => item.id === planId)
  if (!plan) notFound()

  return (
    <AppViewLayout title={`Plan ${plan.name}`} withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Planes</p><h1 className="text-3xl font-semibold tracking-tight">{plan.name}</h1><p className="text-sm text-muted-foreground">{plan.code} · {plan.description || "Sin descripción"}</p></div>
          <Button asChild variant="outline"><Link href="/settings/commercial/plans">Volver al catálogo</Link></Button>
        </header>
        <CommercialPlansManager plans={[plan]} prices={response.data.prices} entitlements={response.data.entitlements} defaults={response.data.defaults} licensePrices={response.data.license_prices} selectedPlanId={plan.id} />
      </div>
    </AppViewLayout>
  )
}
