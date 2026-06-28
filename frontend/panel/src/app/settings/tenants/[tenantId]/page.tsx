import type { Metadata } from "next"
import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { callCrmApi } from "@/lib/api/crm"
import { activateTenantContextAndRedirectAction } from "./actions"

import {
  TenantCalendarSettings,
  TenantMailSettings,
  TenantMessengerSettings,
  TenantCommercialStateForm,
  TenantModuleFlagsForm,
  TenantOrganizationInfoForm,
  TenantProfilingToggleForm,
  TenantSecretsManager,
  TenantWebchatSettings,
  TenantBusquedaSettings,
  TenantOpenaiSettings,
  TenantTwilioSettings,
  TenantWhatsAppSettings,
  TenantWhatsAppProspeccionSettings,
  type RouteItem,
  type SecretItem,
  type TenantOrganizationInfo,
  type WhatsAppInitialValues,
} from "./tenant-forms"

export const metadata: Metadata = {
  title: "Tenant · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type TenantConfigResponse = { ok: boolean; organizacion_id: string; config: Record<string, unknown> }
type TenantSecretsResponse = { ok: boolean; items: Array<SecretItem & { id?: string }> }
type TenantRoutesResponse = { ok: boolean; items: Array<RouteItem & { id: string }> }
type TenantDetailResponse = { ok: boolean; tenant: TenantOrganizationInfo }
type CommercialPlanSummary = {
  id: string
  code: string
  name: string
  active: boolean
}
type PlatformAdminStatusResponse = { is_platform_admin?: boolean }

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

function getNestedStringArray(root: Record<string, unknown>, key: string): string[] | undefined {
  const value = root[key]
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
  return items.length ? items : undefined
}

function getAccessBadgeVariant(status?: string | null) {
  switch (status) {
    case "active":
    case "internal_free":
      return "secondary" as const
    case "grace":
      return "outline" as const
    case "manual_review":
      return "default" as const
    case "blocked":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

function getAccessStatusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "Activo"
    case "grace":
      return "Gracia"
    case "blocked":
      return "Bloqueado"
    case "manual_review":
      return "Revisión"
    case "internal_free":
      return "Interno"
    default:
      return status ?? "—"
  }
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
  const plansResp = await callCrmApi<{ ok: boolean; items: CommercialPlanSummary[] }>("/admin/commercial-plans", {
    organizacionId: null,
    withUserToken: true,
  })
  const infoResp = await callCrmApi<TenantDetailResponse>(`/admin/tenants/${tenantId}`, {
    organizacionId: null,
    withUserToken: true,
  })
  const platformAdminResp = await callCrmApi<PlatformAdminStatusResponse>("/admin/me/platform-admin", {
    organizacionId: null,
    withUserToken: true,
  })

  const errors: string[] = []
  if (!configResp.ok) errors.push(configResp.error)
  if (!secretsResp.ok) errors.push(secretsResp.error)
  if (!routesResp.ok) errors.push(routesResp.error)
  if (!plansResp.ok) errors.push(plansResp.error)
  if (!infoResp.ok) errors.push(infoResp.error)

  const secrets = secretsResp.ok ? secretsResp.data.items : []
  const routes = routesResp.ok ? routesResp.data.items : []
  const commercialPlans = plansResp.ok ? plansResp.data.items : []
  const config = configResp.ok ? asRecord(configResp.data.config ?? {}) ?? {} : {}
  const tenantInfo: TenantOrganizationInfo | null = infoResp.ok ? infoResp.data.tenant : null
  const isPlatformAdmin = Boolean(platformAdminResp.ok && platformAdminResp.data?.is_platform_admin)
  const webchatConfig = getNestedRecord(config, "webchat") ?? {}
  const webchatCalendar = getNestedRecord(webchatConfig, "calendar") ?? {}
  const webchatRoute = routes.find((r) => r.canal === "webchat")?.clave ?? ""
  const features = getNestedRecord(config, "features")
  const webchatFeature = features ? getNestedRecord(features, "webchat") : null
  const webchatEnabled = webchatFeature ? Boolean(getNestedBoolean(webchatFeature, "enabled")) : false
  const calendarConfig = getNestedRecord(config, "calendar") ?? {}
  const zoomConfig = getNestedRecord(config, "zoom") ?? {}
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
    zoom_enabled: getNestedBoolean(zoomConfig, "enabled") ?? false,
    zoom_host_email: getNestedString(zoomConfig, "host_email") ?? "",
    zoom_default_duration_minutes: getNestedNumber(zoomConfig, "default_duration_minutes"),
    zoom_auto_create_meeting: getNestedBoolean(zoomConfig, "auto_create_meeting") ?? true,
  }
  const mailConfig = getNestedRecord(config, "mail") ?? {}
  const brevoConfig = getNestedRecord(config, "brevo") ?? {}
  const mailInitialValues = {
    mail_incoming_server: getNestedString(mailConfig, "incoming_server"),
    mail_incoming_port_imap: getNestedNumber(mailConfig, "incoming_port_imap"),
    mail_outgoing_server: getNestedString(mailConfig, "outgoing_server"),
    mail_outgoing_port_smtp: getNestedNumber(mailConfig, "outgoing_port_smtp"),
    mail_use_ssl: getNestedBoolean(mailConfig, "use_ssl"),
    mail_use_tls: getNestedBoolean(mailConfig, "use_tls"),
    brevo_base_url: getNestedString(brevoConfig, "base_url"),
    brevo_sender_email: getNestedString(brevoConfig, "sender_email"),
    brevo_sender_name: getNestedString(brevoConfig, "sender_name"),
  }
  const twilioConfig = getNestedRecord(config, "twilio") ?? {}
  const voiceConfig = getNestedRecord(config, "voice") ?? {}
  const twilioInitialValues = {
    twilio_phone_number: getNestedString(twilioConfig, "phone_number"),
    twilio_phone_number_sid: getNestedString(twilioConfig, "phone_number_sid"),
    twilio_validate_signatures: getNestedBoolean(twilioConfig, "validate_signatures") ?? true,
    voice_webhook_path: getNestedString(voiceConfig, "webhook_path") ?? "",
    voice_full_duplex: getNestedBoolean(voiceConfig, "full_duplex") ?? true,
    voice_debug_verbose: getNestedBoolean(voiceConfig, "debug_verbose") ?? false,
    voice_debug_energy_every_n: getNestedNumber(voiceConfig, "energy_every_n"),
  }
  const whatsappConfig = getNestedRecord(config, "whatsapp") ?? {}
  const whatsappTwilioConfig = getNestedRecord(whatsappConfig, "twilio") ?? {}
  const whatsappMetaConfig = getNestedRecord(whatsappConfig, "meta") ?? {}
  const whatsappTemplates = getNestedRecord(whatsappConfig, "templates") ?? {}
  const whatsappTemplatesMeta = getNestedRecord(whatsappConfig, "templates_meta") ?? {}
  const whatsappProspeccionConfig = getNestedRecord(whatsappConfig, "prospeccion") ?? {}
  const whatsappInitialValues: WhatsAppInitialValues = {
    whatsapp_provider: (getNestedString(whatsappConfig, "provider") ?? "meta") as "twilio" | "meta",
    whatsapp_prompt_id: getNestedString(whatsappConfig, "prompt_id"),
    whatsapp_prompt_version: getNestedString(whatsappConfig, "prompt_version"),
    whatsapp_welcome_document_prompt_version: getNestedString(
      whatsappConfig,
      "welcome_document_prompt_version",
    ),
    whatsapp_location_href: getNestedString(whatsappConfig, "location_href"),
    whatsapp_assistant_id: getNestedString(whatsappConfig, "assistant_id"),
    whatsapp_inactivity_minutes: getNestedNumber(whatsappConfig, "inactivity_minutes"),
    whatsapp_reengage_minutes: getNestedNumber(whatsappConfig, "reengage_minutes"),
    whatsapp_reengage_max_attempts: getNestedNumber(whatsappConfig, "reengage_max_attempts"),
    whatsapp_escalate_minutes: getNestedNumber(whatsappConfig, "escalate_minutes"),
    whatsapp_twilio_phone_number: getNestedString(whatsappTwilioConfig, "phone_number"),
    whatsapp_twilio_phone_number_sid: getNestedString(whatsappTwilioConfig, "phone_number_sid"),
    whatsapp_twilio_validate_signatures: getNestedBoolean(whatsappTwilioConfig, "validate_signatures") ?? true,
    whatsapp_meta_phone_number_id: getNestedString(whatsappMetaConfig, "phone_number_id"),
    whatsapp_meta_graph_api_version: getNestedString(whatsappMetaConfig, "graph_api_version") ?? "v21.0",
    whatsapp_template_sales: getNestedString(whatsappTemplates, "sales"),
    whatsapp_template_appointment: getNestedString(whatsappTemplates, "appointment"),
    whatsapp_template_cancel: getNestedString(whatsappTemplates, "cancel"),
    whatsapp_template_sales_meta_name:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "sales") ?? {}, "name"),
    whatsapp_template_sales_meta_language:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "sales") ?? {}, "language"),
    whatsapp_template_appointment_meta_name:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "appointment") ?? {}, "name"),
    whatsapp_template_appointment_meta_language:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "appointment") ?? {}, "language"),
    whatsapp_template_cancel_meta_name:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "cancel") ?? {}, "name"),
    whatsapp_template_cancel_meta_language:
      getNestedString(getNestedRecord(whatsappTemplatesMeta, "cancel") ?? {}, "language"),
    whatsapp_template_prospeccion_sids: (getNestedStringArray(whatsappTemplates, "prospeccion") ?? []).join("\n"),
    whatsapp_prospeccion_prompt_id: getNestedString(whatsappProspeccionConfig, "prompt_id"),
    whatsapp_prospeccion_prompt_version: getNestedString(whatsappProspeccionConfig, "prompt_version"),
  }
  const messengerConfig = getNestedRecord(config, "messenger") ?? {}
  const messengerInitialValues = {
    messenger_prompt_id: getNestedString(messengerConfig, "prompt_id"),
    messenger_prompt_version: getNestedString(messengerConfig, "prompt_version"),
    messenger_assistant_id: getNestedString(messengerConfig, "assistant_id"),
    messenger_inactivity_hours: getNestedNumber(messengerConfig, "inactivity_hours"),
  }
  const openaiConfig = getNestedRecord(config, "openai") ?? {}
  const openaiGeneralConfig = getNestedRecord(openaiConfig, "general") ?? {}
  const openaiVoiceConfig = getNestedRecord(openaiConfig, "voice") ?? {}
  const openaiInitialValues = {
    general_project_id: getNestedString(openaiGeneralConfig, "project_id"),
    voice_prompt_id: getNestedString(openaiVoiceConfig, "prompt_id"),
    voice_prompt_version: getNestedString(openaiVoiceConfig, "prompt_version"),
    voice_model: getNestedString(openaiVoiceConfig, "model"),
    voice_max_tokens: getNestedNumber(openaiVoiceConfig, "max_tokens"),
    voice_stt_model: getNestedString(openaiVoiceConfig, "stt_model"),
  }
  const denueConfig = getNestedRecord(config, "denue") ?? {}
  const googlePlacesConfig = getNestedRecord(config, "google_places") ?? {}
  const scoringConfig = getNestedRecord(config, "scoring_bienes_raices") ?? {}
  const profilingEnabled = getNestedBoolean(scoringConfig, "profiling_enabled") ?? true
  const searchInitialValues = {
    denue_base_url: getNestedString(denueConfig, "base_url"),
    google_nearby_url: getNestedString(googlePlacesConfig, "nearby_url"),
    google_text_url: getNestedString(googlePlacesConfig, "text_url"),
    google_details_url: getNestedString(googlePlacesConfig, "details_url"),
    google_field_mask: getNestedString(googlePlacesConfig, "field_mask"),
    google_details_field_mask: getNestedString(googlePlacesConfig, "details_field_mask"),
    google_language_code: getNestedString(googlePlacesConfig, "language_code"),
    google_region_code: getNestedString(googlePlacesConfig, "region_code"),
    google_grid_max_tile_radius_m: getNestedNumber(googlePlacesConfig, "grid_max_tile_radius_m"),
    google_pause_between_pages: getNestedNumber(googlePlacesConfig, "pause_between_pages"),
    google_dense_grid_max_tile_radius_m: getNestedNumber(googlePlacesConfig, "dense_grid_max_tile_radius_m"),
    google_dense_pause_between_pages: getNestedNumber(googlePlacesConfig, "dense_pause_between_pages"),
    google_dense_max_results: getNestedNumber(googlePlacesConfig, "dense_max_results"),
  }
  const secretKeys = new Set(secrets.map((item) => item.clave.trim().toLowerCase()))
  const hasGeneralApiKey = secretKeys.has("openai.general.api_key")
  const hasVoiceApiKey = secretKeys.has("openai.voice.api_key")
  const hasBrevoApiKey = secretKeys.has("brevo.api_key")
  const hasDenueToken = secretKeys.has("denue.token")
  const hasGoogleApiKey = secretKeys.has("google.places_api_key")

  return (
    <AppViewLayout title="Settings · Tenant" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/tenants">Volver</Link>
            </Button>
            {isPlatformAdmin ? (
              <form action={activateTenantContextAndRedirectAction}>
                <input type="hidden" name="tenant_id" value={tenantId} />
                <Button size="sm" type="submit">
                  Operar este tenant
                </Button>
              </form>
            ) : null}
          </div>
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
            <CardTitle>Datos generales</CardTitle>
            <CardDescription>Actualiza los campos de `public.organizaciones` del tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <TenantOrganizationInfoForm tenantId={tenantId} info={tenantInfo} />
          </CardContent>
        </Card>

        {isPlatformAdmin ? (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Estado comercial</CardTitle>
              <CardDescription>
                Cambia el plan, el estado de acceso o el estado de cobro sin tocar los datos generales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TenantCommercialStateForm tenantId={tenantId} info={tenantInfo} plans={commercialPlans} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Resumen comercial</CardTitle>
            <CardDescription>Plan, estado de cobro y acceso que controla qué puede usar este tenant.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Plan</p>
              <p className="text-sm font-semibold">
                {tenantInfo?.commercial_plan_name ?? tenantInfo?.commercial_plan_code ?? "Sin plan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tenantInfo?.commercial_plan_id ? `ID ${tenantInfo.commercial_plan_id}` : "No asignado"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Acceso</p>
              <Badge variant={getAccessBadgeVariant(tenantInfo?.commercial_access_status)}>
                {getAccessStatusLabel(tenantInfo?.commercial_access_status)}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Billing</p>
              <p className="text-sm font-semibold">{tenantInfo?.billing_status ?? "Sin estado"}</p>
              <p className="text-xs text-muted-foreground">
                {tenantInfo?.billing_provider ? `Proveedor: ${tenantInfo.billing_provider}` : "Proveedor no asignado"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Tenant comercial</p>
              <p className="text-sm font-semibold">
                {tenantInfo?.commercial_access_status ? "Configurado" : "Pendiente"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tenantInfo?.commercial_access_status === "internal_free"
                  ? "Alta interna sin Stripe."
                  : "Usa la misma capa que Stripe para control de acceso."}
              </p>
            </div>
          </CardContent>
        </Card>

        {isPlatformAdmin ? (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Módulos</CardTitle>
              <CardDescription>Controla qué áreas funcionales verá y podrá usar este tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              <TenantModuleFlagsForm tenantId={tenantId} config={config} />
            </CardContent>
          </Card>
        ) : null}


        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Calificación IA</CardTitle>
            <CardDescription>
              Control maestro del perfilamiento para este tenant. Si está apagado, la vista
              `Settings / Calificación IA` queda bloqueada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPlatformAdmin ? (
              <TenantProfilingToggleForm tenantId={tenantId} profilingEnabled={profilingEnabled} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Solo un administrador maestro puede cambiar este estado.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>{tenantInfo?.nombre ?? "Organización"}</CardTitle>
            <CardDescription>
              ID: {tenantId}
              {tenantInfo?.nombre ? ` · ${tenantInfo.nombre}` : ""}
            </CardDescription>
          </CardHeader>
        <CardContent>
          <Tabs defaultValue="webchat">
          <TabsList className="grid grid-cols-10">
            <TabsTrigger value="webchat">Webchat</TabsTrigger>
            <TabsTrigger value="calendar">Calendario</TabsTrigger>
            <TabsTrigger value="mail">Correo</TabsTrigger>
            <TabsTrigger value="twilio">Twilio</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="whatsapp-prosp">Whats-Prosp</TabsTrigger>
            <TabsTrigger value="messenger">Messenger</TabsTrigger>
            <TabsTrigger value="busqueda">Búsqueda</TabsTrigger>
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
            <TabsTrigger value="secrets">Secretos</TabsTrigger>
            </TabsList>
            <TabsContent value="webchat" className="pt-4">
              <TenantWebchatSettings
                tenantId={tenantId}
                initialValues={{
                  enabled: webchatEnabled,
                  assistant_id: getNestedString(webchatConfig, "assistant_id") ?? "",
                  prompt_version: getNestedString(webchatConfig, "prompt_version") ?? "",
                  inactivity_minutes:
                    getNestedNumber(webchatConfig, "inactivity_minutes") ??
                    (() => {
                      const hours = getNestedNumber(webchatConfig, "inactivity_hours")
                      return typeof hours === "number" ? hours * 60 : undefined
                    })(),
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
            <TabsContent value="mail" className="pt-4">
              <TenantMailSettings
                tenantId={tenantId}
                initialValues={mailInitialValues}
                hasBrevoApiKey={hasBrevoApiKey}
              />
            </TabsContent>
            <TabsContent value="twilio" className="pt-4">
              <TenantTwilioSettings tenantId={tenantId} initialValues={twilioInitialValues} />
            </TabsContent>
            <TabsContent value="whatsapp" className="pt-4">
              <TenantWhatsAppSettings
                tenantId={tenantId}
                initialValues={whatsappInitialValues}
                routes={routes}
              />
            </TabsContent>
            <TabsContent value="whatsapp-prosp" className="pt-4">
              <TenantWhatsAppProspeccionSettings tenantId={tenantId} initialValues={whatsappInitialValues} />
            </TabsContent>
            <TabsContent value="messenger" className="pt-4">
              <TenantMessengerSettings
                tenantId={tenantId}
                initialValues={messengerInitialValues}
                routes={routes}
              />
            </TabsContent>
            <TabsContent value="busqueda" className="pt-4">
              <TenantBusquedaSettings
                tenantId={tenantId}
                initialValues={searchInitialValues}
                hasToken={hasDenueToken}
                hasGoogleApiKey={hasGoogleApiKey}
              />
            </TabsContent>
            <TabsContent value="openai" className="pt-4">
              <TenantOpenaiSettings
                tenantId={tenantId}
                initialValues={openaiInitialValues}
                hasGeneralApiKey={hasGeneralApiKey}
                hasVoiceApiKey={hasVoiceApiKey}
              />
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
