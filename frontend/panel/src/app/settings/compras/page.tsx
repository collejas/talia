import { redirect } from "next/navigation"
import { requireTenantModuleEnabled } from "@/lib/settings/module-flags"

export default async function SettingsComprasRedirectPage() {
  await requireTenantModuleEnabled("productos")
  redirect("/compras")
}
