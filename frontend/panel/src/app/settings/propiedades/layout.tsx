import type { Metadata } from "next"
import type { ReactNode } from "react"

import { requireTenantModuleEnabled } from "@/lib/settings/module-flags"

export const metadata: Metadata = {
  title: "Propiedades inmobiliarias",
}

export default async function SettingsPropiedadesLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireTenantModuleEnabled("propiedades")
  return <>{children}</>
}
