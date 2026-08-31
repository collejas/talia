"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type OnboardingStep = {
  id: string
  titulo: string
  estado: "completado" | "en_progreso" | "pendiente"
  completado: boolean
}

type OnboardingProgressData = {
  porcentaje: number
  completados: number
  total: number
  paso_actual: string | null
  ultimo_paso: string | null
  completado: boolean
  requiere_onboarding: boolean
  pasos: OnboardingStep[]
}

export function OnboardingProgress({ initialProgress }: { initialProgress: OnboardingProgressData }) {
  const router = useRouter()
  const [progress, setProgress] = useState(initialProgress)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingStep, setCheckingStep] = useState<string | null>(null)
  const [checkMessages, setCheckMessages] = useState<Record<string, string>>({})

  async function saveChoice(field: "webchat_decision" | "voz_decision", value: "usar" | "no_usar") {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      const data = (await response.json()) as OnboardingProgressData & { error?: string }
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la decisión")
      setProgress(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la decisión")
    } finally {
      setSaving(false)
    }
  }

  async function reviewStep(stepId: string) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ultimo_paso: stepId }),
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "No se pudo guardar el avance")
      }
      router.push(`/onboarding/${stepId}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el paso")
      setSaving(false)
    }
  }

  async function checkStep(stepId: string) {
    const scopeByStep: Record<string, string> = {
      webchat: "webchat",
      whatsapp: "whatsapp",
      voz: "twilio",
      agenda: "calendar",
      correo: "mail",
    }
    const scope = scopeByStep[stepId]
    if (!scope) {
      setCheckMessages((current) => ({ ...current, [stepId]: "Completa este paso desde su formulario." }))
      return
    }
    setCheckingStep(stepId)
    setError(null)
    try {
      const response = await fetch("/api/settings/variables/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })
      const data = (await response.json()) as {
        missing_routes?: string[]
        missing_config?: string[]
        missing_secrets?: string[]
        error?: string
      }
      if (!response.ok) throw new Error(data.error || "No se pudo comprobar el paso")
      const pending = (data.missing_routes?.length || 0) + (data.missing_config?.length || 0) + (data.missing_secrets?.length || 0)
      setCheckMessages((current) => ({
        ...current,
        [stepId]: pending ? "La revisión encontró elementos pendientes." : "Este paso está listo.",
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo comprobar el paso")
    } finally {
      setCheckingStep(null)
    }
  }

  const stepHelp: Record<string, string> = {
    webchat: "Si no lo necesitas, indícalo y este paso quedará resuelto.",
    voz: "Puedes dejar esta función pendiente o indicar que no la utilizarás.",
  }

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-10">
      <section className="mx-auto max-w-3xl rounded-xl border bg-background p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-muted-foreground">Configuración inicial</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Configura tu organización</h1>
        <p className="mt-2 text-muted-foreground">Puedes guardar tus cambios y continuar después.</p>

        <div className="mt-8">
          <div className="flex items-center justify-between text-sm">
            <span>{progress.completados} de {progress.total} pasos completados</span>
            <span className="font-semibold">{progress.porcentaje}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.porcentaje}%` }} />
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {progress.pasos.map((step) => (
            <div key={step.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">{step.completado ? "✓" : "✕"}</span>
                  <span className="font-medium">{step.titulo}</span>
                </div>
                {step.completado && <span className="text-sm text-muted-foreground">Completado</span>}
              </div>
              {stepHelp[step.id] && !step.completado && (
                <p className="mt-2 text-sm text-muted-foreground">{stepHelp[step.id]}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {step.id !== "organizacion" && (
                  <button
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={saving || checkingStep !== null}
                    onClick={() => void checkStep(step.id)}
                  >
                    {checkingStep === step.id ? "Comprobando…" : "Comprobar"}
                  </button>
                )}
                {step.completado ? (
                  <button
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void reviewStep(step.id)}
                  >
                    Revisar paso
                  </button>
                ) : null}
                {!step.completado && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(step.id === "webchat" || step.id === "voz") && (
                    <button
                      className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void saveChoice(step.id === "webchat" ? "webchat_decision" : "voz_decision", "no_usar")}
                    >
                      No lo utilizaré
                    </button>
                  )}
                  <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void reviewStep(step.id)}
                  >
                    Revisar paso
                  </button>
                </div>
                )}
              </div>
              {checkMessages[step.id] && (
                <p className="mt-2 text-sm text-muted-foreground">{checkMessages[step.id]}</p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-5 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => progress.paso_actual ? void reviewStep(progress.paso_actual) : router.push("/dashboard")} disabled={saving}>
            {progress.paso_actual ? "Continuar configuración" : "Ir al dashboard"}
          </button>
          <button className="rounded-md border px-4 py-2 text-sm" onClick={() => router.refresh()}>
            Actualizar avance
          </button>
        </div>
      </section>
    </main>
  )
}
