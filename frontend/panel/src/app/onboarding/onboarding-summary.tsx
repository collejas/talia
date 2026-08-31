"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

type Step = { id: string; titulo: string; completado: boolean; estado: string }

export function OnboardingSummary({ steps }: { steps: Step[] }) {
  const router = useRouter()
  const [checking, setChecking] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const pending = steps.find((step) => !step.completado)
  async function check(stepId: string) {
    const scope: Record<string, string> = { webchat: "webchat", whatsapp: "whatsapp", voz: "twilio", agenda: "calendar", correo: "mail" }
    if (!scope[stepId]) return
    setChecking(stepId)
    try {
      const response = await fetch("/api/settings/variables/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: scope[stepId] }) })
      const data = await response.json() as { missing_routes?: string[]; missing_config?: string[]; missing_secrets?: string[] }
      const missing = (data.missing_routes?.length ?? 0) + (data.missing_config?.length ?? 0) + (data.missing_secrets?.length ?? 0)
      setMessages((current) => ({ ...current, [stepId]: missing ? "Hay elementos pendientes de completar." : "Este paso está listo." }))
    } catch {
      setMessages((current) => ({ ...current, [stepId]: "No se pudo comprobar ahora. Inténtalo de nuevo." }))
    } finally {
      setChecking(null)
    }
  }
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">Aquí puedes consultar el estado de toda tu configuración y entrar directamente a cualquier paso.</p>
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full border text-sm">{step.completado ? "✓" : "✕"}</span>
                <div>
                  <p className="font-medium">{step.titulo}</p>
                  <p className="text-xs text-muted-foreground">{step.completado ? "Completado" : step.estado === "en_progreso" ? "Paso actual" : "Pendiente"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {step.id !== "organizacion" ? <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={checking !== null} onClick={() => void check(step.id)}>{checking === step.id ? "Comprobando…" : "Comprobar"}</button> : null}
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => router.push(`/onboarding/${step.id}`)}>{step.completado ? "Revisar" : "Configurar"}</button>
              </div>
            </div>
            {messages[step.id] ? <p className="text-sm text-muted-foreground">{messages[step.id]}</p> : null}
          </div>
        ))}
      </div>
      {pending ? <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onClick={() => router.push(`/onboarding/${pending.id}`)}>Continuar configuración</button> : null}
    </div>
  )
}
