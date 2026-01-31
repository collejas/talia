"use client"

import { useActionState, useEffect, useRef, useState } from "react"
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
  updateTenantConfigAction,
  updateWebchatSettingsAction,
  validateTenantAction,
} from "./actions"

const INITIAL_CRUD_STATE: CrudActionState = { status: "idle" }

function FormStatusMessage({ state }: { state: CrudActionState }) {
  if (state.status === "idle") return null
  if (state.status === "success") {
    return (
      <p className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
        {state.message ?? "Cambios guardados."}
      </p>
    )
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.message ?? "No se pudo completar la acción."}
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
  const [state, formAction] = useActionState(updateTenantConfigAction, INITIAL_CRUD_STATE)
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

type WebchatInitialValues = {
  enabled?: boolean
  assistant_id?: string
  prompt_version?: string
  inactivity_hours?: number
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

export function TenantWebchatSettings({
  tenantId,
  initialValues,
}: {
  tenantId: string
  initialValues: WebchatInitialValues
}) {
  const [state, formAction] = useActionState(updateWebchatSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(validateTenantAction, INITIAL_CRUD_STATE)

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
            <Label htmlFor="webchat_inactivity_hours">inactivity_hours</Label>
            <Input
              id="webchat_inactivity_hours"
              name="webchat_inactivity_hours"
              type="number"
              min={0}
              defaultValue={initialValues.inactivity_hours ?? ""}
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
                    validateState.report.missing_routes.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x) => <li key={x}>{x}</li>)}
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
}: {
  tenantId: string
  initialValues: CalendarInitialValues
}) {
  const [state, formAction] = useActionState(updateCalendarSettingsAction, INITIAL_CRUD_STATE)
  const [validateState, validateAction] = useActionState(validateTenantAction, INITIAL_CRUD_STATE)

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calendar_resource_id">calendar.resource_id</Label>
          <Input
            id="calendar_resource_id"
            name="calendar_resource_id"
            placeholder="uuid del recurso (Supabase)"
            defaultValue={initialValues.calendar_resource_id ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Se refiere a <code>calendar_resources.id</code> que expone slots.
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
        <input type="hidden" name="scope" value="webchat" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Validación</h3>
            <p className="text-xs text-muted-foreground">Revisa faltantes de routing/config/secretos.</p>
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
                    validateState.report.missing_routes.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_config.length ? (
                    validateState.report.missing_config.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
                <ul className="list-disc pl-5">
                  {validateState.report.missing_secrets.length ? (
                    validateState.report.missing_secrets.map((x) => <li key={x}>{x}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
              {validateState.report.notes.length ? (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <ul className="list-disc pl-5">
                    {validateState.report.notes.map((x) => <li key={x}>{x}</li>)}
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

export function TenantRoutingManager({ tenantId, routes }: { tenantId: string; routes: RouteItem[] }) {
  const { state: createState, formAction: createAction, formRef: createRef } = useCrudForm(createTenantRouteAction)
  const { state: deleteState, formAction: deleteAction } = useCrudForm(deleteTenantRouteAction)

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
  const { state: setState, formAction: setAction, formRef: setRef } = useCrudForm(setTenantSecretAction)
  const { state: deleteState, formAction: deleteAction } = useCrudForm(deleteTenantSecretAction)
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
