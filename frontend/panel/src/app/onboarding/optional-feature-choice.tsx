"use client"

import { ReactNode, useState } from "react"

type Decision = "pendiente" | "usar" | "no_usar"

export function OptionalFeatureChoice({
  feature,
  initialDecision,
  children,
}: {
  feature: "Webchat" | "Voz" | "Zoom"
  initialDecision: Decision
  children: ReactNode
}) {
  const field = feature === "Webchat" ? "webchat_decision" : feature === "Voz" ? "voz_decision" : "zoom_decision"
  const [decision, setDecision] = useState<Decision>(initialDecision)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(value: Exclude<Decision, "pendiente">) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!response.ok) throw new Error("No se pudo guardar tu elección.")
      setDecision(value)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar tu elección.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/20 p-5">
        <h3 className="font-medium">¿Quieres utilizar {feature}?</h3>
        <p className="mt-1 text-sm text-muted-foreground">Puedes cambiar esta decisión después desde la configuración.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={`rounded-md px-4 py-2 text-sm ${decision === "usar" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`} disabled={saving} onClick={() => void choose("usar")}>Sí, quiero utilizarlo</button>
          <button type="button" className={`rounded-md px-4 py-2 text-sm ${decision === "no_usar" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`} disabled={saving} onClick={() => void choose("no_usar")}>No lo utilizaré</button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>
      {decision === "usar" ? children : null}
      {decision === "no_usar" ? <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">Este paso quedó resuelto porque decidiste no utilizar {feature}.</div> : null}
      {decision === "pendiente" ? <p className="text-sm text-muted-foreground">Selecciona una opción para continuar con este paso.</p> : null}
    </div>
  )
}
