"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { updateTenantProspeccionLimitsAction, type CrudActionState } from "./actions"

export type TenantProspeccionLimits = {
  tenant_id: string
  plan: { id: string; code: string; name: string }
  required_contact_mode: "any" | "phone" | "email" | "both"
  plan_credits_month: number
  plan_denue_raw_results_month: number
  credits_month_override?: number | null
  denue_raw_results_month_override?: number | null
  effective_credits_month: number
  effective_denue_raw_results_month: number
  override_reason?: string | null
  usage: {
    period_start?: string | null
    period_end?: string | null
    credits_limit: number
    credits_consumed: number
    credits_remaining: number
    raw_results_limit: number
    raw_results_consumed: number
    raw_results_remaining: number
  }
}

const INITIAL_STATE: CrudActionState = { status: "idle" }
const numberFormat = new Intl.NumberFormat("es-MX")

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? "Guardando…" : "Guardar configuración"}</Button>
}

export function TenantProspeccionLimitsCard({
  tenantId,
  settings,
}: {
  tenantId: string
  settings: TenantProspeccionLimits
}) {
  const [state, action] = useActionState(updateTenantProspeccionLimitsAction, INITIAL_STATE)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospección DENUE</CardTitle>
        <CardDescription>
          Hereda los límites de {settings.plan.name}. Usa excepciones sólo cuando exista un acuerdo comercial
          particular.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-6">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Créditos efectivos</p>
              <p className="text-2xl font-semibold">{numberFormat.format(settings.effective_credits_month)}</p>
              <p className="text-xs text-muted-foreground">
                Plan: {numberFormat.format(settings.plan_credits_month)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Créditos usados / disponibles</p>
              <p className="text-2xl font-semibold">
                {numberFormat.format(settings.usage.credits_consumed)} /{" "}
                {numberFormat.format(settings.usage.credits_remaining)}
              </p>
              <p className="text-xs text-muted-foreground">Periodo mensual activo</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Resultados crudos efectivos</p>
              <p className="text-2xl font-semibold">
                {numberFormat.format(settings.effective_denue_raw_results_month)}
              </p>
              <p className="text-xs text-muted-foreground">
                Usados: {numberFormat.format(settings.usage.raw_results_consumed)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="required_contact_mode">Contacto mínimo para guardar</Label>
            <select
              id="required_contact_mode"
              name="required_contact_mode"
              defaultValue={settings.required_contact_mode}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="any">Correo o teléfono</option>
              <option value="phone">Teléfono obligatorio</option>
              <option value="email">Correo obligatorio</option>
              <option value="both">Correo y teléfono obligatorios</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Cada prospecto nuevo guardado consume 1 crédito. El criterio sólo determina qué registros califican.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="credits_month_override">Excepción de créditos mensuales</Label>
              <Input
                id="credits_month_override"
                name="credits_month_override"
                type="number"
                min={0}
                step={1}
                defaultValue={settings.credits_month_override ?? ""}
                placeholder={`Heredar ${numberFormat.format(settings.plan_credits_month)}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="denue_raw_results_month_override">Excepción de resultados crudos</Label>
              <Input
                id="denue_raw_results_month_override"
                name="denue_raw_results_month_override"
                type="number"
                min={0}
                step={1}
                defaultValue={settings.denue_raw_results_month_override ?? ""}
                placeholder={`Heredar ${numberFormat.format(settings.plan_denue_raw_results_month)}`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo de la excepción</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={500}
              defaultValue={settings.override_reason ?? ""}
              placeholder="Ej. ampliación contratada por 3 meses"
            />
            <p className="text-xs text-muted-foreground">
              Deja ambos campos de excepción vacíos para volver a heredar el plan. El motivo es obligatorio cuando
              existe una excepción.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <SubmitButton />
            {state.status === "success" ? (
              <p className="text-sm text-emerald-700">{state.message}</p>
            ) : null}
            {state.status === "error" ? <p className="text-sm text-destructive">{state.message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
