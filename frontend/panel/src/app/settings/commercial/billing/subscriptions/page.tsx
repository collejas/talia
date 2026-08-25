import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Suscripciones · Comercial" }
export const dynamic = "force-dynamic"

type Subscription = {
  id: string
  nombre: string
  commercial_plan_name?: string | null
  billing_status?: string | null
  access_status?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_price_id?: string | null
  current_period_end?: string | null
  trial_ends_at?: string | null
  cancel_at_period_end?: boolean | null
  last_stripe_event_id?: string | null
}

function variant(status?: string | null) {
  if (status === "active" || status === "trialing") return "secondary" as const
  if (["past_due", "unpaid", "blocked"].includes(status ?? "")) return "destructive" as const
  return "outline" as const
}

function date(value?: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("es-MX")
}

export default async function CommercialSubscriptionsPage() {
  const response = await callCrmApi<{ ok: boolean; items: Subscription[] }>("/admin/commercial-billing/subscriptions", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) redirect("/unauthorized")
  const items = response.data.items

  return (
    <AppViewLayout title="Suscripciones" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Billing</p><h1 className="text-3xl font-semibold tracking-tight">Suscripciones</h1><p className="max-w-3xl text-sm text-muted-foreground">Estado operativo de las suscripciones Stripe asociadas a cada tenant.</p></div>
          <Button asChild variant="outline"><Link href="/settings/commercial/billing">Volver a Billing</Link></Button>
        </header>
        <Card><CardHeader><CardTitle>{items.length} suscripciones</CardTitle><CardDescription>Consulta global del owner del tenant maestro. Las modificaciones se realizan mediante el flujo autorizado de Stripe.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border border-border/60"><Table><TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Plan</TableHead><TableHead>Billing</TableHead><TableHead>Acceso</TableHead><TableHead>Periodo</TableHead><TableHead>Stripe</TableHead><TableHead>Último evento</TableHead></TableRow></TableHeader><TableBody>{items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No hay suscripciones Stripe registradas.</TableCell></TableRow> : items.map((item) => <TableRow key={item.id}><TableCell><Link className="font-medium hover:underline" href={`/settings/tenants/${item.id}`}>{item.nombre}</Link></TableCell><TableCell>{item.commercial_plan_name ?? "—"}</TableCell><TableCell><Badge variant={variant(item.billing_status)}>{item.billing_status ?? "Sin estado"}</Badge></TableCell><TableCell><Badge variant={variant(item.access_status)}>{item.access_status ?? "—"}</Badge></TableCell><TableCell>{date(item.current_period_end)}{item.cancel_at_period_end ? <div className="text-xs text-muted-foreground">Cancela al cierre</div> : null}{item.trial_ends_at ? <div className="text-xs text-muted-foreground">Trial: {date(item.trial_ends_at)}</div> : null}</TableCell><TableCell className="text-xs text-muted-foreground">{item.stripe_subscription_id ?? "—"}<div>{item.stripe_price_id ?? ""}</div></TableCell><TableCell className="text-xs text-muted-foreground">{item.last_stripe_event_id ?? "—"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      </div>
    </AppViewLayout>
  )
}
