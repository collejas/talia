import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Billing / Stripe · Comercial" }
export const dynamic = "force-dynamic"
export const revalidate = 0

type BillingTenant = {
  id: string
  nombre: string
  commercial_plan_code?: string | null
  commercial_plan_name?: string | null
  billing_provider?: string | null
  billing_status?: string | null
  access_status?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_price_id?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean | null
}

function statusVariant(status?: string | null) {
  if (status === "active" || status === "trialing") return "secondary" as const
  if (status === "past_due" || status === "unpaid" || status === "blocked") return "destructive" as const
  return "outline" as const
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-MX")
}

export default async function CommercialBillingPage() {
  const response = await callCrmApi<{ ok: boolean; items: BillingTenant[] }>("/admin/commercial-billing/tenants", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) redirect("/unauthorized")

  const items = response.data.items
  const active = items.filter((item) => item.billing_status === "active" || item.billing_status === "trialing").length
  const attention = items.filter((item) => ["past_due", "unpaid", "blocked"].includes(item.billing_status ?? "")).length

  return (
    <AppViewLayout title="Billing / Stripe" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Billing</p>
            <h1 className="text-3xl font-semibold tracking-tight">Billing / Stripe</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">Consulta el estado global de cobro y acceso de los tenants. Los cambios de billing continúan siendo responsabilidad del backend y Stripe.</p>
          </div>
          <Button asChild variant="outline"><Link href="/settings/commercial">Volver a Comercial</Link></Button>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardDescription>Tenants registrados</CardDescription><CardTitle>{items.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Billing activo o trial</CardDescription><CardTitle>{active}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Requieren atención</CardDescription><CardTitle>{attention}</CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Estado de cobro por tenant</CardTitle><CardDescription>Lectura global para el owner del tenant maestro.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <SettingsErrorCallout title="No se pudo recuperar billing" messages={[]} />
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Plan</TableHead><TableHead>Proveedor</TableHead><TableHead>Billing</TableHead><TableHead>Acceso</TableHead><TableHead>Periodo</TableHead><TableHead>Stripe</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No hay tenants para mostrar.</TableCell></TableRow> : items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell><Link className="font-medium hover:underline" href={`/settings/tenants/${item.id}`}>{item.nombre}</Link></TableCell>
                      <TableCell>{item.commercial_plan_name ?? item.commercial_plan_code ?? "—"}</TableCell>
                      <TableCell>{item.billing_provider ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(item.billing_status)}>{item.billing_status ?? "Sin estado"}</Badge></TableCell>
                      <TableCell><Badge variant={statusVariant(item.access_status)}>{item.access_status ?? "—"}</Badge></TableCell>
                      <TableCell>{formatDate(item.current_period_end)}{item.cancel_at_period_end ? <div className="text-xs text-muted-foreground">Cancela al cierre</div> : null}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.stripe_subscription_id ?? item.stripe_customer_id ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
