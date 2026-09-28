import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Google busqueda · Prospección",
}

export default function GoogleBusquedaLegacyPage() {
  redirect("/prospeccion/busqueda?fuente=google")
}
