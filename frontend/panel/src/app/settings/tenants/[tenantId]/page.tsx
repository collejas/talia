import type { Metadata } from "next"
import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { callCrmApi } from "@/lib/api/crm"

import {
  TenantCalendarSettings,
  TenantConfigEditor,
  TenantRoutingManager,
  TenantSecretsManager,
  TenantWebchatSettings,
  type RouteItem,
  type SecretItem,
} from "./tenant-forms"

export const metadata: Metadata = {
  title: "Tenant · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type TenantConfigResponse = { ok: boolean; organizacion_id: string; config: Record<string, unknown> }
type TenantSecretsResponse = { ok: boolean; items: Array<SecretItem & { id?: string }> }
type TenantRoutesResponse = { ok: boolean; items: Array<RouteItem & { id: string }> }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getNestedRecord(root: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = root[key]
  return asRecord(value)
}

function getNestedString(root: Record<string, unknown>, key: string): string | undefined {
  const value = root[key]
  return typeof value === "string" ? value : undefined
}

function getNestedNumber(root: Record<string, unknown>, key: string): number | undefined {
  const value = root[key]
  return typeof value === "number" ? value : undefined
}

function getNestedBoolean(root: Record<string, unknown>, key: string): boolean | undefined {
  const value = root[key]
  return typeof value === "boolean" ? value : undefined
}

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
  const config = configResp.ok ? asRecord(configResp.data.config ?? {}) ?? {} : {}
  const webchatConfig = getNestedRecord(config, "webchat") ?? {}
  const webchatCalendar = getNestedRecord(webchatConfig, "calendar") ?? {}
  const webchatRoute = routes.find((r) => r.canal === "webchat")?.clave ?? ""
  const features = getNestedRecord(config, "features")
  const webchatFeature = features ? getNestedRecord(features, "webchat") : null
  const webchatEnabled = webchatFeature ? Boolean(getNestedBoolean(webchatFeature, "enabled")) : false
  const calendarConfig = getNestedRecord(config, "calendar") ?? {}
  const calendarInitialValues = {
    calendar_resource_id: getNestedString(webchatCalendar, "resource_id") ?? "",
    calendar_timezone: getNestedString(webchatCalendar, "timezone") ?? "",
    calendar_default_days: getNestedNumber(webchatCalendar, "default_days"),
    calendar_hold_minutes: getNestedNumber(webchatCalendar, "hold_minutes"),
    calendar_provider: getNestedString(calendarConfig, "provider") ?? "",
    calendar_server_url: getNestedString(calendarConfig, "server_url") ?? "",
    calendar_server_url_alternate: getNestedString(calendarConfig, "server_url_alternate") ?? "",
    calendar_server_port: getNestedNumber(calendarConfig, "server_port"),
    calendar_full_calendar_url: getNestedString(calendarConfig, "full_calendar_url") ?? "",
    calendar_full_contact_list_url: getNestedString(calendarConfig, "full_contact_list_url") ?? "",
  }

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
            <Tabs defaultValue="webchat">
              <TabsList className="grid grid-cols-5">
                <TabsTrigger value="webchat">Webchat</TabsTrigger>
                <TabsTrigger value="calendar">Calendario</TabsTrigger>
                <TabsTrigger value="config">Config (avanzado)</TabsTrigger>
                <TabsTrigger value="routing">Routing</TabsTrigger>
                <TabsTrigger value="secrets">Secretos</TabsTrigger>
              </TabsList>
              <TabsContent value="webchat" className="pt-4">
                <TenantWebchatSettings
                  tenantId={tenantId}
                  initialValues={{
                    enabled: webchatEnabled,
                    assistant_id: getNestedString(webchatConfig, "assistant_id") ?? "",
                    prompt_version: getNestedString(webchatConfig, "prompt_version") ?? "",
                    inactivity_hours: getNestedNumber(webchatConfig, "inactivity_hours"),
                    persist_session: getNestedBoolean(webchatConfig, "persist_session"),
                    reengage_minutes: getNestedNumber(webchatConfig, "reengage_minutes"),
                    reengage_max_attempts: getNestedNumber(webchatConfig, "reengage_max_attempts"),
                    escalate_minutes: getNestedNumber(webchatConfig, "escalate_minutes"),
                    webchat_alias: webchatRoute,
                  }}
                />
              </TabsContent>
              <TabsContent value="calendar" className="pt-4">
                <TenantCalendarSettings tenantId={tenantId} initialValues={calendarInitialValues} />
              </TabsContent>
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
