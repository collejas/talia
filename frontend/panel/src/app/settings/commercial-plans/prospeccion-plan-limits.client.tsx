"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  type CommercialPlanActionState,
  updateProspeccionPlanLimitsAction,
} from "./actions"

type Plan = { id: string; code: string; name: string; active: boolean }
type Entitlement = {
  plan_id: string
  entitlement_key: string
  enabled: boolean
  limit_value?: number | null
}

const INITIAL_STATE: CommercialPlanActionState = { ok: true, message: "" }

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? "Guardando…" : "Guardar límites"}</Button>
}

function PlanLimitsForm({
  plan,
  credits,
  rawResults,
}: {
  plan: Plan
  credits: number
  rawResults: number
}) {
  const [state, action] = useActionState(updateProspeccionPlanLimitsAction, INITIAL_STATE)
  return (
    <form action={action} className="rounded-lg border p-4">
      <input type="hidden" name="plan_id" value={plan.id} />
      <div className="mb-4">
        <p className="font-medium">{plan.name}</p>
        <p className="text-xs text-muted-foreground">{plan.code}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`credits-${plan.id}`}>Créditos de prospección / mes</Label>
          <Input
            id={`credits-${plan.id}`}
            name="credits_month"
            type="number"
            min={0}
            step={1}
            defaultValue={credits}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`raw-${plan.id}`}>Resultados crudos DENUE / mes</Label>
          <Input
            id={`raw-${plan.id}`}
            name="denue_raw_results_month"
            type="number"
            min={0}
            step={1}
            defaultValue={rawResults}
            required
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SubmitButton />
        {state.ok && state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
        {!state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </form>
  )
}

export function ProspeccionPlanLimits({
  plans,
  entitlements,
}: {
  plans: Plan[]
  entitlements: Entitlement[]
}) {
  const valueFor = (planId: string, key: string) => {
    const item = entitlements.find(
      (row) => row.plan_id === planId && row.entitlement_key === key && row.enabled,
    )
    return Number(item?.limit_value ?? 0)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Límites mensuales de prospección por plan</CardTitle>
        <CardDescription>
          Estos valores son la base heredada. Las excepciones comerciales se configuran en la ficha de cada tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.filter((plan) => plan.active).map((plan) => (
          <PlanLimitsForm
            key={plan.id}
            plan={plan}
            credits={valueFor(plan.id, "limit.prospeccion.credits_month")}
            rawResults={valueFor(plan.id, "limit.prospeccion.denue_raw_results_month")}
          />
        ))}
      </CardContent>
    </Card>
  )
}
