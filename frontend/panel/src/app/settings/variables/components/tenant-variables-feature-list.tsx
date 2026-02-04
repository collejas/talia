"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { formatApiError } from "@/app/settings/variables/utils/format-error"

type FeatureConfig = Record<string, Record<string, unknown> | null>

type Props = {
  features: FeatureConfig
}

export function TenantFeatureToggleList({ features }: Props) {
  const [featureState, setFeatureState] = useState<Record<string, boolean>>(() =>
    Object.entries(features).reduce<Record<string, boolean>>((acc, [key, value]) => {
      acc[key] = Boolean(value?.enabled)
      return acc
    }, {}),
  )
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async (featureKey: string) => {
    const nextValue = !featureState[featureKey]
    setFeatureState((prev) => ({ ...prev, [featureKey]: nextValue }))
    setMessage(null)
    setLoading(true)
    try {
      const response = await fetch("/api/settings/variables/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            features: {
              [featureKey]: { ...(features[featureKey] ?? {}), enabled: nextValue },
            },
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        const errorMessage = formatApiError((payload as { error?: unknown })?.error) ?? "No se pudo actualizar el feature"
        throw new Error(errorMessage)
      }
      setMessage({ type: "success", text: `Feature ${featureKey} ${nextValue ? "activado" : "desactivado"}` })
    } catch (err) {
      setFeatureState((prev) => ({ ...prev, [featureKey]: !nextValue }))
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  if (!Object.keys(features).length) {
    return (
      <div className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">
        No hay flags de configuración disponibles para este tenant.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.keys(features).map((featureKey) => (
          <Badge key={featureKey} variant={featureState[featureKey] ? "secondary" : "outline"}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{featureKey}</span>
              <Toggle
                pressed={Boolean(featureState[featureKey])}
                onPressedChange={() => void handleToggle(featureKey)}
                disabled={loading}
              >
                {featureState[featureKey] ? "Activo" : "Inactivo"}
              </Toggle>
            </div>
          </Badge>
        ))}
      </div>
      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
