"use client"

import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { Textarea } from "@/components/ui/textarea"
import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"

type FeatureConfig = Record<string, (Record<string, unknown> & { enabled?: boolean }) | null>

export function TenantVariablesConfigPanel({ data }: { data: TenantScopedSettings | null }) {
  const features = (data?.config?.features ?? {}) as FeatureConfig
  const [featureState, setFeatureState] = useState<Record<string, boolean>>(() =>
    Object.entries(features).reduce((acc, [key, value]) => {
      acc[key] = Boolean(value?.enabled)
      return acc
    }, {} as Record<string, boolean>),
  )
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async (featureKey: string) => {
    const nextValue = !featureState[featureKey]
    setFeatureState((prev) => ({ ...prev, [featureKey]: nextValue }))
    setMessage(null)
    setLoading(true)
    try {
      const payloadFeatures = Object.keys(featureState).reduce<Record<string, unknown>>((acc, currentKey) => {
        const base = {...(features[currentKey] ?? {}), enabled: currentKey === featureKey ? nextValue : featureState[currentKey]}
        acc[currentKey] = base
        return acc
      }, {})
      const response = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { features: payloadFeatures } }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron actualizar las variables")
      }
      setMessage({ type: "success", text: "Variables guardadas" })
    } catch (err) {
      setFeatureState((prev) => ({ ...prev, [featureKey]: !nextValue }))
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const routeSummary = useMemo(() => {
    if (!data) return []
    return data.routes.map((route) => `${route.canal}:${route.clave}`)
  }, [data])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variables del tenant</CardTitle>
        <CardDescription>Activa o desactiva características del tenant y revisa los canales explícitos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Rutas registradas</Label>
          {routeSummary.length ? (
            <div className="flex flex-wrap gap-2">
              {routeSummary.map((route) => (
                <Badge key={route} variant="outline">
                  {route}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay rutas registradas.</p>
          )}
        </div>
        <Separator />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Características disponibles</p>
          {Object.keys(features).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay variables configuradas para este tenant.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(features).map((featureKey) => (
                <Card key={featureKey} className="border">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">{featureKey}</CardTitle>
                    <CardDescription className="text-xs">
                      {`Valor actual: ${featureState[featureKey] ? "activado" : "desactivado"}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between space-x-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {Object.entries(features[featureKey] ?? {})
                          .filter(([key]) => key !== "enabled")
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(", ")}
                      </p>
                    </div>
                    <Toggle
                      aria-label={`Alternar ${featureKey}`}
                      pressed={featureState[featureKey]}
                      onPressedChange={() => void handleToggle(featureKey)}
                      disabled={loading}
                    >
                      {featureState[featureKey] ? "Activo" : "Inactivo"}
                    </Toggle>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
        <Separator />
        <div className="space-y-2">
          <Label htmlFor="raw-config">Configuración raw</Label>
          <Textarea
            id="raw-config"
            value={JSON.stringify(data?.config ?? {}, null, 2)}
            readOnly
            className="font-mono text-xs"
            rows={6}
          />
        </div>
      </CardContent>
    </Card>
  )
}
