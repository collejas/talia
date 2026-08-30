import { redirect } from "next/navigation"

import { callCrmApi } from "@/lib/api/crm"
import { OnboardingProgress } from "./onboarding-progress"

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
    redirect("/dashboard")
  }
  if (!response.data.requiere_onboarding || response.data.completado) {
    redirect("/dashboard")
  }
  return <OnboardingProgress initialProgress={response.data} />
}
