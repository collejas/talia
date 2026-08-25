import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { callCrmApi } from "@/lib/api/crm"

export const metadata: Metadata = { title: "Conexión Stripe · Comercial" }
export const dynamic = "force-dynamic"

type Connection = {
  connection_status: "ready" | "incomplete"
  api_key_configured: boolean
  api_mode: "test" | "live" | "unknown" | "not_configured"
  webhook_secret_configured: boolean
  webhook_endpoint_path: string
  checkout_success_url_configured: boolean
  checkout_cancel_url_configured: boolean
  portal_return_url_configured: boolean
  api_base_url: string
  webhook_tolerance_seconds: number
}

function Check({ label, configured }: { label: string; configured: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><span className="text-sm">{label}</span><Badge variant={configured ? "secondary" : "destructive"}>{configured ? "Configurado" : "Falta configurar"}</Badge></div>
}

export default async function CommercialStripeConnectionPage() {
  const response = await callCrmApi<Connection>("/admin/commercial-billing/connection", { organizacionId: null, withUserToken: true })
  if (!response.ok) redirect("/unauthorized")
  const connection = response.data

  return (
    <AppViewLayout title="Configuración de conexión Stripe" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Comercial / Billing / Stripe</p><h1 className="text-3xl font-semibold tracking-tight">Configuración de conexión</h1><p className="max-w-3xl text-sm text-muted-foreground">Diagnóstico seguro de la configuración del backend. Las claves secretas nunca se muestran ni se guardan desde esta vista.</p></div><Button asChild variant="outline"><Link href="/settings/commercial/billing">Volver a Billing</Link></Button></header>
        <Card><CardHeader><CardTitle className="flex items-center gap-3">Estado general <Badge variant={connection.connection_status === "ready" ? "secondary" : "destructive"}>{connection.connection_status === "ready" ? "Listo" : "Incompleto"}</Badge></CardTitle><CardDescription>La conexión se configura mediante variables privadas del backend y el Dashboard de Stripe.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Modo detectado</p><p className="font-medium">{connection.api_mode === "test" ? "Pruebas" : connection.api_mode === "live" ? "Producción" : connection.api_mode === "unknown" ? "No identificado" : "Sin clave"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">API base</p><p className="break-all font-mono text-sm">{connection.api_base_url}</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Checklist de configuración</CardTitle><CardDescription>Estos indicadores no revelan valores sensibles.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Check label="Clave API del backend" configured={connection.api_key_configured} /><Check label="Secreto de firma del webhook" configured={connection.webhook_secret_configured} /><Check label="URL de retorno de Checkout" configured={connection.checkout_success_url_configured} /><Check label="URL de cancelación de Checkout" configured={connection.checkout_cancel_url_configured} /><Check label="URL de retorno del portal" configured={connection.portal_return_url_configured} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Webhook</CardTitle><CardDescription>Registra esta ruta en Stripe y selecciona eventos de Checkout, suscripciones e invoices.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="rounded-lg border bg-muted/30 p-3 font-mono">{connection.webhook_endpoint_path}</div><p className="text-muted-foreground">Tolerancia de firma: {connection.webhook_tolerance_seconds} segundos. La URL pública completa depende del dominio y proxy de producción.</p></CardContent></Card>
      </div>
    </AppViewLayout>
  )
}
