"use client"

import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProspeccionUsageResponse } from "@/lib/prospeccion/prospectos-client"
import { cn } from "@/lib/utils"

const numberFormatter = new Intl.NumberFormat("es-MX")

function percentage(consumed: number, limit: number): number {
  if (limit <= 0) return 100
  return Math.min(Math.max((consumed / limit) * 100, 0), 100)
}

function accessStatusPresentation(status?: string | null) {
  if (status === "grace") {
    return { label: "Acceso en gracia", className: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300", icon: AlertTriangle }
  }
  if (status === "internal_free") {
    return { label: "Acceso interno", className: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300", icon: CheckCircle2 }
  }
  if (status !== "active") {
    return { label: "Acceso bloqueado o en revisión", className: "border-destructive/40 bg-destructive/5 text-destructive", icon: ShieldAlert }
  }
  return { label: "Acceso activo", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", icon: CheckCircle2 }
}

function UsageMeter({
  label,
  consumed,
  limit,
  remaining,
}: {
  label: string
  consumed: number
  limit: number
  remaining: number
}) {
  const usedPercentage = percentage(consumed, limit)
  const warningLevel = usedPercentage >= 100 ? "critical" : usedPercentage >= 90 ? "high" : usedPercentage >= 80 ? "medium" : null

  return (
    <div className="space-y-2 rounded-lg border bg-background/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {numberFormatter.format(consumed)} utilizados de {numberFormatter.format(limit)}
          </p>
        </div>
        <p className="text-sm font-semibold">{numberFormatter.format(remaining)} disponibles</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(consumed, limit)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            warningLevel === "critical"
              ? "bg-destructive"
              : warningLevel === "high"
                ? "bg-orange-500"
                : warningLevel === "medium"
                  ? "bg-amber-500"
                  : "bg-primary",
          )}
          style={{ width: `${usedPercentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{usedPercentage.toFixed(usedPercentage > 0 && usedPercentage < 1 ? 2 : 0)}% utilizado</span>
        {warningLevel ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {warningLevel === "critical" ? "Límite alcanzado" : "Consumo elevado"}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function ProspeccionUsageSummary({
  usage,
  loading,
  error,
  onRefresh,
}: {
  usage: ProspeccionUsageResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  return (
    <Card>
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Uso mensual de prospección</CardTitle>
          <CardDescription>
            Medición del tenant actual. Las búsquedas cuentan resultados crudos y sólo los prospectos nuevos guardados consumen créditos.
          </CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {!usage && loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : null}
        {usage ? (
          <div className="space-y-4">
            {(() => {
              const access = accessStatusPresentation(usage.access_status)
              const AccessIcon = access.icon
              return (
                <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", access.className)}>
                  <AccessIcon className="h-4 w-4" />
                  <span className="font-medium">{access.label}</span>
                  <span className="text-xs opacity-80">Estado comercial: {usage.access_status || "sin configurar"}</span>
                </div>
              )
            })()}
            <div className="grid gap-3 md:grid-cols-2">
              <UsageMeter
                label="Créditos de prospección"
                consumed={usage.credits.consumed}
                limit={usage.credits.limit}
                remaining={usage.credits.remaining}
              />
              <UsageMeter
                label="Resultados crudos GobMX"
                consumed={usage.raw_results.consumed}
                limit={usage.raw_results.limit}
                remaining={usage.raw_results.remaining}
              />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Plan: <strong className="font-medium text-foreground">{usage.plan.name || usage.plan.code || "Sin nombre"}</strong>
              </span>
              <span>
                Periodo:{" "}
                <strong className="font-medium text-foreground">
                  {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(usage.period.start))}
                  {" – "}
                  {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(usage.period.end))}
                </strong>
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
