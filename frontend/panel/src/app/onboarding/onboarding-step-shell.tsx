"use client"

import { ReactNode, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Step = { id: string; titulo: string; completado: boolean; estado: string }

export function OnboardingStepShell({
  step,
  steps,
  porcentaje,
  children,
}: {
  step: Step
  steps: Step[]
  porcentaje?: number
  children: ReactNode
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const index = steps.findIndex((item) => item.id === step.id)
  const previous = index > 0 ? steps[index - 1] : null
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : step.id !== "resumen" ? steps[0] : null
  const percentage = porcentaje ?? Math.round(((index + 1) / Math.max(steps.length, 1)) * 100)

  useEffect(() => {
    if (step.id === "resumen") return
    void fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ultimo_paso: step.id }),
    })
  }, [step.id])

  const go = async (destination: string) => {
    setSaving(true)
    if (step.id !== "resumen") {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ultimo_paso: step.id }),
      }).catch(() => undefined)
    }
    router.push(destination)
  }

  const stepLabel = useMemo(() => step.id === "resumen" ? "Resumen" : `Paso ${index} de ${steps.length - 1}`, [index, step.id, steps.length])

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-6 md:py-10">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Configuración inicial</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Configura tu organización</h1>
          </div>
          <button className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => void go("/dashboard?from_onboarding=1")}>
            Ir al dashboard por ahora
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span>{stepLabel}</span>
              <span className="font-semibold">{percentage}%</span>
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
            </div>
            <nav aria-label="Pasos de configuración" className="space-y-1">
              {steps.map((item, itemIndex) => (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${item.id === step.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                  onClick={() => void go(`/onboarding/${item.id}`)}
                  disabled={saving}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
                    {item.completado ? "✓" : itemIndex + 1}
                  </span>
                  <span className="truncate">{item.titulo}</span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="min-w-0 rounded-xl border bg-background p-5 shadow-sm md:p-8">
            <div className="mb-6 border-b pb-5">
              <p className="text-sm font-medium text-primary">{stepLabel}</p>
              <h2 className="mt-1 text-2xl font-semibold">{step.titulo}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Guarda tus cambios. Puedes continuar después sin perder el avance.</p>
            </div>
            {children}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={!previous || saving} onClick={() => previous && void go(`/onboarding/${previous.id}`)}>
                Anterior
              </button>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={saving} onClick={() => void go("/dashboard?from_onboarding=1")}>
                  Salir al dashboard
                </button>
                <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={!next || saving} onClick={() => next && void go(`/onboarding/${next.id}`)}>
                  {next ? "Continuar" : "Ver resumen"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
