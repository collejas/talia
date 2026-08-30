import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Comercial · Settings" }
export const dynamic = "force-dynamic"

type CommercialPlansResponse = { ok: boolean; items: Array<{ active: boolean }> }

export default async function CommercialSettingsPage() {
  const response = await callCrmApi<CommercialPlansResponse>("/admin/commercial-plans", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) redirect("/unauthorized")
  const activePlans = response.data.items.filter((plan) => plan.active).length

  return (
    <AppViewLayout title="Comercial" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Plataforma / Comercial</p>
          <h1 className="text-3xl font-semibold tracking-tight">Administración comercial</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Administra los planes que Tal-IA vende y la operación de cobro con Stripe desde la organización principal.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader><CardTitle>Planes comerciales</CardTitle><CardDescription>{activePlans} planes activos.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/settings/commercial/plans">Administrar planes</Link></Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Billing / Stripe</CardTitle><CardDescription>Suscripciones, webhooks y estados de cobro.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/settings/commercial/billing">Abrir billing</Link></Button></CardContent></Card>
        </div>
      </div>
    </AppViewLayout>
  )
}
