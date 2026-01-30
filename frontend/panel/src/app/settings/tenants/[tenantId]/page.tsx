import type { Metadata } from "next"
import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { callCrmApi } from "@/lib/api/crm"

import { TenantConfigEditor, TenantRoutingManager, TenantSecretsManager, type RouteItem, type SecretItem } from "./tenant-forms"

export const metadata: Metadata = {
  title: "Tenant · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type TenantConfigResponse = { ok: boolean; organizacion_id: string; config: Record<string, unknown> }
type TenantSecretsResponse = { ok: boolean; items: Array<SecretItem & { id?: string }> }
type TenantRoutesResponse = { ok: boolean; items: Array<RouteItem & { id: string }> }

export default async function TenantDetailSettingsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params

  const configResp = await callCrmApi<TenantConfigResponse>(`/admin/tenants/${tenantId}/config`, {
    organizacionId: null,
    withUserToken: true,
  })
  const secretsResp = await callCrmApi<TenantSecretsResponse>(`/admin/tenants/${tenantId}/secrets`, {
    organizacionId: null,
    withUserToken: true,
  })
  const routesResp = await callCrmApi<TenantRoutesResponse>(`/admin/tenants/${tenantId}/routes`, {
    organizacionId: null,
    withUserToken: true,
  })

  const errors: string[] = []
  if (!configResp.ok) errors.push(configResp.error)
  if (!secretsResp.ok) errors.push(secretsResp.error)
  if (!routesResp.ok) errors.push(routesResp.error)

  const initialConfigJson = configResp.ok ? JSON.stringify(configResp.data.config ?? {}, null, 2) : "{}"
  const secrets = secretsResp.ok ? secretsResp.data.items : []
  const routes = routesResp.ok ? routesResp.data.items : []

  return (
    <AppViewLayout title="Settings · Tenant" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/tenants">Volver</Link>
          </Button>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Configuración / Plataforma</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tenant</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Configura <code>organizaciones.config</code> (no secreto) y <code>secretos</code> (cifrado, no se muestra el
            valor una vez guardado).
          </p>
        </header>

        <SettingsErrorCallout title="No se pudo recuperar la información" messages={errors} />

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Organización</CardTitle>
            <CardDescription>ID: {tenantId}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="config">
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="config">Config</TabsTrigger>
                <TabsTrigger value="routing">Routing</TabsTrigger>
                <TabsTrigger value="secrets">Secretos</TabsTrigger>
              </TabsList>
              <TabsContent value="config" className="pt-4">
                <TenantConfigEditor tenantId={tenantId} initialConfigJson={initialConfigJson} />
              </TabsContent>
              <TabsContent value="routing" className="pt-4">
                <TenantRoutingManager tenantId={tenantId} routes={routes} />
              </TabsContent>
              <TabsContent value="secrets" className="pt-4">
                <TenantSecretsManager tenantId={tenantId} secrets={secrets} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
