import { redirect } from "next/navigation"

import { callCrmApi } from "@/lib/api/crm"
import {
  TenantCalendarSettings,
  TenantMailSettings,
  TenantOpenaiSettings,
  TenantOrganizationInfoForm,
  TenantSettingsActionsProvider,
  TenantTwilioSettings,
  TenantWebchatSettings,
  TenantWhatsAppSettings,
  type RouteItem,
  type TenantOrganizationInfo,
  type SecretItem,
  type TenantSettingsActions,
} from "@/app/settings/tenants/[tenantId]/tenant-forms"
import * as tenantActionsLib from "@/app/settings/variables/actions"
import { MetaAssistedConnectionPanel } from "@/app/settings/variables/components/meta-assisted-connection-panel"
import { TenantEmailServicePanel, type TenantEmailServiceData } from "@/app/settings/variables/components/tenant-email-service-panel"
import { TenantAiBrandContextPanel } from "@/app/settings/variables/components/tenant-ai-brand-context-panel"
import { WhatsAppAssistantSchedulePanel } from "@/app/settings/variables/components/whatsapp-assistant-schedule-panel"
import { OnboardingStepShell } from "../onboarding-step-shell"
import { OptionalFeatureChoice } from "../optional-feature-choice"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

type AnyRecord = Record<string, unknown>
type Step = { id: string; titulo: string; completado: boolean; estado: string }
type Progress = {
  pasos: Step[]
  paso_actual: string | null
  porcentaje: number
  completado: boolean
  webchat_decision: "pendiente" | "usar" | "no_usar"
  voz_decision: "pendiente" | "usar" | "no_usar"
  zoom_decision: "pendiente" | "usar" | "no_usar"
  correo?: {
    correo_operativo_configurado: boolean
    dominio_registrado: boolean
    dns_validado: boolean
    remitente_configurado: boolean
    servicio_habilitado: boolean
    servicio_validado: boolean
    completado: boolean
  }
}
type Settings = TenantOrganizationInfo & {
  organizacion_id: string
  config?: AnyRecord | null
  ia_descripcion_empresa?: string | null
  ia_productos_servicios?: string | null
  ia_publico_objetivo?: string | null
  ia_propuesta_valor?: string | null
  ia_diferenciadores?: string | null
  ia_restricciones_comerciales?: string | null
  ia_color_primario?: string | null
  ia_color_secundario?: string | null
  ia_color_acento?: string | null
  ia_color_fondo?: string | null
  ia_estilo_visual?: string | null
  ia_radio_bordes?: string | null
}

const actions: TenantSettingsActions = {
  updateTenantConfigAction: tenantActionsLib.updateTenantConfigAction,
  updateTenantInfoAction: tenantActionsLib.updateTenantInfoAction,
  updateTenantCommercialStateAction: tenantActionsLib.updateTenantCommercialStateAction,
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

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {}
}
function text(root: AnyRecord, key: string): string | undefined {
  return typeof root[key] === "string" ? root[key] as string : undefined
}
function number(root: AnyRecord, key: string): number | undefined {
  return typeof root[key] === "number" ? root[key] as number : undefined
}
function bool(root: AnyRecord, key: string): boolean | undefined {
  return typeof root[key] === "boolean" ? root[key] as boolean : undefined
}

function EmailSetupChecklist({ status }: { status?: Progress["correo"] }) {
  const items = [
    ["Correo operativo", status?.correo_operativo_configurado],
    ["Dominio registrado", status?.dominio_registrado],
    ["Registros DNS validados", status?.dns_validado],
    ["Remitente configurado", status?.remitente_configurado],
  ] as const
  return (
    <div className="mb-6 rounded-lg border bg-muted/20 p-4">
      <h2 className="font-medium">Avance de correo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Completa el correo operativo y valida el dominio de envío para dejar lista esta sección.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map(([label, complete]) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className={`flex size-5 items-center justify-center rounded-full border text-xs ${complete ? "border-emerald-600 text-emerald-600" : "border-destructive text-destructive"}`} aria-label={complete ? "Completado" : "Pendiente"}>{complete ? "✓" : "✕"}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step: requestedStep } = await params
  const progressResp = await callCrmApi<Progress>("/tenant/me/onboarding", { organizacionId: null, withUserToken: true })
  if (!progressResp.ok) redirect("/auth/login?redirectTo=%2Fonboarding")
  const step = progressResp.data.pasos.find((item) => item.id === requestedStep)
  if (!step) redirect("/onboarding")
  const summaryStep = { id: "resumen", titulo: "Resumen", estado: "en_progreso" as const, completado: progressResp.data.completado }
  const steps = [summaryStep, ...progressResp.data.pasos]

  const [settingsResp, secretsResp, routesResp, scheduleResp, metaResp, emailResp] = await Promise.all([
    callCrmApi<Settings>("/tenant/me/settings", { organizacionId: null, withUserToken: true }),
    callCrmApi<{ items: Array<SecretItem & { id?: string }> }>("/tenant/me/secrets", { organizacionId: null, withUserToken: true }),
    callCrmApi<{ items: Array<RouteItem & { id: string }> }>("/tenant/me/routes", { organizacionId: null, withUserToken: true }),
    callCrmApi<AnyRecord>("/tenant/me/whatsapp-assistant-schedule", { organizacionId: null, withUserToken: true }),
    callCrmApi<AnyRecord | null>("/tenant/me/whatsapp/meta/connection", { organizacionId: null, withUserToken: true }),
    callCrmApi<TenantEmailServiceData>("/tenant/me/email-service", { organizacionId: null, withUserToken: true }),
  ])
  if (!settingsResp.ok) redirect("/settings/variables")
  const data = settingsResp.data
  const config = record(data.config)
  const secrets = secretsResp.ok ? secretsResp.data.items : []
  const routes = routesResp.ok ? routesResp.data.items : []
  const hasSecret = (part: string) => secrets.some((item) => item.clave.toLowerCase().includes(part))
  const webchat = record(config.webchat)
  const webchatCalendar = record(webchat.calendar)
  const calendar = record(config.calendar)
  const features = record(config.features)
  const agenda = record(features.agenda)
  const mail = record(config.mail)
  const twilio = record(config.twilio)
  const voice = record(config.voice)
  const whatsapp = record(config.whatsapp)
  const whatsappMeta = record(whatsapp.meta)
  const openai = record(config.openai)
  const openaiGeneral = record(openai.general)
  const openaiVoice = record(openai.voice)
  const tenantId = data.organizacion_id

  const content = (() => {
    switch (step.id) {
      case "organizacion":
        return <TenantOrganizationInfoForm tenantId={tenantId} info={data} showActiveToggle={false} showOnboardingState={false} />
      case "imagen_empresarial":
        return <TenantAiBrandContextPanel
          initialLogoUrl={data.logo_url}
          initialValues={{
            ia_descripcion_empresa: data.ia_descripcion_empresa ?? "",
            ia_productos_servicios: data.ia_productos_servicios ?? "",
            ia_publico_objetivo: data.ia_publico_objetivo ?? "",
            ia_propuesta_valor: data.ia_propuesta_valor ?? "",
            ia_diferenciadores: data.ia_diferenciadores ?? "",
            ia_restricciones_comerciales: data.ia_restricciones_comerciales ?? "",
            ia_color_primario: data.ia_color_primario ?? "",
            ia_color_secundario: data.ia_color_secundario ?? "",
            ia_color_acento: data.ia_color_acento ?? "",
            ia_color_fondo: data.ia_color_fondo ?? "",
            ia_estilo_visual: data.ia_estilo_visual ?? "",
            ia_radio_bordes: data.ia_radio_bordes ?? "",
          }}
        />
      case "inteligencia":
        return <TenantOpenaiSettings tenantId={tenantId} initialValues={{ general_project_id: text(openaiGeneral, "project_id"), voice_prompt_id: text(openaiVoice, "prompt_id"), voice_prompt_version: text(openaiVoice, "prompt_version"), voice_model: text(openaiVoice, "model"), voice_max_tokens: number(openaiVoice, "max_tokens"), voice_stt_model: text(openaiVoice, "stt_model") }} hasGeneralApiKey={hasSecret("openai.general.api_key")} hasVoiceApiKey={hasSecret("openai.voice.api_key")} />
      case "webchat":
        return <OptionalFeatureChoice feature="Webchat" initialDecision={progressResp.data.webchat_decision}><TenantWebchatSettings tenantId={tenantId} initialValues={{ enabled: bool(record(record(config.features).webchat), "enabled") ?? false, assistant_id: text(webchat, "assistant_id") ?? "", prompt_version: text(webchat, "prompt_version") ?? "", inactivity_minutes: number(webchat, "inactivity_minutes"), persist_session: bool(webchat, "persist_session"), reengage_minutes: number(webchat, "reengage_minutes"), reengage_max_attempts: number(webchat, "reengage_max_attempts"), escalate_minutes: number(webchat, "escalate_minutes"), webchat_alias: routes.find((item) => item.canal === "webchat")?.clave ?? "" }} /></OptionalFeatureChoice>
      case "voz":
        return <OptionalFeatureChoice feature="Voz" initialDecision={progressResp.data.voz_decision}><TenantTwilioSettings tenantId={tenantId} initialValues={{ twilio_phone_number: text(twilio, "phone_number"), twilio_phone_number_sid: text(twilio, "phone_number_sid"), twilio_validate_signatures: bool(twilio, "validate_signatures") ?? true, voice_webhook_path: text(voice, "webhook_path") ?? "", voice_full_duplex: bool(voice, "full_duplex") ?? true, voice_debug_verbose: bool(voice, "debug_verbose") ?? false, voice_debug_energy_every_n: number(voice, "energy_every_n") }} /></OptionalFeatureChoice>
      case "agenda":
        return <TenantCalendarSettings tenantId={tenantId} initialValues={{ agenda_enabled: bool(agenda, "enabled") ?? true, calendar_timezone: text(webchatCalendar, "timezone") ?? "", calendar_default_days: number(webchatCalendar, "default_days"), calendar_hold_minutes: number(webchatCalendar, "hold_minutes"), calendar_provider: text(calendar, "provider") ?? "", calendar_server_url: text(calendar, "server_url") ?? "", calendar_server_url_alternate: text(calendar, "server_url_alternate") ?? "", calendar_server_port: number(calendar, "server_port"), calendar_full_calendar_url: text(calendar, "full_calendar_url") ?? "", calendar_full_contact_list_url: text(calendar, "full_contact_list_url") ?? "", zoom_enabled: bool(record(config.zoom), "enabled") ?? false, zoom_host_email: text(record(config.zoom), "host_email") ?? "", zoom_default_duration_minutes: number(record(config.zoom), "default_duration_minutes"), zoom_auto_create_meeting: bool(record(config.zoom), "auto_create_meeting") ?? true }} showZoomChoice zoomDecision={progressResp.data.zoom_decision} />
      case "correo":
        return <><EmailSetupChecklist status={progressResp.data.correo} /><TenantEmailServicePanel data={emailResp.ok ? emailResp.data : null} createDomainAction={tenantActionsLib.createTenantEmailDomainAction} verifyDomainAction={tenantActionsLib.verifyTenantEmailDomainAction} removeDomainAction={tenantActionsLib.removeTenantEmailDomainAction} updateSenderAction={tenantActionsLib.updateTenantEmailSenderAction} /><TenantMailSettings tenantId={tenantId} initialValues={{ mail_incoming_server: text(mail, "incoming_server"), mail_incoming_port_imap: number(mail, "incoming_port_imap"), mail_outgoing_server: text(mail, "outgoing_server"), mail_outgoing_port_smtp: number(mail, "outgoing_port_smtp"), mail_use_ssl: bool(mail, "use_ssl"), mail_use_tls: bool(mail, "use_tls") }} /></>
      case "whatsapp":
        return <><MetaAssistedConnectionPanel initialConnection={metaResp.ok ? metaResp.data : null} businessId={process.env.META_TALIA_BUSINESS_ID ?? "1358726956043196"} /><WhatsAppAssistantSchedulePanel initialValues={scheduleResp.ok ? scheduleResp.data : null} /><TenantWhatsAppSettings tenantId={tenantId} initialValues={{ whatsapp_provider: text(whatsapp, "provider") as "twilio" | "meta" | undefined, whatsapp_send_seller_data_to_customer: bool(whatsapp, "send_seller_data_to_customer") ?? false, whatsapp_prompt_id: text(whatsapp, "prompt_id"), whatsapp_prompt_version: text(whatsapp, "prompt_version"), whatsapp_welcome_document_prompt_version: text(whatsapp, "welcome_document_prompt_version"), whatsapp_location_href: text(whatsapp, "location_href"), whatsapp_assistant_id: text(whatsapp, "assistant_id"), whatsapp_inactivity_minutes: number(whatsapp, "inactivity_minutes"), whatsapp_reengage_minutes: number(whatsapp, "reengage_minutes"), whatsapp_reengage_max_attempts: number(whatsapp, "reengage_max_attempts"), whatsapp_escalate_minutes: number(whatsapp, "escalate_minutes"), whatsapp_meta_phone_number_id: text(whatsappMeta, "phone_number_id") }} routes={routes} /></>
      default:
        return <div className="space-y-3"><p className="text-sm text-muted-foreground">Este paso conserva su configuración en el módulo correspondiente.</p><a className="inline-flex rounded-md border px-4 py-2 text-sm hover:bg-muted" href="/settings/variables">Abrir configuración</a></div>
    }
  })()

  return <TenantSettingsActionsProvider value={actions}><OnboardingStepShell step={step} steps={steps} porcentaje={progressResp.data.porcentaje}>{content}</OnboardingStepShell></TenantSettingsActionsProvider>
}
