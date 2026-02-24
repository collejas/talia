"use client"

import { createContext, ReactNode, useActionState, useContext, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import {
  CrudActionHandler,
  CrudActionState,
  createTenantRouteAction,
  deleteTenantRouteAction,
  deleteTenantSecretAction,
  setTenantSecretAction,
  updateCalendarSettingsAction,
  updateMailSettingsAction,
  updateBusquedaSettingsAction,
  updateTwilioSettingsAction,
  updateWhatsAppSettingsAction,
  updateMessengerSettingsAction,
  updateOpenaiGeneralAction,
  updateOpenaiVoiceAction,
  updateTenantProfilingToggleAction,
  updateTenantConfigAction,
  updateTenantInfoAction,
  updateWebchatSettingsAction,
  validateTenantAction,
} from "./actions"

export type TenantSettingsActions = {
  updateTenantConfigAction: CrudActionHandler
  updateTenantProfilingToggleAction?: CrudActionHandler
  updateTenantInfoAction: CrudActionHandler
  setTenantSecretAction: CrudActionHandler
  deleteTenantSecretAction: CrudActionHandler
  updateWebchatSettingsAction: CrudActionHandler
  updateCalendarSettingsAction: CrudActionHandler
  updateMailSettingsAction: CrudActionHandler
  updateBusquedaSettingsAction: CrudActionHandler
  updateTwilioSettingsAction: CrudActionHandler
  updateWhatsAppSettingsAction: CrudActionHandler
  updateMessengerSettingsAction: CrudActionHandler
  updateOpenaiGeneralAction: CrudActionHandler
  updateOpenaiVoiceAction: CrudActionHandler
  validateTenantAction: CrudActionHandler
  createTenantRouteAction: CrudActionHandler
  deleteTenantRouteAction: CrudActionHandler
}

const defaultTenantSettingsActions: TenantSettingsActions = {
  updateTenantConfigAction,
  updateTenantProfilingToggleAction,
  updateTenantInfoAction,
  setTenantSecretAction,
  deleteTenantSecretAction,
  updateWebchatSettingsAction,
  updateCalendarSettingsAction,
  updateMailSettingsAction,
  updateBusquedaSettingsAction,
  updateTwilioSettingsAction,
  updateWhatsAppSettingsAction,
  updateMessengerSettingsAction,
  updateOpenaiGeneralAction,
  updateOpenaiVoiceAction,
  validateTenantAction,
  createTenantRouteAction,
  deleteTenantRouteAction,
}

const TenantSettingsActionsContext = createContext<TenantSettingsActions>(defaultTenantSettingsActions)

export function TenantSettingsActionsProvider({
  value,
  children,
}: {
  value: TenantSettingsActions
  children: ReactNode
}) {
  return <TenantSettingsActionsContext.Provider value={value}>{children}</TenantSettingsActionsContext.Provider>
}

export function useTenantSettingsActions() {
  return useContext(TenantSettingsActionsContext)
}

const INITIAL_CRUD_STATE: CrudActionState = { status: "idle" }

function formatCrudMessage(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function FormStatusMessage({ state }: { state: CrudActionState }) {
  if (state.status === "idle") return null
  const message = formatCrudMessage(state.message)
  if (state.status === "success") {
    return (
      <p className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
        {message ?? "Cambios guardados."}
      </p>
    )
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {message ?? "No se pudo completar la acción."}
      </p>
    )
  }
  return null
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function useCrudForm(action: CrudActionHandler) {
  const [state, formAction] = useActionState(action, INITIAL_CRUD_STATE)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset()
  }, [state])
  return { state, formAction, formRef }
}

export function TenantConfigEditor({
  tenantId,
  initialConfigJson,
}: {
  tenantId: string
  initialConfigJson: string
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateTenantConfigAction, INITIAL_CRUD_STATE)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="space-y-2">
        <Label htmlFor="config_json">organizaciones.config (JSON)</Label>
        <Textarea
          id="config_json"
          name="config_json"
          defaultValue={initialConfigJson}
          className="min-h-[260px] font-mono text-xs"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Tip: esta es la primera iteración. Después lo convertimos a formularios por sección (webchat/whatsapp/etc.).
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormStatusMessage state={state} />
        <SubmitButton label="Guardar config" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

export function TenantProfilingToggleForm({
  tenantId,
  profilingEnabled,
}: {
  tenantId: string
  profilingEnabled: boolean
}) {
  const actions = useTenantSettingsActions()
  const toggleAction = actions.updateTenantProfilingToggleAction ?? updateTenantProfilingToggleAction
  const [state, formAction] = useActionState(toggleAction, INITIAL_CRUD_STATE)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="space-y-2">
        <Label>Perfilamiento IA</Label>
        <div className="flex items-center gap-3">
          <input
            id="profiling_enabled"
            name="profiling_enabled"
            type="checkbox"
            className="size-4"
            defaultChecked={profilingEnabled}
          />
          <span className="text-sm text-muted-foreground">
            Activa/desactiva preguntas de perfilamiento y acceso a Settings {"/"} Calificación IA.
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profiling_reason">Motivo (opcional)</Label>
        <Input
          id="profiling_reason"
          name="profiling_reason"
          placeholder="Ej. Campaña temporal sin perfilamiento."
          maxLength={240}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormStatusMessage state={state} />
        <SubmitButton label="Guardar estado" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

export type SecretItem = {
  clave: string
  etiqueta?: string | null
  version: number
  actualizado_en?: string | null
}

export type RouteItem = {
  id: string
  canal: string
  clave: string
  activo?: boolean | null
}

export type TenantOrganizationInfo = {
  nombre?: string | null
  razon_social?: string | null
  rfc?: string | null
  pais?: string | null
  estado?: string | null
  ciudad?: string | null
  dominio_principal?: string | null
  telefono?: string | null
  sitio_web?: string | null
  estado_onboarding?: string | null
  activo?: boolean | null
}

export function TenantOrganizationInfoForm({
  tenantId,
  info,
  showActiveToggle = true,
}: {
  tenantId: string
  info: TenantOrganizationInfo | null
  showActiveToggle?: boolean
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateTenantInfoAction, INITIAL_CRUD_STATE)
  const defaultOnboarding = info?.estado_onboarding ?? "pendiente"

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tenant_nombre">Nombre</Label>
          <Input id="tenant_nombre" name="tenant_nombre" defaultValue={info?.nombre ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_razon_social">Razón social</Label>
          <Input id="tenant_razon_social" name="tenant_razon_social" defaultValue={info?.razon_social ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_rfc">RFC</Label>
          <Input id="tenant_rfc" name="tenant_rfc" defaultValue={info?.rfc ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_pais">País</Label>
          <Input id="tenant_pais" name="tenant_pais" defaultValue={info?.pais ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_estado">Estado</Label>
          <Input id="tenant_estado" name="tenant_estado" defaultValue={info?.estado ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_ciudad">Ciudad</Label>
          <Input id="tenant_ciudad" name="tenant_ciudad" defaultValue={info?.ciudad ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_dominio">Dominio principal</Label>
          <Input id="tenant_dominio" name="tenant_dominio" defaultValue={info?.dominio_principal ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_telefono">Teléfono</Label>
          <Input id="tenant_telefono" name="tenant_telefono" defaultValue={info?.telefono ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_sitio">Sitio web</Label>
          <Input id="tenant_sitio" name="tenant_sitio" defaultValue={info?.sitio_web ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {showActiveToggle ? (
          <div className="space-y-2">
            <Label>Activo</Label>
            <input type="hidden" name="tenant_activo_present" value="1" />
            <div className="flex items-center gap-3">
              <input
                id="tenant_activo"
                name="tenant_activo"
                type="checkbox"
                className="size-4"
                defaultChecked={info?.activo ?? true}
              />
              <span className="text-sm text-muted-foreground">El tenant puede iniciar sesión y recibir tráfico.</span>
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="tenant_estado_onboarding">Estado de onboarding</Label>
          <select
            id="tenant_estado_onboarding"
            name="tenant_estado_onboarding"
            defaultValue={defaultOnboarding}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="completado">Completado</option>
            <option value="pausado">Pausado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <FormStatusMessage state={state} />
        <SubmitButton label="Guardar datos" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

type WebchatInitialValues = {
  enabled?: boolean
  assistant_id?: string
  prompt_version?: string
  inactivity_minutes?: number
  persist_session?: boolean
  reengage_minutes?: number
  reengage_max_attempts?: number
  escalate_minutes?: number
  webchat_alias?: string
}

type CalendarInitialValues = {
  calendar_resource_id?: string
  calendar_timezone?: string
  calendar_default_days?: number
  calendar_hold_minutes?: number
  calendar_provider?: string
  calendar_server_url?: string
  calendar_server_url_alternate?: string
  calendar_server_port?: number
  calendar_full_calendar_url?: string
  calendar_full_contact_list_url?: string
}

type MailInitialValues = {
  mail_incoming_server?: string
  mail_incoming_port_imap?: number
  mail_outgoing_server?: string
  mail_outgoing_port_smtp?: number
  mail_use_ssl?: boolean
  mail_use_tls?: boolean
  brevo_base_url?: string
}

type TwilioInitialValues = {
  twilio_phone_number?: string
  twilio_phone_number_sid?: string
  twilio_validate_signatures?: boolean
  voice_webhook_path?: string
  voice_full_duplex?: boolean
  voice_debug_verbose?: boolean
  voice_debug_energy_every_n?: number
}

type WhatsAppInitialValues = {
  whatsapp_prompt_id?: string
  whatsapp_prompt_version?: string
  whatsapp_assistant_id?: string
  whatsapp_inactivity_minutes?: number
  whatsapp_reengage_minutes?: number
  whatsapp_reengage_max_attempts?: number
  whatsapp_escalate_minutes?: number
  whatsapp_template_sales?: string
  whatsapp_template_appointment?: string
  whatsapp_template_cancel?: string
  whatsapp_template_prospeccion_sids?: string
  whatsapp_prospeccion_prompt_id?: string
}

type MessengerInitialValues = {
  messenger_prompt_id?: string
  messenger_prompt_version?: string
  messenger_assistant_id?: string
  messenger_inactivity_hours?: number
}

type OpenaiInitialValues = {
  general_project_id?: string
  voice_prompt_id?: string
  voice_prompt_version?: string
  voice_model?: string
  voice_max_tokens?: number
  voice_stt_model?: string
}

type BusquedaInitialValues = {
  denue_base_url?: string
  google_nearby_url?: string
  google_text_url?: string
  google_details_url?: string
  google_field_mask?: string
  google_details_field_mask?: string
  google_language_code?: string
  google_region_code?: string
  google_grid_max_tile_radius_m?: number
  google_pause_between_pages?: number
  google_dense_grid_max_tile_radius_m?: number
  google_dense_pause_between_pages?: number
  google_dense_max_results?: number
}

export function TenantWebchatSettings({
  tenantId,
  initialValues,
}: {
  tenantId: string
  initialValues: WebchatInitialValues
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateWebchatSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-3">
              <input
                id="webchat_enabled"
                name="webchat_enabled"
                type="checkbox"
                defaultChecked={Boolean(initialValues.enabled)}
                className="size-4"
              />
              <Label htmlFor="webchat_enabled">Webchat habilitado</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Nota: esto solo cambia el flag en <code>organizaciones.config.features.webchat.enabled</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webchat_alias">Alias (routing)</Label>
            <Input
              id="webchat_alias"
              name="webchat_alias"
              placeholder="ej. talia, cliente-x"
              defaultValue={initialValues.webchat_alias ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Se crea como ruta <code>canal=webchat</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openai_api_key">OpenAI API key (secreto, tier B)</Label>
            <Input
              id="openai_api_key"
              name="openai_api_key"
              type="password"
              placeholder="Pega aquí (no se vuelve a mostrar)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webchat_assistant_id">assistant_id</Label>
            <Input
              id="webchat_assistant_id"
              name="webchat_assistant_id"
              placeholder="asst_..."
              defaultValue={initialValues.assistant_id ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webchat_prompt_version">prompt_version</Label>
            <Input
              id="webchat_prompt_version"
              name="webchat_prompt_version"
              placeholder="ej. 1"
              defaultValue={initialValues.prompt_version ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webchat_inactivity_minutes">inactivity_minutes</Label>
            <Input
              id="webchat_inactivity_minutes"
              name="webchat_inactivity_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.inactivity_minutes ?? ""}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                id="webchat_persist_session"
                name="webchat_persist_session"
                type="checkbox"
                defaultChecked={Boolean(initialValues.persist_session)}
                className="size-4"
              />
              <Label htmlFor="webchat_persist_session">persist_session</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webchat_reengage_minutes">reengage_minutes</Label>
            <Input
              id="webchat_reengage_minutes"
              name="webchat_reengage_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.reengage_minutes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webchat_reengage_max_attempts">reengage_max_attempts</Label>
            <Input
              id="webchat_reengage_max_attempts"
              name="webchat_reengage_max_attempts"
              type="number"
              min={0}
              defaultValue={initialValues.reengage_max_attempts ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webchat_escalate_minutes">escalate_minutes</Label>
            <Input
              id="webchat_escalate_minutes"
              name="webchat_escalate_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.escalate_minutes ?? ""}
            />
          </div>

        </div>
        <p className="text-xs text-muted-foreground">
          La pestaña “Calendario” administra el recurso, zona horarios y ventanas que usa el webchat para reservar citas.
        </p>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Webchat" pendingLabel="Guardando..." />
        </div>
      </form>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="webchat" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes mínimos en routing/config/secretos.</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantCalendarSettings({
  tenantId,
  initialValues,
  allowResourceIdEdit = true,
}: {
  tenantId: string
  initialValues: CalendarInitialValues
  allowResourceIdEdit?: boolean
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateCalendarSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calendar_resource_id">webchat.calendar.resource_id</Label>
          {allowResourceIdEdit ? (
            <Input
              id="calendar_resource_id"
              name="calendar_resource_id"
              placeholder="uuid del recurso (Supabase)"
              defaultValue={initialValues.calendar_resource_id ?? ""}
            />
          ) : (
            <Input
              id="calendar_resource_id"
              name="calendar_resource_id"
              readOnly
              defaultValue={initialValues.calendar_resource_id ?? ""}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Se refiere a <code>calendar_resources.id</code> que expone slots.
            {!allowResourceIdEdit ? " Este valor lo provisiona automáticamente la plataforma." : ""}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_timezone">calendar.timezone</Label>
          <Input
            id="calendar_timezone"
            name="calendar_timezone"
            placeholder="America/Mexico_City"
            defaultValue={initialValues.calendar_timezone ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_default_days">calendar.default_days</Label>
          <Input
            id="calendar_default_days"
            name="calendar_default_days"
            type="number"
            min={1}
            defaultValue={initialValues.calendar_default_days ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_hold_minutes">calendar.hold_minutes</Label>
          <Input
            id="calendar_hold_minutes"
            name="calendar_hold_minutes"
            type="number"
            min={0}
            defaultValue={initialValues.calendar_hold_minutes ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calendar_provider">calendar.provider</Label>
          <Input
            id="calendar_provider"
            name="calendar_provider"
            placeholder="ej. caldav"
            defaultValue={initialValues.calendar_provider ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_server_url">calendar.server_url</Label>
          <Input
            id="calendar_server_url"
            name="calendar_server_url"
            placeholder="https://mail.talia.mx:2080"
            defaultValue={initialValues.calendar_server_url ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_server_url_alternate">calendar.server_url_alternate</Label>
          <Input
            id="calendar_server_url_alternate"
            name="calendar_server_url_alternate"
            placeholder="https://mail.talia.mx:2080/principals/..."
            defaultValue={initialValues.calendar_server_url_alternate ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_server_port">calendar.server_port</Label>
          <Input
            id="calendar_server_port"
            name="calendar_server_port"
            type="number"
            min={1}
            defaultValue={initialValues.calendar_server_port ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_full_calendar_url">calendar.full_calendar_url</Label>
          <Input
            id="calendar_full_calendar_url"
            name="calendar_full_calendar_url"
            placeholder="https://mail.talia.mx:2080/calendar/"
            defaultValue={initialValues.calendar_full_calendar_url ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_full_contact_list_url">calendar.full_contact_list_url</Label>
          <Input
            id="calendar_full_contact_list_url"
            name="calendar_full_contact_list_url"
            placeholder="https://mail.talia.mx:2080/contacts/"
            defaultValue={initialValues.calendar_full_contact_list_url ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <p className="text-xs text-muted-foreground">
            Las credenciales de calendario se guardan como secretos (`calendar.username` tier A y `calendar.password` tier
            B) y no se muestran después de guardar.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_username">calendar.username</Label>
          <Input
            id="calendar_username"
            name="calendar_username"
            placeholder="hola@talia.mx"
            defaultValue=""
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar_password">calendar.password</Label>
          <Input
            id="calendar_password"
            name="calendar_password"
            type="password"
            placeholder="Pega para rotar"
            defaultValue=""
          />
        </div>
      </div>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Calendario" pendingLabel="Guardando..." />
        </div>
      </form>
      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="calendar" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de routing/config/secretos relacionados con el calendario.</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantMailSettings({
  tenantId,
  initialValues,
  hasBrevoApiKey,
}: {
  tenantId: string
  initialValues: MailInitialValues
  hasBrevoApiKey: boolean
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateMailSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mail_incoming_server">mail.incoming_server</Label>
            <Input
              id="mail_incoming_server"
              name="mail_incoming_server"
              placeholder="mail.talia.mx"
              defaultValue={initialValues.mail_incoming_server ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail_incoming_port_imap">mail.incoming_port_imap</Label>
            <Input
              id="mail_incoming_port_imap"
              name="mail_incoming_port_imap"
              type="number"
              min={1}
              defaultValue={initialValues.mail_incoming_port_imap ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail_outgoing_server">mail.outgoing_server</Label>
            <Input
              id="mail_outgoing_server"
              name="mail_outgoing_server"
              placeholder="mail.talia.mx"
              defaultValue={initialValues.mail_outgoing_server ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail_outgoing_port_smtp">mail.outgoing_port_smtp</Label>
            <Input
              id="mail_outgoing_port_smtp"
              name="mail_outgoing_port_smtp"
              type="number"
              min={1}
              defaultValue={initialValues.mail_outgoing_port_smtp ?? ""}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Brevo</h3>
              <p className="text-xs text-muted-foreground">Configuración del API de Brevo usada en los envíos.</p>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {hasBrevoApiKey ? "Secreto registrado" : "Sin secreto registrado"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brevo_base_url">brevo.base_url</Label>
            <Input
              id="brevo_base_url"
              name="brevo_base_url"
              placeholder="https://api.brevo.com/v3"
              defaultValue={initialValues.brevo_base_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brevo_api_key">brevo.api_key (secreto, tier B)</Label>
            <Input id="brevo_api_key" name="brevo_api_key" type="password" placeholder="Pega la clave" />
            <p className="text-xs text-muted-foreground">
              El valor solo se guarda al pegar uno nuevo; el sistema nunca te muestra el valor existente.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <input
              id="mail_use_ssl"
              name="mail_use_ssl"
              type="checkbox"
              className="size-4"
              defaultChecked={Boolean(initialValues.mail_use_ssl)}
            />
            <Label htmlFor="mail_use_ssl">mail.use_ssl</Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="mail_use_tls"
              name="mail_use_tls"
              type="checkbox"
              className="size-4"
              defaultChecked={Boolean(initialValues.mail_use_tls)}
            />
            <Label htmlFor="mail_use_tls">mail.use_tls</Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Esta sección guarda la configuración no sensible de <code>organizaciones.config.mail</code>.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mail_username">mail.username (secreto, tier A)</Label>
            <Input id="mail_username" name="mail_username" placeholder="hola@talia.mx" defaultValue="" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mail_password">mail.password (secreto, tier B)</Label>
            <Input id="mail_password" name="mail_password" type="password" placeholder="Pega para rotar" defaultValue="" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Correo" pendingLabel="Guardando..." />
        </div>
      </form>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="mail" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de config/secretos.</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantBusquedaSettings({
  tenantId,
  initialValues,
  hasToken,
  hasGoogleApiKey,
}: {
  tenantId: string
  initialValues: BusquedaInitialValues
  hasToken: boolean
  hasGoogleApiKey: boolean
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateBusquedaSettingsAction, INITIAL_CRUD_STATE)

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-2">
        <Label htmlFor="denue_base_url">denue.base_url</Label>
        <Input
          id="denue_base_url"
          name="denue_base_url"
          placeholder="https://www.inegi.org.mx/app/api/denue/v1"
          defaultValue={initialValues.denue_base_url ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Se graba en <code>organizaciones.config.denue.base_url</code>.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="denue_token">denue.token (secreto, tier A)</Label>
        <Input id="denue_token" name="denue_token" type="password" placeholder="Pega el token" />
        <p className="text-xs text-muted-foreground">
          {hasToken
            ? "Token registrado; no se muestra el valor actual."
            : "Aún no hay token guardado para este tenant."}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Google Places</h3>
            <p className="text-xs text-muted-foreground">
              Configura los endpoints y límites que usa el buscador de Google por tenant.
            </p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {hasGoogleApiKey ? "API key registrada" : "Sin API key registrada"}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="google_nearby_url">google_places_nearby_url</Label>
            <Input
              id="google_nearby_url"
              name="google_nearby_url"
              placeholder="https://places.googleapis.com/v1/places:searchNearby"
              defaultValue={initialValues.google_nearby_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_text_url">google_places_text_url</Label>
            <Input
              id="google_text_url"
              name="google_text_url"
              placeholder="https://places.googleapis.com/v1/places:searchText"
              defaultValue={initialValues.google_text_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_details_url">google_places_details_url</Label>
            <Input
              id="google_details_url"
              name="google_details_url"
              placeholder="https://places.googleapis.com/v1/places"
              defaultValue={initialValues.google_details_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_field_mask">PLACES_FIELD_MASK</Label>
            <Textarea
              id="google_field_mask"
              name="google_field_mask"
              className="font-mono text-xs"
              rows={3}
              defaultValue={initialValues.google_field_mask ?? ""}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="google_details_field_mask">PLACES_DETAILS_FIELD_MASK</Label>
            <Textarea
              id="google_details_field_mask"
              name="google_details_field_mask"
              className="font-mono text-xs"
              rows={3}
              defaultValue={initialValues.google_details_field_mask ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="google_language_code">google_places_language_code</Label>
            <Input
              id="google_language_code"
              name="google_language_code"
              placeholder="es"
              defaultValue={initialValues.google_language_code ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_region_code">google_places_region_code</Label>
            <Input
              id="google_region_code"
              name="google_region_code"
              placeholder="MX"
              defaultValue={initialValues.google_region_code ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_places_api_key">google.places_api_key (secreto, tier B)</Label>
            <Input id="google_places_api_key" name="google_places_api_key" type="password" placeholder="Pega la clave" />
            <p className="text-xs text-muted-foreground">
              Solo se guarda al pegar una nueva llave; el valor actual no se muestra.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="google_grid_max_tile_radius_m">google_places_grid_max_tile_radius_m</Label>
            <Input
              id="google_grid_max_tile_radius_m"
              name="google_grid_max_tile_radius_m"
              type="number"
              min={200}
              defaultValue={initialValues.google_grid_max_tile_radius_m ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_pause_between_pages">google_places_pause_between_pages</Label>
            <Input
              id="google_pause_between_pages"
              name="google_pause_between_pages"
              type="number"
              step="0.1"
              defaultValue={initialValues.google_pause_between_pages ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="google_dense_grid_max_tile_radius_m">google_places_dense_grid_max_tile_radius_m</Label>
            <Input
              id="google_dense_grid_max_tile_radius_m"
              name="google_dense_grid_max_tile_radius_m"
              type="number"
              min={200}
              defaultValue={initialValues.google_dense_grid_max_tile_radius_m ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_dense_pause_between_pages">google_places_dense_pause_between_pages</Label>
            <Input
              id="google_dense_pause_between_pages"
              name="google_dense_pause_between_pages"
              type="number"
              step="0.1"
              defaultValue={initialValues.google_dense_pause_between_pages ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="google_dense_max_results">google_places_dense_max_results</Label>
          <Input
            id="google_dense_max_results"
            name="google_dense_max_results"
            type="number"
            min={1}
            defaultValue={initialValues.google_dense_max_results ?? ""}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <FormStatusMessage state={state} />
        <SubmitButton label="Guardar Búsqueda" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

export function TenantTwilioSettings({
  tenantId,
  initialValues,
}: {
  tenantId: string
  initialValues: TwilioInitialValues
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateTwilioSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="twilio_phone_number">twilio.phone_number</Label>
            <Input
              id="twilio_phone_number"
              name="twilio_phone_number"
              placeholder="+5214443354450"
              defaultValue={initialValues.twilio_phone_number ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_phone_number_sid">twilio.phone_number_sid</Label>
            <Input
              id="twilio_phone_number_sid"
              name="twilio_phone_number_sid"
              placeholder="PNXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              defaultValue={initialValues.twilio_phone_number_sid ?? ""}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="twilio_validate_signatures"
            name="twilio_validate_signatures"
            type="checkbox"
            className="size-4"
            defaultChecked={Boolean(initialValues.twilio_validate_signatures)}
          />
          <Label htmlFor="twilio_validate_signatures">twilio.validate_signatures</Label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="voice_webhook_path">voice.webhook_path</Label>
            <Input
              id="voice_webhook_path"
              name="voice_webhook_path"
              placeholder="call-whisper"
              defaultValue={initialValues.voice_webhook_path ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice_debug_energy_every_n">voice.energy_every_n</Label>
            <Input
              id="voice_debug_energy_every_n"
              name="voice_debug_energy_every_n"
              type="number"
              min={0}
              defaultValue={initialValues.voice_debug_energy_every_n ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <input
              id="voice_full_duplex"
              name="voice_full_duplex"
              type="checkbox"
              className="size-4"
              defaultChecked={Boolean(initialValues.voice_full_duplex)}
            />
            <Label htmlFor="voice_full_duplex">voice.full_duplex</Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="voice_debug_verbose"
              name="voice_debug_verbose"
              type="checkbox"
              className="size-4"
              defaultChecked={Boolean(initialValues.voice_debug_verbose)}
            />
            <Label htmlFor="voice_debug_verbose">voice.debug_verbose</Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Esta sección guarda la configuración no sensible de <code>organizaciones.config.twilio</code> y <code>organizaciones.config.voice</code>.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="twilio_account_sid">twilio.account_sid (secreto, tier A)</Label>
            <Input
              id="twilio_account_sid"
              name="twilio_account_sid"
              type="password"
              placeholder="AC..."
              defaultValue=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_auth_token">twilio.auth_token (secreto, tier B)</Label>
            <Input
              id="twilio_auth_token"
              name="twilio_auth_token"
              type="password"
              placeholder="Auth token"
              defaultValue=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice_stream_jwt_secret">voice.stream_jwt_secret (secreto, tier B)</Label>
            <Input
              id="voice_stream_jwt_secret"
              name="voice_stream_jwt_secret"
              type="password"
              placeholder="Token JWT para el stream"
              defaultValue=""
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Twilio" pendingLabel="Guardando..." />
        </div>
      </form>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="twilio" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de config/secretos para Twilio/Voz.</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantWhatsAppSettings({
  tenantId,
  initialValues,
  routes,
}: {
  tenantId: string
  initialValues: WhatsAppInitialValues
  routes: RouteItem[]
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateWhatsAppSettingsAction, INITIAL_CRUD_STATE)
  const { state: routeState, formAction: createRouteAction, formRef: createRouteRef } = useCrudForm(
    actions.createTenantRouteAction,
  )
  const { formAction: deleteRouteAction } = useCrudForm(actions.deleteTenantRouteAction)
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)
  const channelRoutes = routes.filter((route) => route.canal === "whatsapp")

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_prompt_id">whatsapp.prompt_id</Label>
            <Input
              id="whatsapp_prompt_id"
              name="whatsapp_prompt_id"
              placeholder="pmpt_..."
              defaultValue={initialValues.whatsapp_prompt_id ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_prompt_version">whatsapp.prompt_version</Label>
            <Input
              id="whatsapp_prompt_version"
              name="whatsapp_prompt_version"
              defaultValue={initialValues.whatsapp_prompt_version ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_assistant_id">whatsapp.assistant_id</Label>
            <Input
              id="whatsapp_assistant_id"
              name="whatsapp_assistant_id"
              placeholder="assistant_..."
              defaultValue={initialValues.whatsapp_assistant_id ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_inactivity_minutes">whatsapp.inactivity_minutes</Label>
            <Input
              id="whatsapp_inactivity_minutes"
              name="whatsapp_inactivity_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.whatsapp_inactivity_minutes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_reengage_minutes">whatsapp.reengage_minutes</Label>
            <Input
              id="whatsapp_reengage_minutes"
              name="whatsapp_reengage_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.whatsapp_reengage_minutes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_reengage_max_attempts">whatsapp.reengage_max_attempts</Label>
            <Input
              id="whatsapp_reengage_max_attempts"
              name="whatsapp_reengage_max_attempts"
              type="number"
              min={1}
              defaultValue={initialValues.whatsapp_reengage_max_attempts ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_escalate_minutes">whatsapp.escalate_minutes</Label>
            <Input
              id="whatsapp_escalate_minutes"
              name="whatsapp_escalate_minutes"
              type="number"
              min={0}
              defaultValue={initialValues.whatsapp_escalate_minutes ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_template_sales">whatsapp.templates.sales</Label>
            <Input
              id="whatsapp_template_sales"
              name="whatsapp_template_sales"
              placeholder="HX..."
              defaultValue={initialValues.whatsapp_template_sales ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_template_appointment">whatsapp.templates.appointment</Label>
            <Input
              id="whatsapp_template_appointment"
              name="whatsapp_template_appointment"
              placeholder="HX..."
              defaultValue={initialValues.whatsapp_template_appointment ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_template_cancel">whatsapp.templates.cancel</Label>
            <Input
              id="whatsapp_template_cancel"
              name="whatsapp_template_cancel"
              placeholder="HX..."
              defaultValue={initialValues.whatsapp_template_cancel ?? ""}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Esta sección guarda la configuración no sensible bajo <code>organizaciones.config.whatsapp</code>.
        </p>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar WhatsApp" pendingLabel="Guardando..." />
        </div>
      </form>

      <form ref={createRouteRef} action={createRouteAction} className="space-y-3">
        <h3 className="text-sm font-medium">Ruta (WhatsApp)</h3>
        <p className="text-xs text-muted-foreground">Asocia un número E.164 al tenant para recibir webhooks.</p>
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="canal" value="whatsapp" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_route_clave">clave (número)</Label>
            <Input
              id="whatsapp_route_clave"
              name="clave"
              placeholder="+5214443354450"
              required
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={routeState} />
          <SubmitButton label="Agregar ruta" pendingLabel="Guardando..." />
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Rutas de WhatsApp</h3>
        {channelRoutes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay rutas registradas.</p>
        ) : (
          <div className="space-y-2">
            {channelRoutes.map((route) => (
              <div key={route.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="font-mono">{route.clave}</div>
                <form action={deleteRouteAction}>
                  <input type="hidden" name="tenant_id" value={tenantId} />
                  <input type="hidden" name="route_id" value={route.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Eliminar
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="whatsapp" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de config/rutas/secretos para WhatsApp.</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantWhatsAppProspeccionSettings({
  tenantId,
  initialValues,
}: {
  tenantId: string
  initialValues: Pick<WhatsAppInitialValues, "whatsapp_template_prospeccion_sids" | "whatsapp_prospeccion_prompt_id">
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateWhatsAppSettingsAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <div className="space-y-2">
          <Label htmlFor="whatsapp_prospeccion_prompt_id">Prompt ID (prospección)</Label>
          <Input
            id="whatsapp_prospeccion_prompt_id"
            name="whatsapp_prospeccion_prompt_id"
            placeholder="pmpt_..."
            defaultValue={initialValues.whatsapp_prospeccion_prompt_id ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Se guarda en <code>organizaciones.config.whatsapp.prospeccion.prompt_id</code>.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp_template_prospeccion_sids">Plantillas Whats-Prosp (SIDs)</Label>
          <Textarea
            id="whatsapp_template_prospeccion_sids"
            name="whatsapp_template_prospeccion_sids"
            placeholder={"HX...\nHX..."}
            defaultValue={initialValues.whatsapp_template_prospeccion_sids ?? ""}
            className="min-h-[180px] font-mono text-xs"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Un SID por línea. Se guarda en <code>organizaciones.config.whatsapp.templates.prospeccion</code> como arreglo.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Whats-Prosp" pendingLabel="Guardando..." />
        </div>
      </form>
    </div>
  )
}

export function TenantMessengerSettings({
  tenantId,
  initialValues,
  routes,
}: {
  tenantId: string
  initialValues: MessengerInitialValues
  routes: RouteItem[]
}) {
  const actions = useTenantSettingsActions()
  const [state, formAction] = useActionState(actions.updateMessengerSettingsAction, INITIAL_CRUD_STATE)
  const { state: routeState, formAction: createRouteAction, formRef: createRouteRef } = useCrudForm(
    actions.createTenantRouteAction,
  )
  const { formAction: deleteRouteAction } = useCrudForm(actions.deleteTenantRouteAction)
  const channelRoutes = routes.filter((route) => route.canal === "messenger")
  const [validateState, validateAction] = useActionState(actions.validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="messenger_prompt_id">messenger.prompt_id</Label>
            <Input
              id="messenger_prompt_id"
              name="messenger_prompt_id"
              placeholder="pmpt_..."
              defaultValue={initialValues.messenger_prompt_id ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger_prompt_version">messenger.prompt_version</Label>
            <Input
              id="messenger_prompt_version"
              name="messenger_prompt_version"
              defaultValue={initialValues.messenger_prompt_version ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger_assistant_id">messenger.assistant_id</Label>
            <Input
              id="messenger_assistant_id"
              name="messenger_assistant_id"
              placeholder="assistant_..."
              defaultValue={initialValues.messenger_assistant_id ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger_inactivity_hours">messenger.inactivity_hours</Label>
            <Input
              id="messenger_inactivity_hours"
              name="messenger_inactivity_hours"
              type="number"
              min={0}
              defaultValue={initialValues.messenger_inactivity_hours ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Cada token se guarda en <code>secretos.clave</code> como <code>meta.messenger.*</code>; los campos se mantienen vacíos después de guardar.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="messenger_page_access_token">meta.messenger.page_access_token (tier B)</Label>
            <Input
              id="messenger_page_access_token"
              name="messenger_page_access_token"
              type="password"
              placeholder="Pega el page access token"
              defaultValue=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger_verify_token">meta.messenger.verify_token (tier A)</Label>
            <Input
              id="messenger_verify_token"
              name="messenger_verify_token"
              type="password"
              placeholder="Pega el verify token"
              defaultValue=""
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger_app_secret">meta.messenger.app_secret (tier B)</Label>
            <Input
              id="messenger_app_secret"
              name="messenger_app_secret"
              type="password"
              placeholder="Pega el app secret"
              defaultValue=""
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={state} />
          <SubmitButton label="Guardar Messenger" pendingLabel="Guardando..." />
        </div>
      </form>

      <form ref={createRouteRef} action={createRouteAction} className="space-y-3">
        <h3 className="text-sm font-medium">Ruta (Messenger)</h3>
        <p className="text-xs text-muted-foreground">Relaciona el page_id con este tenant.</p>
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="canal" value="messenger" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="messenger_route_clave">clave (page_id)</Label>
            <Input id="messenger_route_clave" name="clave" placeholder="123456789" required />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={routeState} />
          <SubmitButton label="Agregar ruta" pendingLabel="Guardando..." />
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Rutas de Messenger</h3>
        {channelRoutes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay rutas registradas.</p>
        ) : (
          <div className="space-y-2">
            {channelRoutes.map((route) => (
              <div key={route.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="font-mono">{route.clave}</div>
                <form action={deleteRouteAction}>
                  <input type="hidden" name="tenant_id" value={tenantId} />
                  <input type="hidden" name="route_id" value={route.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Eliminar
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="messenger" />
      </form>

      <form action={validateAction} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="scope" value="messenger" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de Messenger (config + secrets).</p>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Validar
          </Button>
        </div>
        {validateState.report ? (
          <div className="rounded-lg border border-border/60 p-4 text-sm space-y-3">
            <p className="font-medium">{validateState.message}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_routes.length ? (
                    validateState.report.missing_routes.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x: string) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x: string) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <FormStatusMessage state={validateState} />
        )}
      </form>
    </div>
  )
}

export function TenantOpenaiSettings({
  tenantId,
  initialValues,
  hasGeneralApiKey,
  hasVoiceApiKey,
}: {
  tenantId: string
  initialValues: OpenaiInitialValues
  hasGeneralApiKey: boolean
  hasVoiceApiKey: boolean
}) {
  const actions = useTenantSettingsActions()
  const [generalState, generalAction] = useActionState(actions.updateOpenaiGeneralAction, INITIAL_CRUD_STATE)
  const [voiceState, voiceAction] = useActionState(actions.updateOpenaiVoiceAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Openai General</h3>
            <p className="text-xs text-muted-foreground">Project ID y clave base del proyecto de prompts.</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {hasGeneralApiKey ? "Secreto registrado" : "Sin secreto registrado"}
          </p>
        </div>
        <form action={generalAction} className="space-y-3">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor="openai_general_project_id">TALIA_OPENAI_PROJECT_ID</Label>
            <Input
              id="openai_general_project_id"
              name="openai_general_project_id"
              placeholder="sk-proj-..."
              defaultValue={initialValues.general_project_id ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai_general_api_key">TALIA_OPENAI_API_KEY (tier B)</Label>
            <Input id="openai_general_api_key" name="openai_general_api_key" type="password" placeholder="Pega la clave" />
            <p className="text-xs text-muted-foreground">
              El valor no se muestra una vez guardado. Solo lo ve un admin si lo rota.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FormStatusMessage state={generalState} />
            <SubmitButton label="Guardar general" pendingLabel="Guardando..." />
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Voz Openai</h3>
            <p className="text-xs text-muted-foreground">Prompt + modelo usados por Twilio / Realtime.</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {hasVoiceApiKey ? "Secreto registrado" : "Sin secreto registrado"}
          </p>
        </div>
        <form action={voiceAction} className="space-y-3">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="openai_voice_prompt_id">OPENAI_PROMPT_ID</Label>
              <Input
                id="openai_voice_prompt_id"
                name="openai_voice_prompt_id"
                placeholder="pmpt_..."
                defaultValue={initialValues.voice_prompt_id ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai_voice_prompt_version">OPENAI_PROMPT_VERSION</Label>
              <Input
                id="openai_voice_prompt_version"
                name="openai_voice_prompt_version"
                defaultValue={initialValues.voice_prompt_version ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai_voice_model">OPENAI_MODEL</Label>
              <Input id="openai_voice_model" name="openai_voice_model" defaultValue={initialValues.voice_model ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai_voice_max_tokens">OPENAI_MAX_TOKENS</Label>
              <Input
                id="openai_voice_max_tokens"
                name="openai_voice_max_tokens"
                type="number"
                min={1}
                defaultValue={initialValues.voice_max_tokens ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai_voice_stt_model">OPENAI_STT_MODEL</Label>
              <Input
                id="openai_voice_stt_model"
                name="openai_voice_stt_model"
                defaultValue={initialValues.voice_stt_model ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai_voice_api_key">OPENAI_API_KEY (tier B)</Label>
            <Input id="openai_voice_api_key" name="openai_voice_api_key" type="password" placeholder="Pega la clave" />
            <p className="text-xs text-muted-foreground">
              El valor solo se guarda una vez; para rotarlo pega uno nuevo.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FormStatusMessage state={voiceState} />
            <SubmitButton label="Guardar voz" pendingLabel="Guardando..." />
          </div>
        </form>
      </div>
    </div>
  )
}

export function TenantRoutingManager({ tenantId, routes }: { tenantId: string; routes: RouteItem[] }) {
  const actions = useTenantSettingsActions()
  const { state: createState, formAction: createAction, formRef: createRef } = useCrudForm(
    actions.createTenantRouteAction,
  )
  const { state: deleteState, formAction: deleteAction } = useCrudForm(actions.deleteTenantRouteAction)

  return (
    <div className="space-y-6">
      <form ref={createRef} action={createAction} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="route_canal">Canal</Label>
            <Input id="route_canal" name="canal" placeholder="webchat | whatsapp | messenger" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="route_clave">Clave</Label>
            <Input id="route_clave" name="clave" placeholder="alias / +E164 / page_id" required />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={createState} />
          <SubmitButton label="Crear ruta" pendingLabel="Creando..." />
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Rutas registradas</h3>
          <FormStatusMessage state={deleteState} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Clave</TableHead>
                  <TableHead className="hidden md:table-cell">Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No hay rutas (aún).
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell className="font-mono text-xs">{route.canal}</TableCell>
                      <TableCell className="font-mono text-xs">{route.clave}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {route.activo === null || route.activo === undefined ? "—" : route.activo ? "Sí" : "No"}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={deleteAction}>
                          <input type="hidden" name="tenant_id" value={tenantId} />
                          <input type="hidden" name="route_id" value={route.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Eliminar
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TenantSecretsManager({ tenantId, secrets }: { tenantId: string; secrets: SecretItem[] }) {
  const actions = useTenantSettingsActions()
  const { state: setState, formAction: setAction, formRef: setRef } = useCrudForm(actions.setTenantSecretAction)
  const { state: deleteState, formAction: deleteAction } = useCrudForm(actions.deleteTenantSecretAction)
  const [tier, setTier] = useState<"A" | "B">("A")

  return (
    <div className="space-y-6">
      <form ref={setRef} action={setAction} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="tier" value={tier} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="secret_clave">Clave</Label>
            <Input id="secret_clave" name="clave" placeholder="ej. openai.api_key" required />
          </div>
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(value) => setTier((value as "A" | "B") ?? "A")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A (normal)</SelectItem>
                <SelectItem value="B">B (seguridad extendida)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="secret_valor">Valor (no se vuelve a mostrar)</Label>
            <Input id="secret_valor" name="valor" type="password" placeholder="Pega el secreto aquí" required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="secret_etiqueta">Etiqueta (opcional)</Label>
            <Input id="secret_etiqueta" name="etiqueta" placeholder="ej. aesgcm:v1:tier:B" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={setState} />
          <SubmitButton label="Guardar secreto" pendingLabel="Guardando..." />
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Secretos registrados</h3>
          <FormStatusMessage state={deleteState} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead className="hidden md:table-cell">Etiqueta</TableHead>
                  <TableHead className="hidden md:table-cell">Versión</TableHead>
                  <TableHead className="hidden lg:table-cell">Actualizado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No hay secretos (aún).
                    </TableCell>
                  </TableRow>
                ) : (
                  secrets.map((item) => (
                    <TableRow key={item.clave}>
                      <TableCell className="font-mono text-xs">{item.clave}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.etiqueta ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.version}</TableCell>
                      <TableCell className="hidden lg:table-cell">{item.actualizado_en ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <form action={deleteAction}>
                          <input type="hidden" name="tenant_id" value={tenantId} />
                          <input type="hidden" name="clave" value={item.clave} />
                          <Button type="submit" variant="destructive" size="sm">
                            Eliminar
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
