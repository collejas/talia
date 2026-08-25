import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Eventos webhook · Comercial" }
export const dynamic = "force-dynamic"

type BillingEvent = { id: string; tenant_name: string; tenant_id: string; stripe_event_id: string; stripe_event_type: string; stripe_subscription_id?: string | null; event_created_at?: string | null; processed_at?: string | null; processing_error?: string | null; created_at: string }

function date(value?: string | null) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("es-MX") }

export default async function CommercialBillingEventsPage() {
  const response = await callCrmApi<{ ok: boolean; items: BillingEvent[]; limit: number }>("/admin/commercial-billing/events?limit=100", { organizacionId: null, withUserToken: true })
  if (!response.ok) redirect("/unauthorized")
  const items = response.data.items
  const failed = items.filter((item) => Boolean(item.processing_error)).length

  return (
    <AppViewLayout title="Eventos webhook" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Billing</p><h1 className="text-3xl font-semibold tracking-tight">Eventos webhook</h1><p className="max-w-3xl text-sm text-muted-foreground">Trazabilidad de los eventos recibidos y procesados por Stripe. Se muestran los últimos {response.data.limit} registros.</p></div><Button asChild variant="outline"><Link href="/settings/commercial/billing">Volver a Billing</Link></Button></header>
        <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardDescription>Eventos visibles</CardDescription><CardTitle>{items.length}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Con error de procesamiento</CardDescription><CardTitle>{failed}</CardTitle></CardHeader></Card></div>
        <Card><CardHeader><CardTitle>Historial de recepción</CardTitle><CardDescription>La vista no expone payloads completos ni permite reprocesar eventos.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border border-border/60"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Tenant</TableHead><TableHead>Suscripción</TableHead><TableHead>Estado</TableHead><TableHead>Stripe event ID</TableHead></TableRow></TableHeader><TableBody>{items.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Todavía no hay eventos webhook registrados.</TableCell></TableRow> : items.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-xs">{date(item.event_created_at ?? item.created_at)}</TableCell><TableCell className="font-mono text-xs">{item.stripe_event_type}</TableCell><TableCell><Link className="font-medium hover:underline" href={`/settings/tenants/${item.tenant_id}`}>{item.tenant_name}</Link></TableCell><TableCell className="font-mono text-xs">{item.stripe_subscription_id ?? "—"}</TableCell><TableCell>{item.processing_error ? <Badge variant="destructive">Error</Badge> : item.processed_at ? <Badge variant="secondary">Procesado</Badge> : <Badge variant="outline">Pendiente</Badge>}{item.processing_error ? <div className="mt-1 max-w-xs text-xs text-destructive">{item.processing_error}</div> : null}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{item.stripe_event_id}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      </div>
    </AppViewLayout>
  )
}
