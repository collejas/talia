import { redirect } from "next/navigation"

import { callCrmApi } from "@/lib/api/crm"
import { OnboardingStepShell } from "./onboarding-step-shell"
import { OnboardingSummary } from "./onboarding-summary"

type OnboardingPageData = {
  porcentaje: number
  completados: number
  total: number
  paso_actual: string | null
  ultimo_paso: string | null
  completado: boolean
  requiere_onboarding: boolean
  pasos: Array<{
    id: string
    titulo: string
    estado: "completado" | "en_progreso" | "pendiente"
    completado: boolean
  }>
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function OnboardingPage() {
  const response = await callCrmApi<OnboardingPageData>("/tenant/me/onboarding", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) {
    redirect("/auth/login?redirectTo=%2Fonboarding")
  }
  const summaryStep = { id: "resumen", titulo: "Resumen", estado: "en_progreso" as const, completado: response.data.completado }
  const steps = [summaryStep, ...response.data.pasos]
  return <OnboardingStepShell step={summaryStep} steps={steps} porcentaje={response.data.porcentaje}><OnboardingSummary steps={response.data.pasos} /></OnboardingStepShell>
}
