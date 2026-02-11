import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { hasPermission } from "@/lib/auth/permissions"

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const allowed = await hasPermission("settings.view")
  const manage = await hasPermission("settings.manage")
  if (!allowed && !manage) {
    redirect("/unauthorized")
  }
  return children
}
