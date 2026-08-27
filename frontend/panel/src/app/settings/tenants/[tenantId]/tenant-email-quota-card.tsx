"use client"

import { useActionState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateTenantEmailQuotaAction, type CrudActionState } from "./actions"

type Props = {
  tenantId: string
  initialLimit: number | null
}

const initialState: CrudActionState = { status: "idle" }

export function TenantEmailQuotaCard({ tenantId, initialLimit }: Props) {
  const [state, formAction] = useActionState(updateTenantEmailQuotaAction, initialState)

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Cuota de correo <Badge variant="outline">Administración maestra</Badge>
        </CardTitle>
        <CardDescription>
          Define la cantidad mensual incluida para este tenant. El cambio aplica al periodo actual y queda auditado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor={`email-period-limit-${tenantId}`}>Correos incluidos por mes</Label>
            <Input
              id={`email-period-limit-${tenantId}`}
              name="email_period_limit"
              type="number"
              min={0}
              max={100000000}
              step={1}
              defaultValue={initialLimit ?? 10000}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`email-quota-reason-${tenantId}`}>Motivo del ajuste</Label>
            <Input
              id={`email-quota-reason-${tenantId}`}
              name="email_quota_reason"
              placeholder="Ej. Inclusión inicial del plan"
              maxLength={500}
              required
            />
          </div>
          <Button type="submit">Guardar cuota</Button>
          {state.status === "success" ? <p className="text-sm text-emerald-600 md:col-span-3">{state.message}</p> : null}
          {state.status === "error" ? <p className="text-sm text-destructive md:col-span-3">{state.message}</p> : null}
        </form>
      </CardContent>
    </Card>
  )
}
