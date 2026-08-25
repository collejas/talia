import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Billing / Stripe · Comercial" }
export const dynamic = "force-dynamic"

export default async function CommercialBillingPage() {
  const access = await callCrmApi<{ ok: boolean }>("/admin/commercial-plans", { organizacionId: null, withUserToken: true })
  if (!access.ok) redirect("/unauthorized")
  return <AppViewLayout title="Billing / Stripe" withThemeToggle={false} contentClassName="px-0"><div className="flex flex-col gap-6 px-4 py-6 lg:px-6"><header className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Billing</p><h1 className="text-3xl font-semibold tracking-tight">Billing / Stripe</h1><p className="max-w-3xl text-sm text-muted-foreground">Aquí vivirán la operación de suscripciones, webhooks y estados de cobro.</p></header><Card><CardHeader><CardTitle>Operación de cobro</CardTitle><CardDescription>La conexión operativa de Stripe se implementará en esta sección.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/settings/commercial">Volver a Comercial</Link></Button></CardContent></Card></div></AppViewLayout>
}
