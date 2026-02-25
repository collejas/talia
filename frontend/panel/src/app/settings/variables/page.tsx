import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { callCrmApi } from "@/lib/api/crm"

import {
  TenantSettingsActions,
  TenantSettingsActionsProvider,
  TenantOrganizationInfoForm,
  TenantWebchatSettings,
  TenantCalendarSettings,
  TenantMailSettings,
  TenantTwilioSettings,
  TenantWhatsAppSettings,
  TenantWhatsAppProspeccionSettings,
  TenantMessengerSettings,
  TenantBusquedaSettings,
  TenantOpenaiSettings,
  TenantSecretsManager,
  type RouteItem,
  type SecretItem,
  type TenantOrganizationInfo,
} from "../tenants/[tenantId]/tenant-forms"
import * as tenantActionsLib from "./actions"

const tenantActions: TenantSettingsActions = {
  updateTenantConfigAction: tenantActionsLib.updateTenantConfigAction,
  updateTenantInfoAction: tenantActionsLib.updateTenantInfoAction,
  setTenantSecretAction: tenantActionsLib.setTenantSecretAction,
  deleteTenantSecretAction: tenantActionsLib.deleteTenantSecretAction,
  updateWebchatSettingsAction: tenantActionsLib.updateWebchatSettingsAction,
  updateCalendarSettingsAction: tenantActionsLib.updateCalendarSettingsAction,
  updateMailSettingsAction: tenantActionsLib.updateMailSettingsAction,
  updateBusquedaSettingsAction: tenantActionsLib.updateBusquedaSettingsAction,
  updateTwilioSettingsAction: tenantActionsLib.updateTwilioSettingsAction,
  updateWhatsAppSettingsAction: tenantActionsLib.updateWhatsAppSettingsAction,
  updateMessengerSettingsAction: tenantActionsLib.updateMessengerSettingsAction,
  updateOpenaiGeneralAction: tenantActionsLib.updateOpenaiGeneralAction,
  updateOpenaiVoiceAction: tenantActionsLib.updateOpenaiVoiceAction,
  validateTenantAction: tenantActionsLib.validateTenantAction,
  createTenantRouteAction: tenantActionsLib.createTenantRouteAction,
  deleteTenantRouteAction: tenantActionsLib.deleteTenantRouteAction,
}

export const metadata: Metadata = {
  title: "Variables · Settings",
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

type TenantSettingsResponse = {
  organizacion_id: string
  nombre: string
  razon_social?: string | null
  dominio_principal?: string | null
  rfc?: string | null
  pais?: string | null
  estado?: string | null
  ciudad?: string | null
  telefono?: string | null
  sitio_web?: string | null
  estado_onboarding?: string | null
  activo?: boolean | null
  config?: Record<string, unknown> | null
  routes: Array<{ canal: string; clave: string; id: string; activo?: boolean | null }>
}

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

function getNestedStringArray(root: Record<string, unknown>, key: string): string[] | undefined {
  const value = root[key]
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
  return items.length ? items : undefined
}

export default async function SettingsVariablesPage() {
  const settingsResp = await callCrmApi<TenantSettingsResponse>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })
  const secretsResp = await callCrmApi<TenantSecretsResponse>("/tenant/me/secrets", {
    organizacionId: null,
    withUserToken: true,
  })
  const routesResp = await callCrmApi<TenantRoutesResponse>("/tenant/me/routes", {
    organizacionId: null,
    withUserToken: true,
  })

  const errors: string[] = []
  if (!settingsResp.ok) errors.push(settingsResp.error)
  if (!secretsResp.ok) errors.push(secretsResp.error)
  if (!routesResp.ok) errors.push(routesResp.error)

  const data = settingsResp.ok ? settingsResp.data : null

  const secrets = secretsResp.ok ? secretsResp.data.items : []
  const routes = routesResp.ok ? routesResp.data.items : []
  const tenantInfo: TenantOrganizationInfo | null = data
    ? {
        nombre: data.nombre,
        razon_social: data.razon_social,
        rfc: data.rfc,
        pais: data.pais,
        estado: data.estado,
        ciudad: data.ciudad,
        dominio_principal: data.dominio_principal,
        telefono: data.telefono,
        sitio_web: data.sitio_web,
        estado_onboarding: data.estado_onboarding,
        activo: data.activo,
      }
    : null
  const config = data ? asRecord(data.config ?? {}) ?? {} : {}
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
  const whatsappTemplates = getNestedRecord(whatsappConfig, "templates") ?? {}
  const whatsappProspeccionConfig = getNestedRecord(whatsappConfig, "prospeccion") ?? {}
  const whatsappInitialValues = {
    whatsapp_prompt_id: getNestedString(whatsappConfig, "prompt_id"),
    whatsapp_prompt_version: getNestedString(whatsappConfig, "prompt_version"),
    whatsapp_assistant_id: getNestedString(whatsappConfig, "assistant_id"),
    whatsapp_inactivity_minutes: getNestedNumber(whatsappConfig, "inactivity_minutes"),
    whatsapp_reengage_minutes: getNestedNumber(whatsappConfig, "reengage_minutes"),
    whatsapp_reengage_max_attempts: getNestedNumber(whatsappConfig, "reengage_max_attempts"),
    whatsapp_escalate_minutes: getNestedNumber(whatsappConfig, "escalate_minutes"),
    whatsapp_template_sales: getNestedString(whatsappTemplates, "sales"),
    whatsapp_template_appointment: getNestedString(whatsappTemplates, "appointment"),
    whatsapp_template_cancel: getNestedString(whatsappTemplates, "cancel"),
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
  const tenantId = data?.organizacion_id ?? ""

  return (
    <AppViewLayout title="Settings · Tenant" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Configuración / Variables</p>
          <h1 className="text-3xl font-semibold tracking-tight">Variables del tenant</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Esta vista expone las mismas secciones que el administrador general ve en <code>/settings/tenants/{tenantId}</code>.
          </p>
        </header>

        <SettingsErrorCallout title="No se pudo recuperar la información" messages={errors} />

        <TenantSettingsActionsProvider value={tenantActions}>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Datos generales</CardTitle>
              <CardDescription>Actualiza los campos de <code>public.organizaciones</code> del tenant.</CardDescription>
            </CardHeader>
            <CardContent>
            <TenantOrganizationInfoForm tenantId={tenantId} info={tenantInfo} showActiveToggle={false} />
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
                  <TenantCalendarSettings
                    tenantId={tenantId}
                    initialValues={calendarInitialValues}
                    allowResourceIdEdit={false}
                  />
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

        </TenantSettingsActionsProvider>
      </div>
    </AppViewLayout>
  )
}
